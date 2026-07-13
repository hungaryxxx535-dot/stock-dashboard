"use client";

import { useMemo, useState } from "react";
import { FileJson, Plus, ScanLine, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AShareHolding, Suggestion } from "@/data/portfolio";
import {
  clearImportedPortfolio,
  type ImportedAccountSummary,
  type ImportedPortfolioSnapshot,
  parsePortfolioOcrText,
  parsePortfolioOcrTsv,
  saveImportedPortfolio,
} from "@/lib/importedPortfolio";

const TESSERACT_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js";
const holdingTypes: AShareHolding["type"][] = ["核心仓", "趋势仓", "防守仓", "观察仓"];
const suggestions: Suggestion[] = ["持有", "观察", "分批锁盈", "谨慎", "加仓候选"];

type TesseractWorker = {
  recognize: (
    image: File,
    options?: Record<string, unknown>,
    output?: { text?: boolean; tsv?: boolean },
  ) => Promise<{ data: { text: string; tsv?: string } }>;
  terminate: () => Promise<void>;
};

declare global {
  interface Window {
    Tesseract?: { createWorker: (languages: string) => Promise<TesseractWorker> };
  }
}

type Props = {
  currentHoldings: AShareHolding[];
  currentSnapshot: ImportedPortfolioSnapshot | null;
  onApply: (snapshot: ImportedPortfolioSnapshot) => void;
  onClear: () => void;
};

const emptyAccount: ImportedAccountSummary = {
  totalAssets: 0,
  marketValue: 0,
  availableCash: 0,
  totalPnl: 0,
  todayPnl: 0,
  brokerPositionPct: 0,
};

function blankHolding(): AShareHolding {
  return {
    name: "",
    code: "",
    quantity: 0,
    costPrice: 0,
    currentPrice: 0,
    marketValue: 0,
    pnl: 0,
    type: "观察仓",
    suggestion: "观察",
    note: "截图OCR导入，需人工确认",
  };
}

async function ensureTesseractLoaded(): Promise<void> {
  if (window.Tesseract) return;
  const existing = document.querySelector<HTMLScriptElement>("script[data-feige-tesseract]");
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("OCR组件加载失败")), { once: true });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_SCRIPT;
    script.async = true;
    script.dataset.feigeTesseract = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("OCR组件加载失败，请检查网络后重试"));
    document.head.appendChild(script);
  });
}

async function getImageSize(file: File): Promise<{ width: number; height: number }> {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取截图尺寸"));
    };
    image.src = url;
  });
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeHoldings(items: AShareHolding[]): AShareHolding[] {
  const map = new Map<string, AShareHolding>();
  for (const item of items) {
    if (item.code) map.set(item.code, item);
  }
  return [...map.values()];
}

