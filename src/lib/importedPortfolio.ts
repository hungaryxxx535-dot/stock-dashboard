import type { AShareHolding, Suggestion } from "@/data/portfolio";

export const IMPORTED_PORTFOLIO_STORAGE_KEY = "feige:a-share-screenshot:v1";

export type ImportedAccountSummary = {
  totalAssets: number;
  marketValue: number;
  availableCash: number;
  totalPnl: number;
  todayPnl: number;
  brokerPositionPct: number;
};

export type ImportedPortfolioSnapshot = {
  source: "screenshot";
  importedAt: string;
  imageCount: number;
  account: ImportedAccountSummary;
  holdings: AShareHolding[];
  rawText: string;
};

export type ParsedPortfolioDraft = {
  account: ImportedAccountSummary;
  holdings: AShareHolding[];
  rawText: string;
};

const defaultAccount: ImportedAccountSummary = {
  totalAssets: 0,
  marketValue: 0,
  availableCash: 0,
  totalPnl: 0,
  todayPnl: 0,
  brokerPositionPct: 0,
};

const validTypes: AShareHolding["type"][] = ["核心仓", "趋势仓", "防守仓", "观察仓"];
const validSuggestions: Suggestion[] = ["持有", "观察", "分批锁盈", "谨慎", "加仓候选"];

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(/[¥￥$,%\s]/g, "").replace(/，/g, ",").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[：﹕]/g, ":")
    .replace(/[，]/g, ",")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findLabeledNumber(text: string, labels: string[]): number {
  const numberPattern = "([+-]?[\\d,]+(?:\\.\\d+)?)";
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const forward = new RegExp(`${escaped}[^\\d+-]{0,18}${numberPattern}`, "i").exec(text);
    if (forward?.[1]) return toNumber(forward[1]);
    const reverse = new RegExp(`${numberPattern}[^\\d]{0,12}${escaped}`, "i").exec(text);
    if (reverse?.[1]) return toNumber(reverse[1]);
  }
  return 0;
}

function findPercent(text: string, labels: string[]): number {
  const numberPattern = "([+-]?[\\d,.]+)\\s*%";
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`${escaped}[^\\d+-]{0,18}${numberPattern}`, "i").exec(text);
    if (match?.[1]) return toNumber(match[1]);
  }
  return 0;
}

function isNoiseLine(line: string): boolean {
  return /^(持仓|交易|行情|资产|盈亏|成本|现价|市值|数量|可用|今日|总资产|总市值|总盈亏|参考盈亏|证券|刷新|返回|更多|买入|卖出)/.test(line);
}

