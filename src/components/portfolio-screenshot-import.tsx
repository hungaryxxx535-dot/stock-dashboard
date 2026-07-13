"use client";

import { useEffect, useMemo, useState } from "react";
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
  saveImportedPortfolio,
} from "@/lib/importedPortfolio";

const TESSERACT_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js";

const holdingTypes: AShareHolding["type"][] = ["核心仓", "趋势仓", "防守仓", "观察仓"];
const suggestions: Suggestion[] = ["持有", "观察", "分批锁盈", "谨慎", "加仓候选"];

type TesseractWorker = {
  recognize: (image: File) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
};

declare global {
  interface Window {
    Tesseract?: {
      createWorker: (languages: string) => Promise<TesseractWorker>;
    };
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

function numberFromInput(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PortfolioScreenshotImport({ currentHoldings, currentSnapshot, onApply, onClear }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [account, setAccount] = useState<ImportedAccountSummary>(currentSnapshot?.account ?? emptyAccount);
  const [holdings, setHoldings] = useState<AShareHolding[]>(currentSnapshot?.holdings ?? []);
  const [rawText, setRawText] = useState(currentSnapshot?.rawText ?? "");
  const [status, setStatus] = useState("等待上传截图");
  const [progress, setProgress] = useState(0);
  const [recognizing, setRecognizing] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(Boolean(currentSnapshot));

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const holdingsTotal = useMemo(() => holdings.reduce((sum, item) => sum + Number(item.marketValue || 0), 0), [holdings]);
  const closureGap = account.marketValue > 0 ? holdingsTotal - account.marketValue : 0;
  const closureGapPct = account.marketValue > 0 ? Math.abs(closureGap) / account.marketValue : 0;

  const updateAccount = (key: keyof ImportedAccountSummary, value: string) => {
    setAccount((previous) => ({ ...previous, [key]: numberFromInput(value) }));
    setSaved(false);
  };

  const updateHolding = <K extends keyof AShareHolding>(index: number, key: K, value: AShareHolding[K]) => {
    setHoldings((previous) => previous.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
    setSaved(false);
  };

  const removeHolding = (index: number) => {
    setHoldings((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    setSaved(false);
  };

  const runOcr = async () => {
    if (files.length === 0) {
      setError("请先选择至少一张A股持仓截图。");
      return;
    }

    setRecognizing(true);
    setError("");
    setSaved(false);
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
      for (let index = 0; index < files.length; index += 1) {
        setStatus(`正在识别第 ${index + 1} / ${files.length} 张截图`);
        const result = await worker.recognize(files[index]);
        texts.push(result.data.text);
        setProgress(Math.round(10 + ((index + 1) / files.length) * 82));
      }

      const combinedText = texts.join("\n\n--- 下一张截图 ---\n\n");
      const parsed = parsePortfolioOcrText(combinedText, currentHoldings);
      setRawText(parsed.rawText);
      setAccount(parsed.account);
      setHoldings(parsed.holdings.length > 0 ? parsed.holdings : [blankHolding()]);
      setProgress(100);
      setStatus("识别完成。请逐项核对后再应用，系统不会直接覆盖持仓。 ");
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
    const normalizedHoldings = holdings
      .map((item) => {
        const quantity = Number(item.quantity || 0);
        const costPrice = Number(item.costPrice || 0);
        const currentPrice = Number(item.currentPrice || 0);
        const marketValue = Number(item.marketValue || 0) || (quantity > 0 && currentPrice > 0 ? quantity * currentPrice : 0);
        const pnl = Number(item.pnl || 0) || (quantity > 0 && currentPrice > 0 && costPrice !== 0 ? quantity * (currentPrice - costPrice) : 0);
        return {
          ...item,
          name: item.name.trim(),
          code: item.code.trim(),
          quantity,
          costPrice,
          currentPrice,
          marketValue,
          pnl,
        };
      })
      .filter((item) => item.name || item.code);

    if (normalizedHoldings.length === 0) {
      setError("至少保留一条持仓记录。");
      return;
    }
    if (normalizedHoldings.some((item) => !/^\d{6}$/.test(item.code) || !item.name)) {
      setError("每条持仓都必须填写股票名称和6位股票代码。");
      return;
    }
    if (new Set(normalizedHoldings.map((item) => item.code)).size !== normalizedHoldings.length) {
      setError("持仓中存在重复股票代码，请合并或删除重复记录。");
      return;
    }

    const calculatedMarketValue = normalizedHoldings.reduce((sum, item) => sum + item.marketValue, 0);
    const finalAccount = {
      ...account,
      marketValue: account.marketValue || calculatedMarketValue,
      totalAssets: account.totalAssets || (account.marketValue || calculatedMarketValue) + account.availableCash,
      brokerPositionPct:
        account.brokerPositionPct ||
        ((account.totalAssets || (account.marketValue || calculatedMarketValue) + account.availableCash) > 0
          ? ((account.marketValue || calculatedMarketValue) /
              (account.totalAssets || (account.marketValue || calculatedMarketValue) + account.availableCash)) *
            100
          : 0),
    };

    const snapshot: ImportedPortfolioSnapshot = {
      source: "screenshot",
      importedAt: new Date().toISOString(),
      imageCount: files.length || currentSnapshot?.imageCount || 0,
      account: finalAccount,
      holdings: normalizedHoldings,
      rawText,
    };

    saveImportedPortfolio(snapshot);
    onApply(snapshot);
    setAccount(finalAccount);
    setHoldings(normalizedHoldings);
    setSaved(true);
    setStatus("已应用到本机作战台。刷新网页后仍会保留。");
  };

  const clearSnapshot = () => {
    clearImportedPortfolio();
    setFiles([]);
    setAccount(emptyAccount);
    setHoldings([]);
    setRawText("");
    setProgress(0);
    setSaved(false);
    setStatus("已清除截图导入数据，作战台恢复代码中的默认持仓。");
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
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
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
        <p className="text-sm text-slate-500">上传同花顺或券商持仓截图，在浏览器本机完成OCR；识别结果必须人工确认后才会应用。</p>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />隐私与更新规则</CardTitle>
          <CardDescription className="text-emerald-900">图片不上传到本站服务器，不写入GitHub，也不会自动修改美股持仓。导入结果只保存在当前浏览器。</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5" />第一步：选择截图</CardTitle>
          <CardDescription>可一次选择多张长截图或分屏截图。建议包含账户汇总和全部持仓明细。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          {previewUrls.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {previewUrls.map((url, index) => (
                <div key={url} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`持仓截图 ${index + 1}`} className="h-40 w-full object-contain" />
                  <p className="p-2 text-center text-xs text-slate-500">第 {index + 1} 张</p>
                </div>
              ))}
            </div>
          )}
          <Button onClick={runOcr} disabled={recognizing || files.length === 0} className="w-full sm:w-auto">
            <ScanLine className="mr-2 h-4 w-4" />{recognizing ? "正在识别" : "开始OCR识别"}
          </Button>
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
            <CardHeader>
              <CardTitle>第二步：核对账户汇总</CardTitle>
              <CardDescription>总资产、总市值和可用资金不能混淆；场外现金仍在“设置”中单独维护。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {([
                ["totalAssets", "证券账户总资产"],
                ["marketValue", "证券账户总市值"],
                ["availableCash", "账户内可用资金"],
                ["totalPnl", "总盈亏"],
                ["todayPnl", "今日参考盈亏"],
                ["brokerPositionPct", "券商账户仓位%"],
              ] as [keyof ImportedAccountSummary, string][]).map(([key, label]) => (
                <label key={key} className="grid gap-2 text-sm font-medium">
                  {label}
                  <Input type="number" step="0.01" value={account[key]} onChange={(event) => updateAccount(key, event.target.value)} />
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>第三步：逐条确认持仓</CardTitle>
              <CardDescription>OCR可能把负号、小数点和ETF代码识别错误。请以截图为准逐项检查。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {holdings.map((item, index) => (
                <div key={`${item.code}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2"><Badge variant="secondary">#{index + 1}</Badge><span className="text-sm font-bold">{item.name || "待确认标的"}</span></div>
                    <Button variant="ghost" size="sm" onClick={() => removeHolding(index)} aria-label="删除持仓"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="grid gap-1 text-xs font-medium text-slate-600">名称<Input value={item.name} onChange={(event) => updateHolding(index, "name", event.target.value)} /></label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">6位代码<Input inputMode="numeric" value={item.code} onChange={(event) => updateHolding(index, "code", event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">持仓数量<Input type="number" step="1" value={item.quantity} onChange={(event) => updateHolding(index, "quantity", numberFromInput(event.target.value))} /></label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">持仓市值<Input type="number" step="0.01" value={item.marketValue} onChange={(event) => updateHolding(index, "marketValue", numberFromInput(event.target.value))} /></label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">成本价<Input type="number" step="0.001" value={item.costPrice} onChange={(event) => updateHolding(index, "costPrice", numberFromInput(event.target.value))} /></label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">现价<Input type="number" step="0.001" value={item.currentPrice} onChange={(event) => updateHolding(index, "currentPrice", numberFromInput(event.target.value))} /></label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">持仓盈亏<Input type="number" step="0.01" value={item.pnl} onChange={(event) => updateHolding(index, "pnl", numberFromInput(event.target.value))} /></label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">仓位分类<select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={item.type} onChange={(event) => updateHolding(index, "type", event.target.value as AShareHolding["type"])}>{holdingTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">当前建议<select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={item.suggestion} onChange={(event) => updateHolding(index, "suggestion", event.target.value as Suggestion)}>{suggestions.map((suggestion) => <option key={suggestion}>{suggestion}</option>)}</select></label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2 lg:col-span-3">备注<Input value={item.note} onChange={(event) => updateHolding(index, "note", event.target.value)} /></label>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setHoldings((previous) => [...previous, blankHolding()])}><Plus className="mr-2 h-4 w-4" />补充一条持仓</Button>
            </CardContent>
          </Card>

          <Card className={closureGapPct > 0.01 ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50/70"}>
            <CardHeader>
              <CardTitle>资产闭合检查</CardTitle>
              <CardDescription className={closureGapPct > 0.01 ? "text-amber-800" : "text-emerald-900"}>
                明细合计 ¥{holdingsTotal.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}；账户总市值 ¥{account.marketValue.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}；差额 ¥{closureGap.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}。
                {closureGapPct > 0.01 ? " 差额超过1%，可能存在漏页或OCR错误，请先修正。" : " 明细与总市值基本闭合。"}
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button onClick={applySnapshot}>确认并应用到作战台</Button>
            <Button variant="outline" onClick={exportJson}><FileJson className="mr-2 h-4 w-4" />导出JSON备份</Button>
            <Button variant="ghost" onClick={clearSnapshot}>清除本机导入数据</Button>
            {saved && <Badge variant="success" className="self-center">已保存到当前浏览器</Badge>}
          </div>

          <details className="rounded-2xl border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-bold">查看OCR原始文本</summary>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{rawText || "暂无OCR文本"}</pre>
          </details>
        </>
      )}
    </div>
  );
}