export function PortfolioScreenshotImport({ currentHoldings, currentSnapshot, onApply, onClear }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [account, setAccount] = useState<ImportedAccountSummary>(currentSnapshot?.account ?? emptyAccount);
  const [holdings, setHoldings] = useState<AShareHolding[]>(currentSnapshot?.holdings ?? []);
  const [rawText, setRawText] = useState(currentSnapshot?.rawText ?? "");
  const [status, setStatus] = useState("等待上传截图");
  const [progress, setProgress] = useState(0);
  const [recognizing, setRecognizing] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(Boolean(currentSnapshot));

  const holdingsTotal = useMemo(
    () => holdings.reduce((sum, item) => sum + Number(item.marketValue || 0), 0),
    [holdings],
  );
  const closureGap = account.marketValue > 0 ? holdingsTotal - account.marketValue : 0;
  const closureGapPct = account.marketValue > 0 ? Math.abs(closureGap) / account.marketValue : 0;

  const updateAccount = (key: keyof ImportedAccountSummary, value: string) => {
    setAccount((previous) => ({ ...previous, [key]: toNumber(value) }));
    setSaved(false);
  };

  const updateHolding = <K extends keyof AShareHolding>(index: number, key: K, value: AShareHolding[K]) => {
    setHoldings((previous) => previous.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
    setSaved(false);
  };

  const runOcr = async () => {
    if (!files.length) {
      setError("请先选择至少一张A股持仓截图。");
      return;
    }
    setRecognizing(true);
    setSaved(false);
    setError("");
    setProgress(2);
    setStatus("正在加载中文OCR组件，第一次使用会稍慢");

    let worker: TesseractWorker | null = null;
    try {
      await ensureTesseractLoaded();
      if (!window.Tesseract) throw new Error("OCR组件未正确初始化");
      setProgress(8);
      setStatus("正在加载简体中文与英文识别模型");
      worker = await window.Tesseract.createWorker("chi_sim+eng");

      const texts: string[] = [];
      const structured: AShareHolding[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setStatus(`正在识别第 ${index + 1} / ${files.length} 张截图`);
        const [{ width, height }, result] = await Promise.all([
          getImageSize(file),
          worker.recognize(file, {}, { text: true, tsv: true }),
        ]);
        texts.push(result.data.text);
        structured.push(...parsePortfolioOcrTsv(result.data.tsv ?? "", width, height, currentHoldings));
        setProgress(Math.round(10 + ((index + 1) / files.length) * 82));
      }

      const combinedText = texts.join("\n\n--- 下一张截图 ---\n\n");
      const parsed = parsePortfolioOcrText(combinedText, currentHoldings);
      const structuredHoldings = mergeHoldings(structured);
      setRawText(parsed.rawText);
      setAccount(parsed.account);
      setHoldings(structuredHoldings.length ? structuredHoldings : parsed.holdings.length ? parsed.holdings : [blankHolding()]);
      setProgress(100);
      setStatus(structuredHoldings.length ? `已按表格列识别 ${structuredHoldings.length} 只标的，请逐项核对。` : "已完成文本识别，请人工补充或校正持仓字段。");
    } catch (ocrError) {
      setError(ocrError instanceof Error ? ocrError.message : "OCR识别失败");
      setStatus("识别失败");
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
      setRecognizing(false);
    }
  };

  const applySnapshot = () => {
    setError("");
    const normalized = holdings
      .map((item) => {
        const quantity = Number(item.quantity || 0);
        const costPrice = Number(item.costPrice || 0);
        const currentPrice = Number(item.currentPrice || 0);
        const marketValue = Number(item.marketValue || 0) || (quantity > 0 && currentPrice > 0 ? quantity * currentPrice : 0);
        const pnl = Number(item.pnl || 0) || (quantity > 0 && currentPrice > 0 && costPrice !== 0 ? quantity * (currentPrice - costPrice) : 0);
        return { ...item, name: item.name.trim(), code: item.code.trim(), quantity, costPrice, currentPrice, marketValue, pnl };
      })
      .filter((item) => item.name || item.code);

    if (!normalized.length) return setError("至少保留一条持仓记录。");
    if (normalized.some((item) => !/^\d{6}$/.test(item.code) || !item.name)) return setError("每条持仓都必须填写股票名称和6位股票代码。");
    if (new Set(normalized.map((item) => item.code)).size !== normalized.length) return setError("持仓中存在重复股票代码，请合并或删除重复记录。");

    const calculatedMarketValue = normalized.reduce((sum, item) => sum + item.marketValue, 0);
    const finalMarketValue = account.marketValue || calculatedMarketValue;
    const finalTotalAssets = account.totalAssets || finalMarketValue + account.availableCash;
    const finalAccount = {
      ...account,
      marketValue: finalMarketValue,
      totalAssets: finalTotalAssets,
      brokerPositionPct: account.brokerPositionPct || (finalTotalAssets > 0 ? (finalMarketValue / finalTotalAssets) * 100 : 0),
    };
    const snapshot: ImportedPortfolioSnapshot = {
      source: "screenshot",
      importedAt: new Date().toISOString(),
      imageCount: files.length || currentSnapshot?.imageCount || 0,
      account: finalAccount,
      holdings: normalized,
      rawText,
    };
    saveImportedPortfolio(snapshot);
    onApply(snapshot);
    setAccount(finalAccount);
    setHoldings(normalized);
    setSaved(true);
    setStatus("已应用到本机作战台，刷新网页后仍会保留。");
  };

  const clearSnapshot = () => {
    clearImportedPortfolio();
    setFiles([]);
    setAccount(emptyAccount);
    setHoldings([]);
    setRawText("");
    setProgress(0);
    setSaved(false);
    setStatus("已清除截图导入数据，恢复默认持仓。");
    onClear();
  };

  const exportJson = () => {
    const snapshot: ImportedPortfolioSnapshot = {
      source: "screenshot",
      importedAt: currentSnapshot?.importedAt ?? new Date().toISOString(),
      imageCount: files.length || currentSnapshot?.imageCount || 0,
      account,
      holdings,
      rawText,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `A股持仓截图导入_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black">A股持仓截图导入</h2>
        <p className="text-sm text-slate-500">已针对平安证券/同花顺横向持仓表格优化；OCR后必须人工确认。</p>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />隐私规则</CardTitle>
          <CardDescription className="text-emerald-900">图片仅在当前浏览器识别，不上传本站服务器、不写入GitHub，也不会覆盖美股。</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5" />选择截图并识别</CardTitle>
          <CardDescription>支持多张截图；最好同时包含账户汇总和全部持仓行。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
          {files.length > 0 && <p className="text-sm text-slate-500">已选择：{files.map((file) => file.name).join("、")}</p>}
          <Button onClick={runOcr} disabled={recognizing || !files.length}><ScanLine className="mr-2 h-4 w-4" />{recognizing ? "正在识别" : "开始OCR识别"}</Button>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-500"><span>{status}</span><span>{progress}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-slate-950 transition-all" style={{ width: `${progress}%` }} /></div>
          </div>
          {error && <p className="rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
        </CardContent>
      </Card>

      {(holdings.length > 0 || rawText) && (
        <>
          <Card>
            <CardHeader><CardTitle>账户汇总核对</CardTitle><CardDescription>场外现金仍在设置页单独维护。</CardDescription></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {([
                ["totalAssets", "证券账户总资产"], ["marketValue", "证券账户总市值"], ["availableCash", "账户内可用资金"],
                ["totalPnl", "总盈亏"], ["todayPnl", "今日参考盈亏"], ["brokerPositionPct", "券商账户仓位%"],
              ] as [keyof ImportedAccountSummary, string][]).map(([key, label]) => (
                <label key={key} className="grid gap-2 text-sm font-medium">{label}<Input type="number" step="0.01" value={account[key]} onChange={(event) => updateAccount(key, event.target.value)} /></label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>逐条确认持仓</CardTitle><CardDescription>重点检查负成本、零成本、小数点、持仓/可用和证券代码。</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {holdings.map((item, index) => (
                <div key={`${item.code}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Badge variant="secondary">#{index + 1}</Badge><strong>{item.name || "待确认标的"}</strong></div><Button variant="ghost" size="sm" onClick={() => setHoldings((previous) => previous.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="grid gap-1 text-xs">名称<Input value={item.name} onChange={(e) => updateHolding(index, "name", e.target.value)} /></label>
                    <label className="grid gap-1 text-xs">代码<Input inputMode="numeric" value={item.code} onChange={(e) => updateHolding(index, "code", e.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
                    <label className="grid gap-1 text-xs">持仓数量<Input type="number" value={item.quantity} onChange={(e) => updateHolding(index, "quantity", toNumber(e.target.value))} /></label>
                    <label className="grid gap-1 text-xs">持仓市值<Input type="number" step="0.01" value={item.marketValue} onChange={(e) => updateHolding(index, "marketValue", toNumber(e.target.value))} /></label>
                    <label className="grid gap-1 text-xs">成本价<Input type="number" step="0.001" value={item.costPrice} onChange={(e) => updateHolding(index, "costPrice", toNumber(e.target.value))} /></label>
                    <label className="grid gap-1 text-xs">截图现价<Input type="number" step="0.001" value={item.currentPrice} onChange={(e) => updateHolding(index, "currentPrice", toNumber(e.target.value))} /></label>
                    <label className="grid gap-1 text-xs">持仓盈亏<Input type="number" step="0.01" value={item.pnl} onChange={(e) => updateHolding(index, "pnl", toNumber(e.target.value))} /></label>
                    <label className="grid gap-1 text-xs">仓位分类<select className="h-10 rounded-md border bg-white px-3" value={item.type} onChange={(e) => updateHolding(index, "type", e.target.value as AShareHolding["type"])}>{holdingTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
                    <label className="grid gap-1 text-xs">当前建议<select className="h-10 rounded-md border bg-white px-3" value={item.suggestion} onChange={(e) => updateHolding(index, "suggestion", e.target.value as Suggestion)}>{suggestions.map((value) => <option key={value}>{value}</option>)}</select></label>
                    <label className="grid gap-1 text-xs sm:col-span-2 lg:col-span-3">备注<Input value={item.note} onChange={(e) => updateHolding(index, "note", e.target.value)} /></label>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setHoldings((previous) => [...previous, blankHolding()])}><Plus className="mr-2 h-4 w-4" />补充一条</Button>
            </CardContent>
          </Card>

          <Card className={closureGapPct > 0.01 ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50/70"}>
            <CardHeader><CardTitle>资产闭合检查</CardTitle><CardDescription className={closureGapPct > 0.01 ? "text-amber-800" : "text-emerald-900"}>明细合计 ¥{holdingsTotal.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}；总市值 ¥{account.marketValue.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}；差额 ¥{closureGap.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}。{closureGapPct > 0.01 ? " 差额超过1%，请先校正。" : " 基本闭合。"}</CardDescription></CardHeader>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button onClick={applySnapshot}>确认并应用</Button>
            <Button variant="outline" onClick={exportJson}><FileJson className="mr-2 h-4 w-4" />导出JSON备份</Button>
            <Button variant="ghost" onClick={clearSnapshot}>清除本机数据</Button>
            {saved && <Badge variant="success" className="self-center">已保存到当前浏览器</Badge>}
          </div>
          <details className="rounded-2xl border bg-white p-3"><summary className="cursor-pointer text-sm font-bold">查看OCR原始文本</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{rawText || "暂无"}</pre></details>
        </>
      )}
    </div>
  );
}
