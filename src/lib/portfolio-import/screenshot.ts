import { AppStateSchema, type AppState } from "@/domain/model";

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

type ImportOptions = {
  now?: string;
  idFactory?: () => string;
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

const numberPattern = /-?\d[\d,]*(?:\.\d+)?/g;

function numberFrom(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSymbol(value: string, market: EquityMarket): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (market === "CN") return normalized.replace(/^(?:SH|SZ)/, "").replace(/\.(?:SH|SZ)$/, "");
  if (market === "HK") return normalized.replace(/^HK/, "").replace(/\.HK$/, "").padStart(5, "0");
  return normalized.replace(/^(?:NASDAQ|NYSE|AMEX):?/, "").replace(/\s/g, "");
}

export function isValidMarketSymbol(symbol: string, market: EquityMarket): boolean {
  if (market === "CN") return /^\d{6}$/.test(symbol);
  if (market === "HK") return /^\d{5}$/.test(symbol);
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) && !stopWords.has(symbol);
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
    const match = text.match(new RegExp(`${label}\\s*[:：]?\\s*(-?\\d[\\d,]*(?:\\.\\d+)?)`, "i"));
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
  const cleaned = withoutSymbol
    .replace(/(持仓|数量|股数|成本价?|平均价|现价|最新价|市价|市值|盈亏|浮动|可用|参考)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return symbolMatch.raw.toUpperCase();
  if (market === "US") {
    const words = cleaned.split(" ").filter((word) => !stopWords.has(word.toUpperCase()));
    return words.slice(0, 4).join(" ") || symbolMatch.raw.toUpperCase();
  }
  return cleaned.slice(0, 32);
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
  const warnings: string[] = [];
  if (quantity <= 0) warnings.push("持仓数量未识别或不大于0");
  if (!Number.isFinite(brokerCost)) warnings.push("券商成本无法识别");
  if (brokerCost < 0) warnings.push("识别到负成本；将保留券商口径，请重点复核");
  if (currentPrice === null || currentPrice <= 0) warnings.push("截图现价未识别");
  if (inferName(line, symbolMatch, market) === symbolMatch.raw.toUpperCase()) warnings.push("证券名称未识别");
  const completed = [
    quantity > 0,
    Number.isFinite(brokerCost),
    currentPrice !== null && currentPrice > 0,
    marketValue !== null && marketValue > 0,
  ].filter(Boolean).length;

  return {
    symbol: symbolMatch.symbol,
    name: inferName(line, symbolMatch, market),
    quantity,
    brokerCost,
    currentPrice,
    marketValue,
    confidence: Math.round(35 + completed * 15),
    warnings,
  };
}

function mergeDuplicateRows(rows: ScreenshotHoldingDraft[]): ScreenshotHoldingDraft[] {
  const merged = new Map<string, ScreenshotHoldingDraft>();
  for (const row of rows) {
    const existing = merged.get(row.symbol);
    if (!existing || row.confidence > existing.confidence) merged.set(row.symbol, row);
  }
  return [...merged.values()];
}

export function parseBrokerScreenshotText(rawText: string, market: EquityMarket): ScreenshotParseResult {
  const normalizedText = rawText
    .replace(/\u00a0/g, " ")
    .replace(/[，]/g, ",")
    .replace(/[。]/g, ".")
    .replace(/\r/g, "");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const rows = mergeDuplicateRows(lines.map((line) => parseLine(line, market)).filter((row): row is ScreenshotHoldingDraft => Boolean(row)));
  const warnings: string[] = [];
  if (!rows.length) warnings.push(`未识别到${marketMeta[market].label}证券代码，请换用更清晰且包含完整持仓行的截图`);
  if (rows.some((row) => row.confidence < 80)) warnings.push("部分字段置信度较低，确认导入前必须逐条核对");
  const confidence = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length)
    : 0;
  return { market, rows, confidence, warnings, rawText: normalizedText };
}

