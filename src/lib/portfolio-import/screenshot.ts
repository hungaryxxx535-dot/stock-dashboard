import { AppStateSchema, type AppState, type Instrument } from "@/domain/model";

export type EquityMarket = "CN" | "US" | "HK";

export type ScreenshotHoldingDraft = {
  symbol: string;
  name: string;
  quantity: number;
  brokerCost: number;
  currentPrice: number | null;
  marketValue: number | null;
  confidence: number;
  warnings: string[];
};

export type ScreenshotParseResult = {
  market: EquityMarket;
  rows: ScreenshotHoldingDraft[];
  confidence: number;
  warnings: string[];
  rawText: string;
};

export type CnSecurityEntry = { c: string; n: string };

export type CnNameIndex = Array<{ c: string; n: string; key: string }>;

export type CnSecurityCandidate = { c: string; n: string; distance: number };

export type RankedCnCandidate = CnSecurityCandidate & {
  price: number | null;
  priceDiffPct: number | null;
};

export type OcrWord = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
};

type ImportOptions = {
  now?: string;
  idFactory?: () => string;
};

type BrokerLayout = "futu" | "pingan" | "unknown";

type VisualLine = {
  top: number;
  words: OcrWord[];
  columns: [string, string, string, string];
  text: string;
};

const marketMeta: Record<EquityMarket, { label: string; currency: "CNY" | "USD" | "HKD" }> = {
  CN: { label: "A股", currency: "CNY" },
  US: { label: "美股", currency: "USD" },
  HK: { label: "港股", currency: "HKD" },
};

const stopWords = new Set([
  "USD", "CNY", "HKD", "RMB", "NASDAQ", "NYSE", "AMEX", "TOTAL", "CASH",
  "MARKET", "VALUE", "PRICE", "COST", "QTY", "POSITION", "HOLDING", "P&L",
]);

const numberPattern = /[-−—]?[0-9OoIlSZBTG][0-9,\.OoIlSZBTG]*/g;
const tableWords = /(名称|代码|市值|数量|持仓|可用|成本|现价|盈亏|参考|资产|证券|基金|债券|查看|管理|买入|卖出|撤单|查询|NAME|SYMBOL|VALUE|QTY|COST|PRICE|HOLDING)/gi;

/**
 * Fixes the digit confusions Tesseract makes on Chinese brokerage screenshots
 * (O/0, l/I/1, S/5, B/8, Z/2, G/6, T/7). Only applied to tokens that are
 * predominantly numeric, so legitimate Latin words are never mangled.
 */
export function fixOcrNumberToken(value: string): string {
  const cleaned = value.normalize("NFKC").trim();
  const hasDigit = /\d/.test(cleaned);
  if (!hasDigit) return value;
  const body = cleaned.replace(/[-−—＋+%]/g, "");
  if (!/[OoIlSZBTG]/.test(body)) return value;
  const numericBody = body.replace(/[OoIlSZBTG]/gi, "").replace(/[.,]/g, "");
  if (!/^\d*$/.test(numericBody)) return value;
  return cleaned
    .replace(/[Oo]/g, "0")
    .replace(/[lI]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/Z/g, "2")
    .replace(/G/g, "6")
    .replace(/T/g, "7");
}

