"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ImageUp, Loader2, ScanLine, ShieldCheck, Trash2 } from "lucide-react";
import { usePortfolioData } from "@/components/data-provider";
import {
  applyScreenshotImport,
  buildCnNameIndex,
  candidateSecurityMatches,
  findMatchingInstrument,
  marketLabel,
  matchSecurityByName,
  normalizeSecurityName,
  normalizeSymbol,
  parseBrokerScreenshotOcr,
  preferRow,
  rankCandidatesByPrice,
  uniquePriceWinner,
  type CnSecurityEntry,
  type CnNameIndex,
  type EquityMarket,
  type RankedCnCandidate,
  type ScreenshotHoldingDraft,
} from "@/lib/portfolio-import/screenshot";

const TESSERACT_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js";
let cnDictionaryPromise: Promise<CnSecurityEntry[]> | null = null;

function loadCnSecurityDictionary(): Promise<CnSecurityEntry[]> {
  cnDictionaryPromise ??= fetch("/cn-securities.json")
    .then((response) => {
      if (!response.ok) throw new Error("证券名称字典加载失败");
      return response.json() as Promise<CnSecurityEntry[]>;
    })
    .catch((error) => {
      cnDictionaryPromise = null;
      throw error;
    });
  return cnDictionaryPromise;
}

async function fetchCandidateQuotes(codes: string[]): Promise<Map<string, number>> {
  try {
    const response = await fetch(`/api/a-quote?symbols=${codes.join(",")}`);
    if (!response.ok) return new Map();
    const payload = (await response.json()) as { quotes?: Array<{ symbol: string; price: number }> };
    return new Map((payload.quotes ?? []).map((quote) => [quote.symbol, quote.price]));
  } catch {
    return new Map();
  }
}

type CsvColumnKey = "name" | "symbol" | "quantity" | "brokerCost" | "currentPrice" | "marketValue" | "ignore";

const csvColumnOptions: Array<{ value: CsvColumnKey; label: string }> = [
  { value: "name", label: "证券名称" },
  { value: "symbol", label: "证券代码" },
  { value: "quantity", label: "持仓数量" },
  { value: "brokerCost", label: "券商成本" },
  { value: "currentPrice", label: "现价" },
  { value: "marketValue", label: "持仓市值" },
  { value: "ignore", label: "忽略此列" },
];

