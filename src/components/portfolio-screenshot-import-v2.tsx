"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ImageUp, Loader2, ScanLine, ShieldCheck, Trash2 } from "lucide-react";
import { usePortfolioData } from "@/components/data-provider";
import {
  applyScreenshotImport,
  findMatchingInstrument,
  marketLabel,
  normalizeSecurityName,
  normalizeSymbol,
  parseBrokerScreenshotOcr,
  type EquityMarket,
  type ScreenshotHoldingDraft,
} from "@/lib/portfolio-import/screenshot";

const TESSERACT_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js";
const markets: Array<{ value: EquityMarket; label: string; hint: string }> = [
  { value: "CN", label: "A股", hint: "代码不显示也能按名称导入" },
  { value: "US", label: "美股", hint: "自动合并名称与下一行代码" },
  { value: "HK", label: "港股", hint: "代码可选，优先按名称匹配" },
];

type TesseractWorker = {
  recognize: (
    image: Blob,
    options?: Record<string, unknown>,
    output?: { text?: boolean; tsv?: boolean },
  ) => Promise<{ data: { text: string; tsv?: string } }>;
  setParameters: (parameters: Record<string, string>) => Promise<void>;
  terminate: () => Promise<void>;
};

declare global {
  interface Window {
    Tesseract?: {
      createWorker: (
        languages: string,
        engineMode?: number,
        options?: { logger?: (message: { status?: string; progress?: number }) => void },
      ) => Promise<TesseractWorker>;
    };
  }
}

async function ensureTesseractLoaded(): Promise<void> {
  if (window.Tesseract) return;
  const existing = document.querySelector<HTMLScriptElement>("script[data-feige-tesseract-v2]");
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("OCR 组件加载失败")), { once: true });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_SCRIPT;
    script.async = true;
    script.dataset.feigeTesseractV2 = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("OCR 组件加载失败，请检查网络后重试"));
    document.head.appendChild(script);
  });
}

async function enhanceScreenshotForOcr(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);
  try {
    const scale = image.width < 1200 ? Math.min(2, 1200 / image.width) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return file;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = "grayscale(1) contrast(1.28)";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/png"));
  } finally {
    image.close();
  }
}