function numberFrom(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value
    .replace(/[Oo]/g, "0")
    .replace(/[lI]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/Z/g, "2")
    .replace(/G/g, "6")
    .replace(/T/g, "7")
    .replace(/[−—]/g, "-")
    .replace(/[，]/g, ",")
    .replace(/[。]/g, ".")
    .replace(/\s+/g, "")
    .replace(/[^\d.,-]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const parsed = Number(cleaned.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(value: string): number | null {
  return numberFrom(value.match(numberPattern)?.[0]);
}

export function normalizeSymbol(value: string, market: EquityMarket): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return "";
  if (market === "CN") return normalized.replace(/^(?:SH|SZ)/, "").replace(/\.(?:SH|SZ)$/, "");
  if (market === "HK") return normalized.replace(/^HK/, "").replace(/\.HK$/, "").padStart(5, "0");
  return normalized.replace(/^(?:NASDAQ|NYSE|AMEX):?/, "").replace(/\s/g, "");
}

export function isValidMarketSymbol(symbol: string, market: EquityMarket): boolean {
  if (market === "CN") return /^\d{6}$/.test(symbol);
  if (market === "HK") return /^\d{5}$/.test(symbol);
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) && !stopWords.has(symbol);
}

export function isNameOnlySymbol(symbol: string): boolean {
  return symbol.startsWith("NAME-");
}

export function normalizeSecurityName(value: string): string {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[·•・…]/g, "")
    .replace(/股份有限公司|有限责任公司|有限公司|股份|公司|集团|控股/g, "")
    .replace(/\b(?:INCORPORATED|CORPORATION|CORP|COMPANY|LIMITED|LTD|INC)\b\.?/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Removes OCR artifacts from security names: spaces that Tesseract inserts
 * between CJK characters ("招 商 银 行" -> "招商银行") and trailing ellipsis
 * markers from truncated app labels ("Roundhill …" -> "Roundhill").
 * Spaces between Latin words are preserved ("Arista Net").
 */
export function cleanOcrName(value: string): string {
  let cleaned = value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  cleaned = cleaned
    .replace(/([\p{Script=Han}])[ ]+([\p{Script=Han}])/gu, "$1$2")
    .replace(/([\p{Script=Han}])[ ]+/gu, "$1")
    .replace(/[ ]+([\p{Script=Han}])/gu, "$1")
    .replace(/[ ]*[….]{1,}[ ]*$/u, "")
    .trim();
  return cleaned;
}

/**
 * OCR-confusable character pairs. A substitution between two members of the
 * same pair costs 0.5 instead of 1, so "Al创业板" vs "AI创业板" or "科创S0"
 * vs "科创50" rank ahead of unrelated names without ever forcing a guess.
 */
const confusablePairs: ReadonlyArray<readonly [string, string]> = [
  ["l", "I"], ["o", "O"], ["0", "O"], ["1", "l"], ["1", "I"], ["5", "S"],
  ["8", "B"], ["2", "Z"], ["6", "G"], ["7", "T"], ["1", "i"], ["0", "o"],
  ["未", "末"], ["土", "士"], ["己", "已"], ["已", "巳"], ["千", "干"],
  ["元", "无"], ["人", "入"], ["大", "太"], ["日", "曰"], ["王", "玉"],
  ["候", "侯"], ["晴", "睛"], ["万", "方"], ["天", "夫"], ["风", "凤"],
  ["乌", "鸟"], ["处", "外"], ["内", "肉"], ["问", "间"],
];

const confusablePairsSet = new Set(
  confusablePairs.map(([left, right]) => [left.toLowerCase(), right.toLowerCase()].sort().join("|")),
);

function isConfusable(left: string, right: string): boolean {
  if (left === right) return false;
  return confusablePairsSet.has([left.toLowerCase(), right.toLowerCase()].sort().join("|"));
}

/**
 * Levenshtein distance where confusable OCR pairs cost 0.5 per substitution.
 * Character-count based thresholds stay meaningful because every pair costs
 * at least 0.5 and insertions/deletions still cost 1.
 */
export function weightedNameDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      const substitution =
        left[leftIndex - 1] === right[rightIndex - 1]
          ? diagonal
          : diagonal + (isConfusable(left[leftIndex - 1], right[rightIndex - 1]) ? 0.5 : 1);
      previous[rightIndex] = Math.min(previous[rightIndex] + 1, previous[rightIndex - 1] + 1, substitution);
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function findMatchingInstrument(
  instruments: Instrument[],
  market: EquityMarket,
  row: Pick<ScreenshotHoldingDraft, "symbol" | "name">,
): Instrument | undefined {
  const symbol = normalizeSymbol(row.symbol, market);
  if (symbol && isValidMarketSymbol(symbol, market)) {
    const symbolMatch = instruments.find((item) =>
      item.market === market && normalizeSymbol(item.symbol, market) === symbol
    );
    if (symbolMatch) return symbolMatch;
  }

  const name = normalizeSecurityName(row.name);
  if (!name) return undefined;
  const sameMarket = instruments.filter((item) => item.market === market);
  const exact = sameMarket.find((item) => normalizeSecurityName(item.name) === name);
  if (exact) return exact;
  if (name.length < 4) return undefined;

  return sameMarket
    .map((item) => ({ item, candidate: normalizeSecurityName(item.name) }))
    .filter(({ candidate }) => candidate.length >= 4)
    .map(({ item, candidate }) => ({
      item,
      score: candidate.includes(name) || name.includes(candidate)
        ? 0
        : weightedNameDistance(name, candidate) / Math.max(name.length, candidate.length),
    }))
    .sort((left, right) => left.score - right.score)
    .find(({ score }) => score <= 0.18)?.item;
}

export function buildCnNameIndex(entries: CnSecurityEntry[]): CnNameIndex {
  return entries.map((entry) => ({ c: entry.c, n: entry.n, key: normalizeSecurityName(entry.n) }));
}

/**
 * Resolves a name-only CN row to a real exchange code using the bundled
 * securities dictionary. Conservative by design: exact normalized match,
 * then a shortest containing name, then a single-character distance match.
 */
export function matchSecurityByName(name: string, index: CnNameIndex): CnSecurityEntry | null {
  const normalized = normalizeSecurityName(cleanOcrName(name));
  if (!normalized || normalized.length < 2) return null;

  const exact = index.find((entry) => entry.key === normalized);
  if (exact) return { c: exact.c, n: exact.n };

  if (normalized.length >= 3) {
    const containing = index
      .filter((entry) => entry.key.startsWith(normalized))
      .sort((left, right) => left.key.length - right.key.length);
    if (containing.length === 1) return { c: containing[0].c, n: containing[0].n };
    if (containing.length >= 2 && containing[0].key.length < containing[1].key.length) {
      // unique shortest prefix (e.g. "科创半导" -> "科创半导体ETF华夏", not the longer device ETFs)
      return { c: containing[0].c, n: containing[0].n };
    }
  }

  let bestDistance = Infinity;
  let best: CnNameIndex[number] | null = null;
  let ambiguous = false;
  for (const entry of index) {
    if (entry.key.length < 3) continue;
    const lengthGap = Math.abs(entry.key.length - normalized.length);
    if (lengthGap > 4) continue;
    const prefixDistance = entry.key.length >= normalized.length
      ? weightedNameDistance(normalized, entry.key.slice(0, normalized.length))
      : weightedNameDistance(entry.key, normalized.slice(0, entry.key.length));
    const fullDistance = weightedNameDistance(normalized, entry.key);
    // Broker apps render short display names; a close prefix match with a
    // dictionary suffix (ETF华夏 / 联接A / 股票名称) is the same security.
    const suffixFree = prefixDistance <= 0.5 && normalized.length >= 3;
    const distance = Math.min(fullDistance, suffixFree ? prefixDistance : prefixDistance + lengthGap * 0.5);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
      ambiguous = false;
    } else if (distance === bestDistance) {
      ambiguous = true;
    }
  }
  if (best && bestDistance <= 1 && !ambiguous) return { c: best.c, n: best.n };
  return null;
}

/**
 * Returns the top name candidates for a CN row so the caller can disambiguate
 * with additional evidence (e.g. a live quote close to the screenshot price).
 */
export function candidateSecurityMatches(name: string, index: CnNameIndex, limit = 8): CnSecurityCandidate[] {
  const normalized = normalizeSecurityName(cleanOcrName(name));
  if (!normalized || normalized.length < 2) return [];

  const exact = index.find((entry) => entry.key === normalized);
  if (exact) return [{ c: exact.c, n: exact.n, distance: 0 }];

  const scored: CnSecurityCandidate[] = [];
  if (normalized.length >= 3) {
    for (const entry of index) {
      if (!entry.key.startsWith(normalized)) continue;
      scored.push({ c: entry.c, n: entry.n, distance: entry.key.length - normalized.length });
    }
  }
  for (const entry of index) {
    if (entry.key.length < 3) continue;
    const lengthGap = Math.abs(entry.key.length - normalized.length);
    if (lengthGap > 4) continue;
    const prefixDistance = entry.key.length >= normalized.length
      ? weightedNameDistance(normalized, entry.key.slice(0, normalized.length))
      : weightedNameDistance(entry.key, normalized.slice(0, entry.key.length));
    const fullDistance = weightedNameDistance(normalized, entry.key);
    const suffixFree = prefixDistance <= 0.5 && normalized.length >= 3;
    const distance = Math.min(fullDistance, suffixFree ? prefixDistance : prefixDistance + lengthGap * 0.5);
    if (distance <= 1.5) scored.push({ c: entry.c, n: entry.n, distance });
  }

  const unique = new Map<string, CnSecurityCandidate>();
  for (const candidate of scored) {
    const existing = unique.get(candidate.c);
    if (!existing || candidate.distance < existing.distance) unique.set(candidate.c, candidate);
  }
  return [...unique.values()]
    .sort((left, right) => left.distance - right.distance || left.n.length - right.n.length)
    .slice(0, limit);
}

/**
 * Attaches live quote prices to candidates so the review UI can show how close
 * each candidate is to the price read from the screenshot.
 */
export function rankCandidatesByPrice(
  candidates: CnSecurityCandidate[],
  quotes: Map<string, number>,
  currentPrice: number | null,
): RankedCnCandidate[] {
  return candidates
    .map((candidate) => {
      const price = quotes.get(candidate.c) ?? null;
      const priceDiffPct = price !== null && currentPrice && currentPrice > 0
        ? (Math.abs(price - currentPrice) / currentPrice) * 100
        : null;
      return { ...candidate, price, priceDiffPct };
    })
    .sort((left, right) => {
      const leftDiff = left.priceDiffPct ?? Infinity;
      const rightDiff = right.priceDiffPct ?? Infinity;
      return leftDiff - rightDiff || left.distance - right.distance;
    });
}

/**
 * Returns the single candidate whose live price is within tolerance of the
 * screenshot price, or null when zero / multiple candidates qualify. Callers
 * must never guess between ties.
 */
export function uniquePriceWinner(candidates: RankedCnCandidate[], tolerancePct = 3): RankedCnCandidate | null {
  const winners = candidates.filter((candidate) => candidate.priceDiffPct !== null && candidate.priceDiffPct <= tolerancePct);
  return winners.length === 1 ? winners[0] : null;
}

function localNameSymbol(name: string, market: EquityMarket): string {
  let hash = 2166136261;
  for (const character of normalizeSecurityName(name)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `NAME-${market}-${(hash >>> 0).toString(36).toUpperCase().padStart(7, "0")}`;
}

function findSymbol(line: string, market: EquityMarket): { raw: string; symbol: string; index: number } | null {
  const candidates = market === "CN"
    ? [...line.matchAll(/(?:SH|SZ)?\s*(\d{6})(?:\.(?:SH|SZ))?/gi)]
    : market === "HK"
      ? [...line.matchAll(/(?:HK)?\s*(\d{4,5})(?:\.HK)?/gi)]
      : [
          ...line.matchAll(/(?:NASDAQ|NYSE|AMEX)\s*:?\s*([A-Z][A-Z0-9.-]{0,9})/gi),
          ...line.matchAll(/\b([A-Z][A-Z0-9.-]{0,9})\b/g),
        ];

  for (const candidate of candidates) {
    const raw = candidate[0].trim();
    const symbol = normalizeSymbol(candidate[1] ?? raw, market);
    if (isValidMarketSymbol(symbol, market)) return { raw, symbol, index: candidate.index ?? 0 };
  }
  return null;
}

function labeledNumber(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*[:：]?\\s*([-−—]?\\d[\\d,]*(?:\\.\\d+)?)`, "i"));
    const parsed = numberFrom(match?.[1]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function inferName(line: string, symbolMatch: { raw: string; index: number }, market: EquityMarket): string {
  const around = `${line.slice(0, symbolMatch.index)} ${line.slice(symbolMatch.index + symbolMatch.raw.length)}`
    .replace(/[|｜:：/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const isTableToken = new RegExp(tableWords.source, tableWords.flags.replace("g", ""));
  const tokens = around.split(" ").filter((word) => {
    if (!word) return false;
    if (/^[-−—]?[0-9.,%]+$/.test(word)) return false;
    if (/^[-−—]?[0-9OoIlSZBTG.,%]+$/.test(word)) return false;
    if (isTableToken.test(word) || stopWords.has(word.toUpperCase())) return false;
    return /[\p{L}]/u.test(word) || /[0-9]{2,}/u.test(word);
  });
  const joined = tokens.join(market === "US" ? " " : "").trim();
  const cleaned = cleanOcrName(joined.slice(0, market === "US" ? 48 : 32));
  return cleaned || symbolMatch.raw.toUpperCase();
}

function rowWarnings(row: Pick<ScreenshotHoldingDraft, "symbol" | "name" | "quantity" | "brokerCost" | "currentPrice">, market: EquityMarket): string[] {
  const warnings: string[] = [];
  if (!row.name.trim()) warnings.push("证券名称未识别");
  if (!row.symbol.trim()) warnings.push("截图未显示代码，将优先按名称匹配");
  else if (!isValidMarketSymbol(normalizeSymbol(row.symbol, market), market)) warnings.push("证券代码置信度不足，将按名称匹配");
  if (row.quantity <= 0) warnings.push("持仓数量未识别或不大于0");
  if (!Number.isFinite(row.brokerCost)) warnings.push("券商成本无法识别");
  if (row.brokerCost < 0) warnings.push("识别到负成本；将保留券商口径，请重点复核");
  if (row.currentPrice === null || row.currentPrice <= 0) warnings.push("截图现价未识别");
  return warnings;
}

function parseLine(line: string, market: EquityMarket): ScreenshotHoldingDraft | null {
  const symbolMatch = findSymbol(line, market);
  if (!symbolMatch) return null;

  const afterSymbol = line.slice(symbolMatch.index + symbolMatch.raw.length);
  const fallbackNumbers = afterSymbol
    .split(/\s+/)
    .filter((token) => /^[-−—]?[0-9.,%]+$/.test(token) || /^[-−—]?[0-9OoIlSZBTG.,%]+$/.test(token))
    .map((value) => numberFrom(value))
    .filter((value): value is number => value !== null);
  const quantity = labeledNumber(line, ["持仓数量", "持仓", "数量", "股数", "QTY", "QUANTITY"]) ?? fallbackNumbers[0] ?? 0;
  const brokerCost = labeledNumber(line, ["成本价", "成本", "平均价", "COST", "AVG PRICE"]) ?? fallbackNumbers[1] ?? 0;
  const currentPrice = labeledNumber(line, ["现价", "最新价", "市价", "PRICE", "LAST"]) ?? fallbackNumbers[2] ?? null;
  const explicitMarketValue = labeledNumber(line, ["持仓市值", "市值", "MARKET VALUE", "VALUE"]);
  const marketValue = explicitMarketValue ?? fallbackNumbers[3] ?? (
    currentPrice !== null && quantity > 0 ? currentPrice * quantity : null
  );
  const name = inferName(line, symbolMatch, market);
  const provisional = { symbol: symbolMatch.symbol, name, quantity, brokerCost, currentPrice };
  const warnings = rowWarnings(provisional, market);
  const completed = [name !== symbolMatch.raw.toUpperCase(), quantity > 0, Number.isFinite(brokerCost), currentPrice !== null && currentPrice > 0, marketValue !== null && marketValue > 0].filter(Boolean).length;

  return {
    ...provisional,
    marketValue,
    confidence: Math.min(98, Math.round(28 + completed * 14)),
    warnings,
  };
}

export function parseOcrTsv(rawTsv: string): OcrWord[] {
  return rawTsv
    .replace(/\r/g, "")
    .split("\n")
    .slice(1)
    .map((line): OcrWord | null => {
      const parts = line.split("\t");
      if (parts.length < 12) return null;
      const text = parts.slice(11).join("\t").trim();
      const [left, top, width, height, confidence] = [parts[6], parts[7], parts[8], parts[9], parts[10]].map(Number);
      if (!text || ![left, top, width, height, confidence].every(Number.isFinite) || confidence < 10) return null;
      return { text, left, top, width, height, confidence };
    })
    .filter((word): word is OcrWord => Boolean(word));
}

function clusterVisualLines(words: OcrWord[]): VisualLine[] {
  if (!words.length) return [];
  const sourceWidth = Math.max(...words.map((word) => word.left + word.width), 1);
  const medianHeight = [...words].map((word) => word.height).sort((left, right) => left - right)[Math.floor(words.length / 2)] || 16;
  const groups: OcrWord[][] = [];
  for (const word of [...words].sort((left, right) => left.top + left.height / 2 - (right.top + right.height / 2))) {
    const center = word.top + word.height / 2;
    const group = groups.findLast((candidate) => {
      const candidateCenter = candidate.reduce((sum, item) => sum + item.top + item.height / 2, 0) / candidate.length;
      return Math.abs(center - candidateCenter) <= Math.max(6, medianHeight * 0.72);
    });
    if (group) group.push(word);
    else groups.push([word]);
  }

  return groups.map((group) => {
    const sorted = [...group].sort((left, right) => left.left - right.left);
    const columns: [string[], string[], string[], string[]] = [[], [], [], []];
    for (const word of sorted) {
      const position = (word.left + word.width / 2) / sourceWidth;
      const index = position < 0.32 ? 0 : position < 0.60 ? 1 : position < 0.80 ? 2 : 3;
      columns[index].push(word.text);
    }
    return {
      top: Math.min(...group.map((word) => word.top)),
      words: sorted,
      columns: columns.map((column) => column.join(" ").trim()) as VisualLine["columns"],
      text: sorted.map((word) => word.text).join(" ").trim(),
    };
  }).sort((left, right) => left.top - right.top);
}

function detectLayout(text: string, market: EquityMarket): BrokerLayout {
  const compact = text.replace(/\s+/g, "").toUpperCase();
  if (/名称代码|市值.?数量|现价.?成本|今日盈亏|ROUNDHILL/.test(compact)) return "futu";
  if (/持仓.?可用|成本.?现价|信用持仓|融资负债|券负债/.test(compact)) return "pingan";
  if (market === "US") return "futu";
  return "unknown";
}

function cleanedName(value: string): string {
  const name = value
    .replace(tableWords, " ")
    .replace(/[|｜:：/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = name
    .split(" ")
    .filter((token) => {
      if (!token) return false;
      if (/^[-−—]?[0-9.,%]+$/.test(token)) return false;
      if (/^[-−—]?[0-9OoIlSZBTG.,%]+$/.test(token)) return false;
      if (/^[-−—.·…]+$/.test(token)) return false;
      if (/^(?:SH|SZ|HK)?\d+$/.test(token) || stopWords.has(token.toUpperCase())) return false;
      return /[\p{L}]/u.test(token) || /[0-9]{2,}/u.test(token);
    });
  const joined = tokens.join(" ");
  if (!joined || !/[\p{L}]/u.test(joined)) return "";
  return cleanOcrName(joined.slice(0, 40));
}

/**
 * Header-driven table parsing.
 *
 * The old parsers hard-coded column indexes ("first number is quantity,
 * second is cost ...") which silently mis-assigns fields whenever the app
 * reorders columns or the OCR drops a word. This parser instead:
 *   1. finds the header line (名称/代码/市值/持仓/成本/现价/盈亏 ...);
 *   2. clusters numeric words into real x-bands;
 *   3. maps each band to a semantic column (value/quantity/cost/price/pnl),
 *      honoring dual headers such as 市值/数量 or 成本/现价;
 *   4. groups visual lines into one block per holding;
 *   5. extracts name (digits preserved: 科创200, 黄金9999), symbol and the
 *      per-column numbers, then cross-validates quantity x price == value.
 */

type ColumnSemantic = "quantity" | "cost" | "price" | "value" | "pnl" | "other";

type DualSemantic = { semantic: ColumnSemantic; line: 1 | 2 };

type NumericColumn = { center: number; count: number; semantics: DualSemantic[] };

const headerSemanticPatterns: Array<{ semantic: ColumnSemantic; pattern: RegExp }> = [
  { semantic: "value", pattern: /市值|总资产|资产|VALUE/i },
  { semantic: "quantity", pattern: /持仓|数量|股数|可用|余额|QTY|QUANTITY/i },
  { semantic: "cost", pattern: /成本|COST/i },
  { semantic: "price", pattern: /现价|最新价|市价|PRICE/i },
  { semantic: "pnl", pattern: /盈亏|损益|浮动|P&L|PL/i },
];

function headerSemanticsOf(word: string): ColumnSemantic[] {
  const clean = word.replace(/[＊*·.。:：]/g, "");
  const found: ColumnSemantic[] = [];
  for (const { semantic, pattern } of headerSemanticPatterns) {
    if (pattern.test(clean) && !found.includes(semantic)) found.push(semantic);
  }
  return found;
}

function splitDualHeader(word: string): DualSemantic[] {
  const parts = word
    .replace(/[＊*]/g, "")
    .split(/[/／|｜]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const out: DualSemantic[] = [];
  for (const part of parts.length ? parts : [word]) {
    const semantics = headerSemanticsOf(part);
    for (const semantic of semantics) {
      if (!out.some((entry) => entry.semantic === semantic)) {
        out.push({ semantic, line: (out.length + 1) as 1 | 2 });
      }
    }
  }
  return out;
}

function isNumericWord(word: OcrWord): boolean {
  return /^[-−—＋+]?[0-9OoIlSZBTG][0-9,\.OoIlSZBTG%]*$/.test(word.text) && /\d/.test(word.text);
}

function findHeaderLineIndex(lines: VisualLine[]): number {
  let bestIndex = -1;
  let bestScore = 0;
  for (let index = 0; index < lines.length; index += 1) {
    let score = 0;
    for (const word of lines[index].words) {
      const semantics = headerSemanticsOf(word.text);
      score += semantics.length ? 2 + Math.min(semantics.length, 2) : 0;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestScore >= 3 ? bestIndex : -1;
}

function buildColumnsFromHeader(line: VisualLine, lines: VisualLine[]): NumericColumn[] {
  const columns: NumericColumn[] = [];
  for (const word of line.words) {
    const semantics = splitDualHeader(word.text);
    if (!semantics.length) continue;
    columns.push({ center: word.left + word.width / 2, count: 1, semantics });
  }
  // Detect numeric bands that belong to no header column (e.g. the unlabeled
  // 盈亏 column in Ping-An credit holdings) and label them pnl.
  const hasValue = columns.some((column) => column.semantics.some((entry) => entry.semantic === "value"));
  const hasQuantity = columns.some((column) => column.semantics.some((entry) => entry.semantic === "quantity"));
  const stray: number[] = [];
  for (const candidateLine of lines) {
    for (const word of candidateLine.words) {
      if (!isNumericWord(word) || /%/.test(word.text)) continue;
      const x = word.left + word.width / 2;
      const nearest = columns.reduce(
        (best, column) => Math.min(best, Math.abs(x - column.center)),
        Infinity,
      );
      if (nearest > 96) stray.push(x);
    }
  }
  stray.sort((left, right) => left - right);
  const strayClusters: Array<{ center: number; count: number }> = [];
  for (const x of stray) {
    const last = strayClusters[strayClusters.length - 1];
    if (!last || x - last.center > 60) strayClusters.push({ center: x, count: 1 });
    else {
      last.center = (last.center * last.count + x) / (last.count + 1);
      last.count += 1;
    }
  }
  const pnlBand = strayClusters.find((cluster) => cluster.count >= 2);
  if (pnlBand && hasValue && hasQuantity) {
    columns.push({
      center: pnlBand.center,
      count: pnlBand.count,
      semantics: [{ semantic: "pnl", line: 1 }],
    });
  }
  return columns;
}

function isTableWordToken(token: string): boolean {
  const nonGlobal = new RegExp(tableWords.source, tableWords.flags.replace("g", ""));
  return nonGlobal.test(token);
}

function isTickerLike(token: string, market: EquityMarket): boolean {
  const trimmed = token.trim();
  if (market === "CN") return /^(?:SH|SZ)?\d{6}$/i.test(trimmed) || /^[A-Z]{2}$/i.test(trimmed);
  if (market === "HK") return /^\d{4,5}$/.test(trimmed) || /^[A-Z]{2,5}$/.test(trimmed);
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(trimmed) && !stopWords.has(trimmed.toUpperCase());
}

function extractBlockSymbol(block: VisualLine[], market: EquityMarket): string {
  for (const line of block) {
    for (const word of line.words) {
      if (market === "CN" && /^\d{6}$/.test(word.text)) return word.text;
      if (market === "CN" && /^[A-Z]{2}(?:SH|SZ)?\d{6}$/i.test(word.text)) {
        const normalized = normalizeSymbol(word.text, market);
        if (isValidMarketSymbol(normalized, market)) return normalized;
      }
      if (market === "HK" && /^\d{4,5}$/.test(word.text)) return word.text.padStart(5, "0");
      if (isNumericWord(word)) continue;
      if (market === "US" && /^[A-Z][A-Z0-9.-]{0,9}$/.test(word.text) && !stopWords.has(word.text.toUpperCase())) {
        const normalized = normalizeSymbol(word.text, market);
        if (isValidMarketSymbol(normalized, market) && normalized.length >= 2) return normalized;
      }
    }
  }
  return "";
}

function extractBlockName(block: VisualLine[], symbol: string, market: EquityMarket): string {
  const tokens: string[] = [];
  for (const line of block) {
    for (const word of line.words) {
      if (isNumericWord(word)) continue;
      const token = word.text.trim();
      if (!token) continue;
      if (/^[-−—.·…]+$/.test(token)) continue;
      if (isTableWordToken(token) || stopWords.has(token.toUpperCase())) continue;
      if (symbol && normalizeSymbol(token, market) === normalizeSymbol(symbol, market)) continue;
      if (/^[0-9OoIlSZBTG]{2,}$/.test(token) && /[0-9]/.test(token) && !/[\p{L}]/u.test(token)) continue;
      tokens.push(token);
    }
  }
  const joined = tokens.join(market === "US" ? " " : "").trim();
  return cleanOcrName(joined.slice(0, market === "US" ? 48 : 32));
}

function blockNumbersByColumn(
  block: VisualLine[],
  columns: NumericColumn[],
): Map<ColumnSemantic, Array<{ line: number; value: number; raw: string }>> {
  const out = new Map<ColumnSemantic, Array<{ line: number; value: number; raw: string }>>();
  const push = (semantic: ColumnSemantic, line: number, value: number, raw: string) => {
    const list = out.get(semantic) ?? [];
    list.push({ line, value, raw });
    out.set(semantic, list);
  };
  for (let lineIndex = 0; lineIndex < block.length; lineIndex += 1) {
    for (const word of block[lineIndex].words) {
      if (!isNumericWord(word)) continue;
      const x = word.left + word.width / 2;
      let best: NumericColumn | null = null;
      let bestDistance = Infinity;
      for (const column of columns) {
        const distance = Math.abs(x - column.center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = column;
        }
      }
      if (!best) continue;
      const isPercent = /%/.test(word.text);
      let semantic: ColumnSemantic = isPercent ? "pnl" : "other";
      if (!isPercent && best.semantics.length) {
        const byLine = best.semantics.find((entry) => entry.line === lineIndex + 1);
        semantic = (byLine ?? best.semantics[0]).semantic;
      }
      const value = numberFrom(fixOcrNumberToken(word.text));
      if (value !== null) push(semantic, lineIndex, value, word.text);
    }
  }
  return out;
}

function pickColumnNumber(
  entries: Array<{ line: number; value: number; raw: string }> | undefined,
  options: { line?: number; consistentWith?: Array<number | null> } = {},
): number | null {
  if (!entries?.length) return null;
  let source = entries;
  if (options.line !== undefined) {
    const preferred = entries.filter((entry) => entry.line === options.line);
    if (preferred.length) source = preferred;
  }
  const factors = options.consistentWith?.filter((value): value is number => value !== null && value > 0) ?? [];
  if (factors.length === 2) {
    const [left, right] = factors;
    const expected = left * right;
    const consistent = source.filter((entry) => Math.abs(entry.value - expected) / Math.max(expected, 1) <= 0.015);
    if (consistent.length === 1) return consistent[0].value;
  }
  return source[0].value;
}

function pickQuantity(
  entries: Array<{ line: number; value: number; raw: string }> | undefined,
  price: number | null,
  value: number | null,
): number | null {
  if (!entries?.length) return null;
  if (price && price > 0 && value && value > 0) {
    const expected = value / price;
    let best = entries[0];
    let bestError = Infinity;
    for (const entry of entries) {
      const error = Math.abs(entry.value - expected) / Math.max(expected, 1);
      if (error < bestError) {
        bestError = error;
        best = entry;
      }
    }
    if (bestError <= 0.015) return best.value;
  }
  const counts = new Map<number, number>();
  for (const entry of entries) {
    if (Number.isInteger(entry.value)) counts.set(entry.value, (counts.get(entry.value) ?? 0) + 1);
  }
  let mode: number | null = null;
  let max = 0;
  for (const [candidate, count] of counts) {
    if (count > max) {
      max = count;
      mode = candidate;
    }
  }
  return mode ?? entries[0].value;
}

/**
 * Tries common OCR quantity mutations (trailing zero dropped, zero appended,
 * decimal shifted) until quantity x price matches the market value.
 */
function reconcileQuantity(quantity: number | null, price: number | null, value: number | null): number | null {
  if (quantity === null || quantity <= 0 || !price || price <= 0 || !value || value <= 0) return null;
  const error = (candidate: number) => Math.abs(candidate * price - value) / Math.max(value, 1);
  const current = error(quantity);
  if (current <= 0.015) return null;
  const variants = new Set<number>();
  for (const factor of [10, 0.1, 100, 0.01, 1000, 0.001]) variants.add(quantity * factor);
  const integer = Math.trunc(quantity);
  if (integer > 9) variants.add(Number(String(integer).slice(0, -1)));
  if (String(integer).length < 8) variants.add(Number(`${integer}0`));
  let best: number | null = null;
  let bestError = current;
  for (const variant of variants) {
    if (variant <= 0) continue;
    const candidateError = error(variant);
    if (candidateError <= 0.015 && candidateError < bestError) {
      bestError = candidateError;
      best = variant;
    }
  }
  return best;
}

function buildRowBlocks(lines: VisualLine[], headerIndex: number, market: EquityMarket): VisualLine[][] {
  const blocks: VisualLine[][] = [];
  let current: VisualLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (index === headerIndex) continue;
    const line = lines[index];
    const hasRealName = line.words.some(
      (word) => !isNumericWord(word) && /[\p{L}]/u.test(word.text) && !isTickerLike(word.text, market),
    );
    const hasNumbers = line.words.some((word) => isNumericWord(word));
    if (hasRealName && hasNumbers) {
      if (current.length) blocks.push(current);
      current = [line];
    } else if (current.length && hasNumbers && current.length < 3) {
      current.push(line);
    } else if (hasRealName && !hasNumbers && current.length && current.length < 3) {
      current.push(line);
    } else if (!current.length && hasRealName) {
      current = [line];
    }
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function parseVisualBlock(block: VisualLine[], columns: NumericColumn[], market: EquityMarket): ScreenshotHoldingDraft | null {
  const symbol = extractBlockSymbol(block, market);
  const name = extractBlockName(block, symbol, market);
  if (!name && !symbol) return null;
  const numbers = blockNumbersByColumn(block, columns);
  const quantityEntries = numbers.get("quantity");
  const valueEntries = numbers.get("value");
  const priceEntries = numbers.get("price");
  const firstPrice = pickColumnNumber(priceEntries);
  const firstValue = pickColumnNumber(valueEntries);
  let quantity = pickQuantity(quantityEntries, firstPrice, firstValue);
  const brokerCost = pickColumnNumber(numbers.get("cost"));
  const currentPrice = firstPrice;
  let marketValue = pickColumnNumber(valueEntries, { consistentWith: [quantity, currentPrice] });
  if (marketValue === null && valueEntries?.length) {
    marketValue = [...valueEntries].sort((left, right) => left.line - right.line)[valueEntries.length - 1].value;
  }
  if (marketValue === null && quantity !== null && currentPrice !== null) marketValue = quantity * currentPrice;
  const reconciled = reconcileQuantity(quantity, currentPrice, marketValue);
  if (reconciled !== null) quantity = reconciled;
  const confidenceWords = block.flatMap((line) => line.words);
  const confidence = confidenceWords.reduce((sum, word) => sum + word.confidence, 0) / Math.max(confidenceWords.length, 1);
  return buildLayoutRow({ symbol, name, quantity: quantity ?? 0, brokerCost: brokerCost ?? 0, currentPrice, marketValue }, market, confidence);
}

function parseVisualTable(lines: VisualLine[], market: EquityMarket): ScreenshotHoldingDraft[] {
  const headerIndex = findHeaderLineIndex(lines);
  if (headerIndex < 0) return [];
  const columns = buildColumnsFromHeader(lines[headerIndex], lines);
  if (columns.length < 2) return [];
  const blocks = buildRowBlocks(lines, headerIndex, market);
  const rows = blocks
    .map((block) => parseVisualBlock(block, columns, market))
    .filter((row): row is ScreenshotHoldingDraft => Boolean(row));
  return rows;
}

function buildLayoutRow(input: Omit<ScreenshotHoldingDraft, "warnings" | "confidence">, market: EquityMarket, wordConfidence: number): ScreenshotHoldingDraft {
  const consistency = valueConsistencyRatio(input);
  const warnings = rowWarnings(input, market);
  if (consistency !== null && consistency > 0.01) {
    warnings.push(`数量×现价与市值相差约${(consistency * 100).toFixed(1)}%，请复核`);
  }
  const completed = [input.name, input.quantity > 0, Number.isFinite(input.brokerCost), input.currentPrice !== null && input.currentPrice > 0, input.marketValue !== null && input.marketValue > 0].filter(Boolean).length;
  let confidence = Math.max(35, Math.min(98, Math.round(wordConfidence * 0.45 + completed * 10)));
  if (consistency !== null && consistency > 0.01) confidence = Math.max(35, confidence - 6);
  return {
    ...input,
    confidence,
    warnings,
  };
}

function valueConsistencyRatio(row: { quantity: number; currentPrice: number | null; marketValue: number | null }): number | null {
  if (!row.currentPrice || row.currentPrice <= 0 || row.quantity <= 0 || !row.marketValue || row.marketValue <= 0) return null;
  const implied = row.quantity * row.currentPrice;
  return Math.abs(implied - row.marketValue) / Math.max(row.marketValue, 1);
}

function duplicateScore(row: ScreenshotHoldingDraft): number {
  const ratio = valueConsistencyRatio(row);
  if (ratio === null) return 1;
  return ratio <= 0.01 ? 3 : ratio <= 0.05 ? 2 : 0;
}

/**
 * Picks the better of two duplicate rows: prefers the one whose quantity,
 * current price and market value are internally consistent (e.g. quantity 110
 * over a misread 10), then falls back to OCR confidence.
 */
export function preferRow(existing: ScreenshotHoldingDraft, candidate: ScreenshotHoldingDraft): boolean {
  const candidateScore = duplicateScore(candidate);
  const existingScore = duplicateScore(existing);
  return candidateScore > existingScore || (candidateScore === existingScore && candidate.confidence > existing.confidence);
}

function parseFutuLines(lines: VisualLine[], market: EquityMarket): ScreenshotHoldingDraft[] {
  const rows: ScreenshotHoldingDraft[] = [];
  for (let detailIndex = 0; detailIndex < lines.length; detailIndex += 1) {
    const detail = lines[detailIndex];
    const relaxedToken = /^[A-Za-z][A-Za-z0-9.-]{0,4}$/.test(detail.columns[0].trim()) ? detail.columns[0].trim() : "";
    const symbol = findSymbol(detail.columns[0], market)?.symbol ?? normalizeSymbol(relaxedToken, market);
    const quantity = firstNumber(detail.columns[1]) ?? 0;
    const brokerCost = firstNumber(detail.columns[2]) ?? 0;
    if (!isValidMarketSymbol(symbol, market) || quantity <= 0) continue;
    const nameIndex = [detailIndex - 1, detailIndex - 2].find((candidateIndex) => {
      if (candidateIndex < 0) return false;
      const candidateName = cleanedName(lines[candidateIndex].columns[0]);
      return Boolean(candidateName && normalizeSecurityName(candidateName) !== normalizeSecurityName(symbol));
    });
    const line = nameIndex === undefined ? undefined : lines[nameIndex];
    const name = line ? cleanedName(line.columns[0]) : symbol;
    const currentPrice = line ? firstNumber(line.columns[2]) : null;
    const marketValue = line ? firstNumber(line.columns[1]) : null;
    const confidenceWords = line ? [...line.words, ...detail.words] : detail.words;
    const confidence = confidenceWords.reduce((sum, word) => sum + word.confidence, 0) / confidenceWords.length;
    rows.push(buildLayoutRow({ symbol, name, quantity, brokerCost, currentPrice, marketValue }, market, confidence));
  }
  return rows;
}

function parsePinganLines(lines: VisualLine[], market: EquityMarket): ScreenshotHoldingDraft[] {
  const rows: ScreenshotHoldingDraft[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const name = cleanedName(line.columns[0]);
    const quantity = firstNumber(line.columns[2]);
    const brokerCost = firstNumber(line.columns[3]);
    if (!name || quantity === null || quantity <= 0 || brokerCost === null) continue;
    const detailIndex = lines.findIndex((candidate, candidateIndex) =>
      candidateIndex > index && candidateIndex <= index + 2 && firstNumber(candidate.columns[0]) !== null && firstNumber(candidate.columns[3]) !== null
    );
    const detail = detailIndex >= 0 ? lines[detailIndex] : undefined;
    const symbol = findSymbol(line.columns[0], market)?.symbol ?? "";
    const marketValue = detail ? firstNumber(detail.columns[0]) : null;
    const currentPrice = detail ? firstNumber(detail.columns[3]) : null;
    const confidenceWords = detail ? [...line.words, ...detail.words] : line.words;
    const confidence = confidenceWords.reduce((sum, word) => sum + word.confidence, 0) / confidenceWords.length;
    rows.push(buildLayoutRow({ symbol, name, quantity, brokerCost, currentPrice, marketValue }, market, confidence));
    if (detailIndex >= 0) index = detailIndex;
  }
  return rows;
}

function mergeDuplicateRows(rows: ScreenshotHoldingDraft[], market: EquityMarket): ScreenshotHoldingDraft[] {
  const merged = new Map<string, ScreenshotHoldingDraft>();
  for (const row of rows) {
    const normalizedSymbol = normalizeSymbol(row.symbol, market);
    const key = isValidMarketSymbol(normalizedSymbol, market) ? `symbol:${normalizedSymbol}` : `name:${normalizeSecurityName(row.name)}`;
    if (!key.endsWith(":")) {
      const existing = merged.get(key);
      if (!existing || preferRow(existing, row)) merged.set(key, row);
    }
  }
  return [...merged.values()];
}

function finishParse(rawText: string, market: EquityMarket, rows: ScreenshotHoldingDraft[]): ScreenshotParseResult {
  const warnings: string[] = [];
  if (!rows.length) warnings.push(`未识别到完整的${marketMeta[market].label}持仓，请换用更清晰且保留表头与完整持仓行的截图`);
  if (rows.some((row) => !row.symbol)) warnings.push("截图未显示代码的标的将按证券名称匹配，匹配不到也可先导入");
  if (rows.some((row) => row.confidence < 80)) warnings.push("部分字段置信度较低，确认导入前请重点查看黄色提示");
  const confidence = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length) : 0;
  return { market, rows, confidence, warnings, rawText };
}

export function parseBrokerScreenshotOcr(rawText: string, rawTsv: string, market: EquityMarket): ScreenshotParseResult {
  const normalizedText = rawText.replace(/\u00a0/g, " ").replace(/[，]/g, ",").replace(/[。]/g, ".").replace(/\r/g, "");
  const words = parseOcrTsv(rawTsv);
  const lines = clusterVisualLines(words);
  const tableRows = parseVisualTable(lines, market);
  if (tableRows.length) return finishParse(normalizedText, market, mergeDuplicateRows(tableRows, market));
  const layout = detectLayout(`${normalizedText}\n${lines.map((line) => line.text).join("\n")}`, market);
  const layoutRows = layout === "futu" ? parseFutuLines(lines, market) : layout === "pingan" ? parsePinganLines(lines, market) : [];
  if (layoutRows.length) return finishParse(normalizedText, market, mergeDuplicateRows(layoutRows, market));
  return parseBrokerScreenshotText(normalizedText, market);
}

export function parseBrokerScreenshotText(rawText: string, market: EquityMarket): ScreenshotParseResult {
  const normalizedText = rawText.replace(/\u00a0/g, " ").replace(/[，]/g, ",").replace(/[。]/g, ".").replace(/\r/g, "");
  const lines = normalizedText.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const rows = mergeDuplicateRows(lines.map((line) => parseLine(line, market)).filter((row): row is ScreenshotHoldingDraft => Boolean(row)), market);
  return finishParse(normalizedText, market, rows);
}

export function applyScreenshotImport(
  current: AppState,
  market: EquityMarket,
  rows: ScreenshotHoldingDraft[],
  options: ImportOptions = {},
): AppState {
  const now = options.now ?? new Date().toISOString();
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const validRows = rows.map((row) => {
    const symbol = normalizeSymbol(row.symbol, market);
    return { ...row, symbol: isValidMarketSymbol(symbol, market) ? symbol : "", name: cleanOcrName(row.name) };
  });
  if (!validRows.length) throw new Error("没有可导入的持仓记录");
  if (validRows.some((row) => !row.name)) throw new Error("每条持仓都必须识别到证券名称");
  if (validRows.some((row) => !Number.isFinite(row.quantity) || row.quantity <= 0)) throw new Error("持仓数量必须大于0");
  const rowKeys = validRows.map((row) => row.symbol ? `symbol:${row.symbol}` : `name:${normalizeSecurityName(row.name)}`);
  if (new Set(rowKeys).size !== rowKeys.length) throw new Error("截图中存在重复证券名称或代码");

  const snapshotId = idFactory();
  const versionId = idFactory();
  const importJobId = idFactory();
  const account = current.accounts.find((item) => item.market === market) ?? {
    id: idFactory(),
    name: `${marketMeta[market].label}截图导入账户`,
    broker: "券商截图",
    market,
    currency: marketMeta[market].currency,
    owner: "self" as const,
    isPrimary: !current.accounts.some((item) => item.isPrimary),
    createdAt: now,
    updatedAt: now,
  };
  const accountWasCreated = !current.accounts.some((item) => item.id === account.id);
  const instruments = [...current.instruments];
  const holdings = [...current.holdings];
  const quotes = [...current.quotes];

  for (const row of validRows) {
    let instrument = findMatchingInstrument(instruments, market, row);
    const matchedByName = Boolean(instrument && (!row.symbol || normalizeSymbol(instrument.symbol, market) !== row.symbol));
    if (!instrument) {
      instrument = {
        id: idFactory(),
        symbol: row.symbol || localNameSymbol(row.name, market),
        name: row.name,
        market,
        currency: marketMeta[market].currency,
        assetType: "stock",
        sectors: [],
        styles: [],
        isLeveraged: false,
      };
      instruments.push(instrument);
    } else {
      const instrumentIndex = instruments.findIndex((item) => item.id === instrument?.id);
      const resolvedSymbol = row.symbol && isNameOnlySymbol(instrument.symbol) ? row.symbol : instrument.symbol;
      instruments[instrumentIndex] = { ...instrument, symbol: resolvedSymbol };
      instrument = instruments[instrumentIndex];
    }

    const holdingIndex = holdings.findIndex((item) => item.instrumentId === instrument?.id && item.accountId === account.id && item.status === "open");
    const importTag = isNameOnlySymbol(instrument.symbol) ? "名称待匹配" : matchedByName ? "名称匹配" : "代码匹配";
    if (holdingIndex >= 0) {
      const existing = holdings[holdingIndex];
      holdings[holdingIndex] = {
        ...existing,
        quantity: row.quantity,
        brokerCost: row.brokerCost,
        economicCost: existing.economicCost,
        tags: [...new Set([...existing.tags, "截图导入", importTag])],
        updatedAt: now,
      };
    } else {
      holdings.push({
        id: idFactory(),
        accountId: account.id,
        instrumentId: instrument.id,
        quantity: row.quantity,
        brokerCost: row.brokerCost,
        economicCost: row.brokerCost,
        status: "open",
        thesis: "",
        tags: ["截图导入", importTag],
        openedAt: now,
        closedAt: null,
        updatedAt: now,
      });
    }

    if (row.currentPrice !== null && row.currentPrice > 0) {
      const quote = {
        instrumentId: instrument.id,
        price: row.currentPrice,
        previousClose: null,
        currency: marketMeta[market].currency,
        marketTime: null,
        fetchedAt: now,
        source: "券商持仓截图（用户确认）",
        freshness: "stale" as const,
        isFallback: true,
      };
      const quoteIndex = quotes.findIndex((item) => item.instrumentId === instrument?.id);
      if (quoteIndex >= 0) quotes[quoteIndex] = quote;
      else quotes.push(quote);
    }
  }

  const accounts = accountWasCreated ? [...current.accounts, account] : current.accounts;
  const portfolios = accountWasCreated && current.portfolios.length
    ? current.portfolios.map((portfolio, index) => index === 0 ? { ...portfolio, accountIds: [...new Set([...portfolio.accountIds, account.id])], updatedAt: now } : portfolio)
    : current.portfolios;
  const averageConfidence = Math.round(validRows.reduce((sum, row) => sum + row.confidence, 0) / validRows.length);
  const rowWarningsList = validRows.flatMap((row) => row.warnings.map((warning) => `${row.name}：${warning}`));

  return AppStateSchema.parse({
    ...current,
    updatedAt: now,
    mode: "local",
    accounts,
    portfolios,
    instruments,
    holdings,
    quotes,
    snapshots: [...current.snapshots, {
      id: snapshotId,
      versionId: current.dataVersions.at(-1)?.id ?? "unknown",
      createdAt: now,
      reason: `${marketMeta[market].label}持仓截图导入前自动备份`,
      holdings: structuredClone(current.holdings),
      cashBalances: structuredClone(current.cashBalances),
      transactions: structuredClone(current.transactions),
    }],
    dataVersions: [...current.dataVersions, {
      id: versionId,
      label: `${marketMeta[market].label}截图导入`,
      reason: `用户确认导入 ${validRows.length} 条持仓；未在截图出现的持仓保持不变`,
      createdAt: now,
      source: "import",
      checksum: `screenshot-${market.toLowerCase()}-${validRows.length}-${now}`,
    }],
    importJobs: [...current.importJobs, {
      id: importJobId,
      format: "broker_image",
      status: "confirmed",
      startedAt: now,
      completedAt: now,
      confidence: averageConfidence,
      warnings: rowWarningsList,
      rawRowCount: validRows.length,
      versionId,
    }],
  });
}

export function marketLabel(market: EquityMarket): string {
  return marketMeta[market].label;
}

export function marketCurrency(market: EquityMarket): "CNY" | "USD" | "HKD" {
  return marketMeta[market].currency;
}