function detectCsvColumn(header: string): CsvColumnKey {
  const value = header.toLowerCase().replace(/\s+/g, "");
  if (/名称|名字|name/.test(value)) return "name";
  if (/代码|code|symbol/.test(value)) return "symbol";
  if (/数量|持仓量|股数|qty|quantity/.test(value) && !/成本/.test(value)) return "quantity";
  if (/成本|cost/.test(value)) return "brokerCost";
  if (/现价|最新价|市价|价格|price/.test(value) && !/市值|成本/.test(value)) return "currentPrice";
  if (/市值|marketvalue|mv/.test(value)) return "marketValue";
  return "ignore";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

async function enrichCnRows(
  sourceRows: ScreenshotHoldingDraft[],
  index: CnNameIndex,
): Promise<{ rows: ReviewRow[]; matched: number; pending: number }> {
  const rows: ReviewRow[] = [];
  let matched = 0;
  let pending = 0;
  for (const row of sourceRows) {
    if (row.symbol) {
      rows.push({ ...row, candidates: [], matchChoice: row.symbol });
      continue;
    }
    const candidates = candidateSecurityMatches(row.name, index, 8);
    if (!candidates.length) {
      rows.push({ ...row, candidates: [], matchChoice: "" });
      continue;
    }
    const quoteMap = await fetchCandidateQuotes(candidates.map((candidate) => candidate.c));
    const ranked = rankCandidatesByPrice(candidates, quoteMap, row.currentPrice);
    const nameMatch = matchSecurityByName(row.name, index);
    if (nameMatch) {
      matched += 1;
      // Adopt the dictionary's official name: it repairs OCR spelling errors
      // (胜安科技 -> 胜宏科技) and expands abbreviated display names
      // (科创半导 -> 科创半导体ETF华夏) to what the exchange actually lists.
      const officialName = nameMatch.n;
      rows.push({ ...row, symbol: nameMatch.c, name: officialName, candidates: ranked, matchChoice: nameMatch.c, warnings: [...row.warnings, `已按名称匹配代码 ${nameMatch.c}（${nameMatch.n}），请核对后导入`] });
      continue;
    }
    const priceWinner = uniquePriceWinner(ranked);
    if (priceWinner) {
      matched += 1;
      rows.push({
        ...row,
        symbol: priceWinner.c,
        name: priceWinner.distance <= 2 ? priceWinner.n : row.name,
        candidates: ranked,
        matchChoice: priceWinner.c,
        warnings: [...row.warnings, `已按名称与价格匹配代码 ${priceWinner.c}（${priceWinner.n}），请核对后导入`],
      });
      continue;
    }
    pending += 1;
    rows.push({
      ...row,
      candidates: ranked,
      warnings: [...row.warnings, "存在多个候选标的且价格无法唯一确认，请在下方选择对应标的，或明确选择按名称导入"],
    });
  }
  return { rows, matched, pending };
}

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
    const scale = image.width < 1600 ? Math.min(3, 1600 / image.width) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return file;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = "grayscale(1) contrast(1.42) saturate(0.85)";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.filter = "none";
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

type ReviewRow = ScreenshotHoldingDraft & {
  /** Candidate instruments for CN name-only rows, ranked with live prices. */
  candidates?: RankedCnCandidate[];
  /**
   * Explicit user choice: candidate code, "" for "import by name", or
   * undefined while the row still needs a decision.
   */
  matchChoice?: string;
};

export function PortfolioScreenshotImportV2() {
  const { state, save } = usePortfolioData();
  const [market, setMarket] = useState<EquityMarket>("CN");
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [rawText, setRawText] = useState("");
  const [csvHeader, setCsvHeader] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvMapping, setCsvMapping] = useState<CsvColumnKey[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("选择市场后上传券商持仓截图");
  const [recognizing, setRecognizing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const diff = useMemo(() => ({
    added: rows.filter((row) => !findMatchingInstrument(state.instruments, market, row)).length,
    updated: rows.filter((row) => Boolean(findMatchingInstrument(state.instruments, market, row))).length,
    nameOnly: rows.filter((row) => !row.symbol && !findMatchingInstrument(state.instruments, market, row)).length,
    pending: rows.filter((row) => !row.symbol && (row.candidates?.length ?? 0) > 0 && row.matchChoice === undefined).length,
    lowConfidence: rows.filter((row) => row.confidence < 80 || row.warnings.length > 0).length,
  }), [market, rows, state.instruments]);

  const updateRow = <K extends keyof ReviewRow>(index: number, key: K, value: ReviewRow[K]) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
    setMessage("");
  };

  const chooseFiles = (selected: File[]) => {
    setFiles(selected);
    setRows([]);
    setRawText("");
    setCsvHeader([]);
    setCsvRows([]);
    setCsvMapping([]);
    setProgress(0);
    setError("");
    setMessage("");
    setStatus(selected.length ? `已选择 ${selected.length} 张${marketLabel(market)}截图` : "选择市场后上传券商持仓截图");
  };

  const handleCsvFile = (file?: File) => {
    if (!file) return;
    setError("");
    setMessage("");
    setRows([]);
    setFiles([]);
    setRawText("");
    setProgress(0);
    setStatus("正在解析 CSV 表头…");
    file.arrayBuffer()
      .then((buffer) => {
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch {
          text = new TextDecoder("gbk").decode(buffer);
        }
        const parsed = parseCsv(text);
        const header = parsed[0] ?? [];
        setCsvHeader(header);
        setCsvRows(parsed.slice(1));
        setCsvMapping(header.map((cell) => detectCsvColumn(cell)));
        setStatus(`已解析 CSV：${parsed.length - 1} 行数据，请核对列映射`);
      })
      .catch(() => setStatus("CSV 解析失败，请检查文件编码"));
  };

  const parseCsvRows = async () => {
    if (!csvRows.length) {
      setError("CSV 没有可解析的数据行。");
      return;
    }
    const pick = (row: string[], key: CsvColumnKey): string => {
      const index = csvMapping.findIndex((item) => item === key);
      return index >= 0 && index < row.length ? row[index] : "";
    };
    const numeric = (value: string): number => {
      const parsed = Number(value.replace(/[^\d.-]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const rows: ScreenshotHoldingDraft[] = [];
    for (const line of csvRows) {
      const name = pick(line, "name");
      const symbolRaw = pick(line, "symbol");
      if (!name && !symbolRaw) continue;
      const quantity = numeric(pick(line, "quantity"));
      const brokerCost = numeric(pick(line, "brokerCost"));
      const currentPriceRaw = numeric(pick(line, "currentPrice"));
      const marketValueRaw = numeric(pick(line, "marketValue"));
      rows.push({
        symbol: normalizeSymbol(symbolRaw, market),
        name,
        quantity,
        brokerCost,
        currentPrice: currentPriceRaw > 0 ? currentPriceRaw : null,
        marketValue: marketValueRaw > 0 ? marketValueRaw : null,
        confidence: 100,
        warnings: [],
      });
    }
    if (!rows.length) {
      setError("CSV 中没有解析出持仓行，请检查列映射。");
      return;
    }
    setRecognizing(true);
    setStatus("正在核对 CSV 持仓并匹配标的…");
    let reviewRows: ReviewRow[] = rows;
    let dictionaryMatched = 0;
    let pendingChoice = 0;
    if (market === "CN") {
      try {
        const entries = await loadCnSecurityDictionary();
        const index = buildCnNameIndex(entries);
        const enriched = await enrichCnRows(rows, index);
        reviewRows = enriched.rows;
        dictionaryMatched = enriched.matched;
        pendingChoice = enriched.pending;
      } catch {
        // dictionary unavailable: keep rows as-is
      }
    }
    setRows(reviewRows);
    setProgress(100);
    const parts = [`已解析 ${reviewRows.length} 条${marketLabel(market)}持仓`];
    if (dictionaryMatched) parts.push(`${dictionaryMatched} 条已匹配代码`);
    if (pendingChoice) parts.push(`${pendingChoice} 条需确认匹配标的`);
    setStatus(parts.join("，"));
    setRecognizing(false);
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
        const pageModes = market === "US" ? ["6", "11"] : ["6", "4"];
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
        if (!existing || preferRow(existing, row)) deduplicated.set(key, row);
      }
      let parsedRows = [...deduplicated.values()];
      const warnings = parsedResults.flatMap((result) => result.warnings);
      let dictionaryMatched = 0;
      let pendingChoice = 0;
      if (market === "CN") {
        try {
          const entries = await loadCnSecurityDictionary();
          const index = buildCnNameIndex(entries);
          const enriched = await enrichCnRows(parsedRows, index);
          parsedRows = enriched.rows;
          dictionaryMatched = enriched.matched;
          pendingChoice = enriched.pending;
        } catch {
          // dictionary unavailable: keep name-only rows, import still works
        }
      }
      setRawText(combined);
      setRows(parsedRows);
      setProgress(100);
      if (!parsedRows.length) {
        setStatus("未识别到完整持仓行");
        setError([...new Set(warnings)].join("；"));
      } else {
        const parts = [`已识别 ${parsedRows.length} 条${marketLabel(market)}持仓`];
        if (dictionaryMatched) parts.push(`${dictionaryMatched} 条已匹配代码`);
        if (pendingChoice) parts.push(`${pendingChoice} 条需确认匹配标的`);
        if (!dictionaryMatched && !pendingChoice) parts.push("代码缺失项已自动转为名称匹配");
        setStatus(`${parts.join("，")}`);
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
    const pendingRows = rows.filter((row) => !row.symbol && (row.candidates?.length ?? 0) > 0 && row.matchChoice === undefined);
    if (pendingRows.length) {
      setError(`以下 ${pendingRows.length} 条持仓尚未确认匹配标的：${pendingRows.map((row) => row.name).join("、")}。请在“匹配标的”下拉框中选择对应标的，或明确选择“按名称导入”。`);
      return;
    }
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">第二步（备选）</p>
          <h2 className="mt-1 text-xl font-black">或上传 CSV 批量导入</h2>
          <p className="mt-1 text-sm text-slate-500">支持券商导出的持仓 CSV；表头自动识别列，可手动调整映射，识别后同样进入逐条核对。</p>
        </div>
        <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 px-4 text-center hover:border-cyan-500 dark:border-slate-700">
          <span className="text-sm font-bold">选择 CSV 文件</span>
          <span className="mt-1 text-xs text-slate-500">{csvRows.length ? `已读取 ${csvRows.length} 行` : "支持 UTF-8 / GBK 编码"}</span>
          <input className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => handleCsvFile(event.target.files?.[0])} />
        </label>
        {csvHeader.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-bold">列映射（已自动识别，可调整）</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {csvHeader.map((header, columnIndex) => (
                <label key={`${header}-${columnIndex}`} className="grid gap-1 text-xs font-bold">
                  {header || `第 ${columnIndex + 1} 列`}
                  <select
                    className={fieldClass}
                    value={csvMapping[columnIndex] ?? "ignore"}
                    onChange={(event) => setCsvMapping((current) => current.map((item, index) => index === columnIndex ? event.target.value as CsvColumnKey : item))}
                  >
                    {csvColumnOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <button type="button" className={`${actionClass} mt-4 w-full sm:w-auto`} disabled={recognizing} onClick={() => void parseCsvRows()}>
              {recognizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              解析为持仓行并进入核对
            </button>
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">第三步</p>
            <h2 className="mt-1 text-xl font-black">核对识别结果</h2>
            <p className="mt-1 text-sm text-slate-500">预计新增 {diff.added} 条、更新 {diff.updated} 条{diff.pending ? `、待确认匹配 ${diff.pending} 条` : ""}、名称待匹配 {diff.nameOnly} 条、需重点复核 {diff.lowConfidence} 条。截图之外的现有持仓不会自动删除或清仓。</p>
          </div>
          <div className="space-y-3">
            {rows.map((row, index) => (
              <article key={`${row.symbol || normalizeSecurityName(row.name)}-${index}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{marketLabel(market)} · 第 {index + 1} 条</p>
                    <p className={`text-xs ${!row.symbol && (row.candidates?.length ?? 0) > 0 && row.matchChoice === undefined ? "font-bold text-amber-700" : "text-slate-500"}`}>
                      识别置信度 {row.confidence}% · {findMatchingInstrument(state.instruments, market, row) ? "已匹配平台标的" : row.symbol ? "将按代码新建" : !row.symbol && (row.candidates?.length ?? 0) > 0 && row.matchChoice === undefined ? "待确认匹配标的" : "将按名称安全导入"}
                    </p>
                  </div>
                  <button type="button" aria-label={`移除第 ${index + 1} 条识别结果`} className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {market === "CN" && (row.candidates?.length ?? 0) > 0 && (
                  <label className="mb-3 grid gap-1 text-xs font-bold">
                    匹配标的
                    <select
                      className={fieldClass}
                      value={row.matchChoice ?? row.symbol ?? "__pending__"}
                      onChange={(event) => {
                        const value = event.target.value;
                        const candidate = row.candidates?.find((item) => item.c === value);
                        updateRow(index, "matchChoice", value);
                        updateRow(index, "symbol", value);
                        if (candidate) updateRow(index, "name", candidate.n);
                      }}
                    >
                      {row.matchChoice === undefined && !row.symbol && <option value="__pending__" disabled>请选择匹配标的（必选）</option>}
                      {row.candidates?.map((candidate) => (
                        <option key={candidate.c} value={candidate.c}>
                          {candidate.c} {candidate.n}{candidate.price !== null ? ` · 现价 ${candidate.price}` : ""}{candidate.priceDiffPct !== null && candidate.priceDiffPct <= 3 ? " · 与截图价吻合" : ""}
                        </option>
                      ))}
                      {row.symbol && !row.candidates?.some((candidate) => candidate.c === row.symbol) && <option value={row.symbol}>手动代码 {row.symbol}</option>}
                      <option value="">按名称导入（不匹配代码）</option>
                    </select>
                  </label>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="grid gap-1 text-xs font-bold">证券代码（可选）<input className={fieldClass} value={row.symbol} placeholder="截图没有就留空" onChange={(event) => { const value = event.target.value.toUpperCase(); updateRow(index, "symbol", value); updateRow(index, "matchChoice", value); }} /></label>
                  <label className="grid gap-1 text-xs font-bold">证券名称<input className={fieldClass} value={row.name} onChange={(event) => updateRow(index, "name", event.target.value)} /></label>
                  <label className="grid gap-1 text-xs font-bold">持仓数量<input className={fieldClass} type="number" step="any" value={row.quantity} onChange={(event) => updateRow(index, "quantity", numeric(event.target.value))} /></label>
                  <label className="grid gap-1 text-xs font-bold">券商成本<input className={fieldClass} type="number" step="any" value={row.brokerCost} onChange={(event) => updateRow(index, "brokerCost", numeric(event.target.value))} /></label>
                  <label className="grid gap-1 text-xs font-bold">截图现价<input className={fieldClass} type="number" step="any" value={row.currentPrice ?? ""} onChange={(event) => updateRow(index, "currentPrice", event.target.value ? numeric(event.target.value) : null)} /></label>
                  <label className="grid gap-1 text-xs font-bold">持仓市值<input className={fieldClass} type="number" step="any" value={row.marketValue ?? ""} onChange={(event) => updateRow(index, "marketValue", event.target.value ? numeric(event.target.value) : null)} /></label>
                </div>
                {row.warnings.length > 0 && <p className="mt-3 flex gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0" />{row.warnings.join("；")}</p>}
                {market === "CN" && (row.candidates?.length ?? 0) === 0 && !row.symbol && (
                  <p className="mt-2 text-xs text-slate-500">未找到与“{row.name}”匹配的证券候选；可手动填写代码，或保持按名称导入（导入后代码待匹配）。</p>
                )}
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
