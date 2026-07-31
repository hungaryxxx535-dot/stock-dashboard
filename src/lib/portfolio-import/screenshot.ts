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

const numberPattern = /[-−—]?\d[\d,]*(?:\.\d+)?/g;
const tableWords = /(名称|代码|市值|数量|持仓|可用|成本|现价|盈亏|参考|资产|证券|基金|债券|查看|管理|买入|卖出|撤单|查询|NAME|SYMBOL|VALUE|QTY|COST|PRICE|HOLDING)/gi;

function numberFrom(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value
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

function nameDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
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
        : nameDistance(name, candidate) / Math.max(name.length, candidate.length),
    }))
    .sort((left, right) => left.score - right.score)
    .find(({ score }) => score <= 0.18)?.item;
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
  const withoutSymbol = `${line.slice(0, symbolMatch.index)} ${line.slice(symbolMatch.index + symbolMatch.raw.length)}`
    .replace(numberPattern, " ")
    .replace(/[|｜:：/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleaned = withoutSymbol.replace(tableWords, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return symbolMatch.raw.toUpperCase();
  if (market === "US") {
    const words = cleaned.split(" ").filter((word) => !stopWords.has(word.toUpperCase()));
    return words.slice(0, 6).join(" ") || symbolMatch.raw.toUpperCase();
  }
  return cleaned.slice(0, 32);
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
  const fallbackNumbers = (afterSymbol.match(numberPattern) ?? [])
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
    .replace(numberPattern, " ")
    .replace(/[|｜:：/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || !/[\p{L}]/u.test(name)) return "";
  if (/^(?:SH|SZ|HK)?\d+$/.test(name) || stopWords.has(name.toUpperCase())) return "";
  return name.slice(0, 40);
}

function buildLayoutRow(input: Omit<ScreenshotHoldingDraft, "warnings" | "confidence">, market: EquityMarket, wordConfidence: number): ScreenshotHoldingDraft {
  const warnings = rowWarnings(input, market);
  const completed = [input.name, input.quantity > 0, Number.isFinite(input.brokerCost), input.currentPrice !== null && input.currentPrice > 0, input.marketValue !== null && input.marketValue > 0].filter(Boolean).length;
  return {
    ...input,
    confidence: Math.max(35, Math.min(98, Math.round(wordConfidence * 0.45 + completed * 10))),
    warnings,
  };
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
      if (!existing || row.confidence > existing.confidence) merged.set(key, row);
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
    return { ...row, symbol: isValidMarketSymbol(symbol, market) ? symbol : "", name: row.name.trim() };
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