function extractName(lines: string[], codeIndex: number, code: string): string {
  const candidates = [lines[codeIndex].replace(code, ""), lines[codeIndex - 1], lines[codeIndex + 1]]
    .filter(Boolean)
    .map((line) => line.replace(/[\d.,%+\-¥￥$]/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2 && line.length <= 18 && /[\u4e00-\u9fa5A-Za-z]/.test(line) && !isNoiseLine(line));
  return candidates[0] ?? "待确认标的";
}

function findValueInBlock(block: string, labels: string[]): number {
  return findLabeledNumber(block, labels);
}

function inferType(name: string, marketValue: number, existing?: AShareHolding): AShareHolding["type"] {
  if (existing && validTypes.includes(existing.type)) return existing.type;
  if (/科创芯50|科创半导|科创200|澜起科技/.test(name)) return "核心仓";
  if (/招商银行|金ETF|黄金ETF/.test(name)) return "防守仓";
  if (marketValue > 0 && marketValue < 30000) return "观察仓";
  return "趋势仓";
}

function inferSuggestion(existing?: AShareHolding): Suggestion {
  return existing && validSuggestions.includes(existing.suggestion) ? existing.suggestion : "观察";
}

function parseHoldings(text: string, existingHoldings: AShareHolding[]): AShareHolding[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const codeRegex = /(?<!\d)(?:0|1|2|3|5|6|8|9)\d{5}(?!\d)/g;
  const codeEntries: { code: string; lineIndex: number }[] = [];

  lines.forEach((line, lineIndex) => {
    const matches = line.match(codeRegex) ?? [];
    matches.forEach((code) => {
      if (!codeEntries.some((item) => item.code === code)) codeEntries.push({ code, lineIndex });
    });
  });

  const parsed = codeEntries.map(({ code, lineIndex }, index) => {
    const nextIndex = codeEntries[index + 1]?.lineIndex ?? Math.min(lines.length, lineIndex + 14);
    const blockLines = lines.slice(Math.max(0, lineIndex - 2), Math.max(lineIndex + 2, nextIndex));
    const block = blockLines.join(" ");
    const existing = existingHoldings.find((item) => item.code === code);
    const name = existing?.name ?? extractName(lines, lineIndex, code);
    const quantity = findValueInBlock(block, ["持仓数量", "持仓/可用", "持仓", "数量"]);
    const costPrice = findValueInBlock(block, ["成本价", "成本"]);
    const currentPrice = findValueInBlock(block, ["现价", "市价", "最新价"]);
    let marketValue = findValueInBlock(block, ["持仓市值", "市值"]);
    let pnl = findValueInBlock(block, ["持仓盈亏", "浮动盈亏", "盈亏"]);

    if (!marketValue && quantity > 0 && currentPrice > 0) marketValue = quantity * currentPrice;
    if (!pnl && quantity > 0 && currentPrice > 0 && costPrice !== 0) pnl = quantity * (currentPrice - costPrice);

    return {
      name,
      code,
      quantity,
      costPrice,
      currentPrice,
      marketValue,
      pnl,
      type: inferType(name, marketValue, existing),
      suggestion: inferSuggestion(existing),
      note: existing?.note ? `${existing.note}｜截图OCR导入，已人工确认` : "截图OCR导入，需人工确认",
    } satisfies AShareHolding;
  });

  if (parsed.length > 0) return parsed;

  const nameMatches = existingHoldings.filter((item) => text.includes(item.name));
  return nameMatches.map((existing) => ({
    ...existing,
    quantity: 0,
    costPrice: 0,
    currentPrice: 0,
    marketValue: 0,
    pnl: 0,
    note: `${existing.note}｜OCR识别到名称，数值需人工补录`,
  }));
}

export function parsePortfolioOcrText(rawText: string, existingHoldings: AShareHolding[]): ParsedPortfolioDraft {
  const text = normalizeText(rawText);
  const marketValue = findLabeledNumber(text, ["总市值", "证券市值", "持仓市值"]);
  const totalAssets = findLabeledNumber(text, ["总资产", "资产总额"]);
  const availableCash = findLabeledNumber(text, ["可用资金", "可用金额", "可取资金"]);
  const totalPnl = findLabeledNumber(text, ["总盈亏", "持仓盈亏"]);
  const todayPnl = findLabeledNumber(text, ["今日参考盈亏", "当日参考盈亏", "今日盈亏"]);
  let brokerPositionPct = findPercent(text, ["仓位", "持仓仓位"]);
  if (!brokerPositionPct && totalAssets > 0 && marketValue > 0) brokerPositionPct = (marketValue / totalAssets) * 100;

  return {
    account: {
      ...defaultAccount,
      totalAssets,
      marketValue,
      availableCash,
      totalPnl,
      todayPnl,
      brokerPositionPct,
    },
    holdings: parseHoldings(text, existingHoldings),
    rawText: text,
  };
}

export function loadImportedPortfolio(): ImportedPortfolioSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(IMPORTED_PORTFOLIO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImportedPortfolioSnapshot;
    if (parsed?.source !== "screenshot" || !Array.isArray(parsed.holdings)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveImportedPortfolio(snapshot: ImportedPortfolioSnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IMPORTED_PORTFOLIO_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearImportedPortfolio(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(IMPORTED_PORTFOLIO_STORAGE_KEY);
}