export function applyScreenshotImport(
  current: AppState,
  market: EquityMarket,
  rows: ScreenshotHoldingDraft[],
  options: ImportOptions = {},
): AppState {
  const now = options.now ?? new Date().toISOString();
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const validRows = rows.map((row) => ({
    ...row,
    symbol: normalizeSymbol(row.symbol, market),
    name: row.name.trim() || normalizeSymbol(row.symbol, market),
  }));
  if (!validRows.length) throw new Error("没有可导入的持仓记录");
  if (validRows.some((row) => !isValidMarketSymbol(row.symbol, market))) throw new Error("存在不符合所选市场规则的证券代码");
  if (validRows.some((row) => !Number.isFinite(row.quantity) || row.quantity <= 0)) throw new Error("持仓数量必须大于0");
  if (new Set(validRows.map((row) => row.symbol)).size !== validRows.length) throw new Error("截图中存在重复证券代码");

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
    let instrument = instruments.find((item) => item.market === market && normalizeSymbol(item.symbol, market) === row.symbol);
    if (!instrument) {
      instrument = {
        id: idFactory(),
        symbol: row.symbol,
        name: row.name,
        market,
        currency: marketMeta[market].currency,
        assetType: "stock",
        sectors: [],
        styles: [],
        isLeveraged: false,
      };
      instruments.push(instrument);
    } else if (row.name !== row.symbol && instrument.name !== row.name) {
      const instrumentIndex = instruments.findIndex((item) => item.id === instrument?.id);
      instruments[instrumentIndex] = { ...instrument, name: row.name };
      instrument = instruments[instrumentIndex];
    }

    const holdingIndex = holdings.findIndex((item) =>
      item.instrumentId === instrument?.id && item.accountId === account.id && item.status === "open"
    );
    if (holdingIndex >= 0) {
      const existing = holdings[holdingIndex];
      holdings[holdingIndex] = {
        ...existing,
        quantity: row.quantity,
        brokerCost: row.brokerCost,
        economicCost: existing.economicCost,
        tags: [...new Set([...existing.tags, "截图导入"])],
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
        tags: ["截图导入"],
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
    ? current.portfolios.map((portfolio, index) => index === 0
      ? { ...portfolio, accountIds: [...new Set([...portfolio.accountIds, account.id])], updatedAt: now }
      : portfolio)
    : current.portfolios;
  const averageConfidence = Math.round(validRows.reduce((sum, row) => sum + row.confidence, 0) / validRows.length);
  const rowWarnings = validRows.flatMap((row) => row.warnings.map((warning) => `${row.symbol}：${warning}`));

  return AppStateSchema.parse({
    ...current,
    updatedAt: now,
    mode: "local",
    accounts,
    portfolios,
    instruments,
    holdings,
    quotes,
    snapshots: [
      ...current.snapshots,
      {
        id: snapshotId,
        versionId: current.dataVersions.at(-1)?.id ?? "unknown",
        createdAt: now,
        reason: `${marketMeta[market].label}持仓截图导入前自动备份`,
        holdings: structuredClone(current.holdings),
        cashBalances: structuredClone(current.cashBalances),
        transactions: structuredClone(current.transactions),
      },
    ],
    dataVersions: [
      ...current.dataVersions,
      {
        id: versionId,
        label: `${marketMeta[market].label}截图导入`,
        reason: `用户确认导入 ${validRows.length} 条持仓；未在截图出现的持仓保持不变`,
        createdAt: now,
        source: "import",
        checksum: `screenshot-${market.toLowerCase()}-${validRows.length}-${now}`,
      },
    ],
    importJobs: [
      ...current.importJobs,
      {
        id: importJobId,
        format: "broker_image",
        status: "confirmed",
        startedAt: now,
        completedAt: now,
        confidence: averageConfidence,
        warnings: rowWarnings,
        rawRowCount: validRows.length,
        versionId,
      },
    ],
  });
}

export function marketLabel(market: EquityMarket): string {
  return marketMeta[market].label;
}

export function marketCurrency(market: EquityMarket): "CNY" | "USD" | "HKD" {
  return marketMeta[market].currency;
}