function numeric(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const fieldClass = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none focus:border-cyan-500 dark:border-slate-700";
const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-400 dark:text-slate-950";

export function PortfolioScreenshotImportV2() {
  const { state, save } = usePortfolioData();
  const [market, setMarket] = useState<EquityMarket>("CN");
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ScreenshotHoldingDraft[]>([]);
  const [rawText, setRawText] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("选择市场后上传券商持仓截图");
  const [recognizing, setRecognizing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const diff = useMemo(() => ({
    added: rows.filter((row) => !findMatchingInstrument(state.instruments, market, row)).length,
    updated: rows.filter((row) => Boolean(findMatchingInstrument(state.instruments, market, row))).length,
    nameOnly: rows.filter((row) => !row.symbol && !findMatchingInstrument(state.instruments, market, row)).length,
    lowConfidence: rows.filter((row) => row.confidence < 80 || row.warnings.length > 0).length,
  }), [market, rows, state.instruments]);

  const updateRow = <K extends keyof ScreenshotHoldingDraft>(index: number, key: K, value: ScreenshotHoldingDraft[K]) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
    setMessage("");
  };

  const chooseFiles = (selected: File[]) => {
    setFiles(selected);
    setRows([]);
    setRawText("");
    setProgress(0);
    setError("");
    setMessage("");
    setStatus(selected.length ? `已选择 ${selected.length} 张${marketLabel(market)}截图` : "选择市场后上传券商持仓截图");
  };

  const runOcr = async () => {
    if (!files.length) {
      setError("请先选择至少一张持仓截图。");
      return;
    }
    setRecognizing(true);
    setError("");
    setMessage("");
    setRows([]);
    setProgress(2);
    setStatus("正在加载本地 OCR 运行组件，首次使用会稍慢");
    let worker: TesseractWorker | null = null;
    try {
      await ensureTesseractLoaded();
      if (!window.Tesseract) throw new Error("OCR 组件未正确初始化");
      worker = await window.Tesseract.createWorker("chi_sim+eng", undefined, {
        logger: (event) => {
          if (typeof event.progress === "number") setProgress(Math.max(5, Math.min(92, Math.round(event.progress * 90))));
          if (event.status) setStatus(`OCR：${event.status}`);
        },
      });
      const parsedResults = [];
      for (let index = 0; index < files.length; index += 1) {
        setStatus(`正在增强并识别第 ${index + 1} / ${files.length} 张截图`);
        const enhanced = await enhanceScreenshotForOcr(files[index]);
        const pageModes = market === "US" ? ["6", "11"] : ["6"];
        for (const [modeIndex, pageMode] of pageModes.entries()) {
          await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: pageMode });
          if (pageModes.length > 1) setStatus(`正在进行第 ${modeIndex + 1} / ${pageModes.length} 轮兼容识别`);
          const result = await worker.recognize(enhanced, {}, { text: true, tsv: true });
          parsedResults.push(parseBrokerScreenshotOcr(result.data.text, result.data.tsv ?? "", market));
        }
      }
      const combined = parsedResults.map((result) => result.rawText).join("\n\n--- 下一张截图 ---\n\n");
      const deduplicated = new Map<string, ScreenshotHoldingDraft>();
      for (const row of parsedResults.flatMap((result) => result.rows)) {
        const symbol = normalizeSymbol(row.symbol, market);
        const key = symbol || normalizeSecurityName(row.name);
        const existing = deduplicated.get(key);
        if (!existing || row.confidence > existing.confidence) deduplicated.set(key, row);
      }
      const parsedRows = [...deduplicated.values()];
      const warnings = parsedResults.flatMap((result) => result.warnings);
      setRawText(combined);
      setRows(parsedRows);
      setProgress(100);
      if (!parsedRows.length) {
        setStatus("未识别到完整持仓行");
        setError([...new Set(warnings)].join("；"));
      } else {
        setStatus(`已识别 ${parsedRows.length} 条${marketLabel(market)}持仓，代码缺失项已自动转为名称匹配`);
      }
    } catch (ocrError) {
      setStatus("识别失败，现有持仓未改变");
      setError(ocrError instanceof Error ? ocrError.message : "OCR 识别失败");
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
      setRecognizing(false);
    }
  };

  const confirmImport = async () => {
    setError("");
    setMessage("");
    const normalizedRows = rows.map((row) => ({ ...row, symbol: row.symbol ? normalizeSymbol(row.symbol, market) : "", name: row.name.trim() }));
    if (!normalizedRows.length) {
      setError("没有可导入的识别结果。");
      return;
    }
    if (normalizedRows.some((row) => !row.name || row.quantity <= 0)) {
      setError("每条持仓都必须有证券名称，且数量必须大于0。");
      return;
    }
    try {
      await save((current) => applyScreenshotImport(current, market, normalizedRows));
      setRows(normalizedRows);
      setMessage(`已导入 ${normalizedRows.length} 条${marketLabel(market)}持仓；导入前版本已自动备份。`);
      setStatus("导入完成");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入失败，原持仓未改变");
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-900 dark:bg-cyan-950/30">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
          <div>
            <h2 className="font-black">持仓截图仅在当前浏览器识别</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">图片不会上传到本站服务器或 GitHub。只有你核对并点击“确认导入”后，结构化持仓才会写入本机 IndexedDB。</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">第一步</p>
          <h2 className="mt-1 text-xl font-black">选择截图所属市场</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="截图所属市场">
          {markets.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={market === item.value}
              className={`rounded-xl border p-3 text-left transition ${market === item.value ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-100 dark:bg-cyan-950/30" : "border-slate-200 dark:border-slate-700"}`}
              onClick={() => {
                setMarket(item.value);
                chooseFiles([]);
              }}
            >
              <span className="block font-black">{item.label}</span>
              <span className="mt-1 block text-xs text-slate-500">{item.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">第二步</p>
          <h2 className="mt-1 text-xl font-black">上传{marketLabel(market)}持仓截图并识别</h2>
          <p className="mt-1 text-sm text-slate-500">支持 PNG、JPG、WebP 和多张连续截图；证券代码可以不显示，系统会按名称识别并优先匹配已有标的。</p>
        </div>
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 px-4 text-center hover:border-cyan-500 dark:border-slate-700">
          <ImageUp className="mb-2 h-7 w-7 text-cyan-600" />
          <span className="font-bold">选择或拍摄持仓截图</span>
          <span className="mt-1 text-xs text-slate-500">{files.length ? `已选择 ${files.length} 张：${files.map((file) => file.name).join("、")}` : "图片只在本机处理"}</span>
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))}
          />
        </label>
        <button type="button" className={`${actionClass} mt-4 w-full sm:w-auto`} disabled={!files.length || recognizing} onClick={runOcr}>
          {recognizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          {recognizing ? "正在识别" : "开始识别截图"}
        </button>
        <div className="mt-4">
          <div className="mb-1 flex justify-between gap-3 text-xs text-slate-500"><span>{status}</span><span>{progress}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-cyan-500 transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
      </section>

      {rows.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">第三步</p>
            <h2 className="mt-1 text-xl font-black">核对识别结果</h2>
            <p className="mt-1 text-sm text-slate-500">预计新增 {diff.added} 条、更新 {diff.updated} 条、名称待匹配 {diff.nameOnly} 条、需重点复核 {diff.lowConfidence} 条。截图之外的现有持仓不会自动删除或清仓。</p>
          </div>
          <div className="space-y-3">
            {rows.map((row, index) => (
              <article key={`${row.symbol || normalizeSecurityName(row.name)}-${index}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{marketLabel(market)} · 第 {index + 1} 条</p>
                    <p className="text-xs text-slate-500">识别置信度 {row.confidence}% · {findMatchingInstrument(state.instruments, market, row) ? "已匹配平台标的" : row.symbol ? "将按代码新建" : "将按名称安全导入"}</p>
                  </div>
                  <button type="button" aria-label={`移除第 ${index + 1} 条识别结果`} className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="grid gap-1 text-xs font-bold">证券代码（可选）<input className={fieldClass} value={row.symbol} placeholder="截图没有就留空" onChange={(event) => updateRow(index, "symbol", event.target.value.toUpperCase())} /></label>
                  <label className="grid gap-1 text-xs font-bold">证券名称<input className={fieldClass} value={row.name} onChange={(event) => updateRow(index, "name", event.target.value)} /></label>
                  <label className="grid gap-1 text-xs font-bold">持仓数量<input className={fieldClass} type="number" step="any" value={row.quantity} onChange={(event) => updateRow(index, "quantity", numeric(event.target.value))} /></label>
                  <label className="grid gap-1 text-xs font-bold">券商成本<input className={fieldClass} type="number" step="any" value={row.brokerCost} onChange={(event) => updateRow(index, "brokerCost", numeric(event.target.value))} /></label>
                  <label className="grid gap-1 text-xs font-bold">截图现价<input className={fieldClass} type="number" step="any" value={row.currentPrice ?? ""} onChange={(event) => updateRow(index, "currentPrice", event.target.value ? numeric(event.target.value) : null)} /></label>
                  <label className="grid gap-1 text-xs font-bold">持仓市值<input className={fieldClass} type="number" step="any" value={row.marketValue ?? ""} onChange={(event) => updateRow(index, "marketValue", event.target.value ? numeric(event.target.value) : null)} /></label>
                </div>
                {row.warnings.length > 0 && <p className="mt-3 flex gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0" />{row.warnings.join("；")}</p>}
              </article>
            ))}
          </div>
          <button type="button" className={`${actionClass} mt-4 w-full sm:w-auto`} onClick={confirmImport}>
            <CheckCircle2 className="h-4 w-4" />确认导入 {rows.length} 条{marketLabel(market)}持仓
          </button>
          {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</p>}
          <details className="mt-4 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
            <summary className="cursor-pointer font-bold">查看 OCR 原始文本</summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{rawText}</pre>
          </details>
        </section>
      )}
    </div>
  );
}
