import { getALiveQuotes } from "@/lib/aLiveApi";
import type { MacroIndicator, MarketIntelligencePayload, MarketRegime, SourceStatus } from "./types";

const FRED_CSV_ENDPOINT = "https://fred.stlouisfed.org/graph/fredgraph.csv";

function numberValue(value: string | undefined): number | null {
  if (!value || value === ".") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function direction(value: number | null, previous: number | null): MacroIndicator["direction"] {
  if (value === null || previous === null) return "unknown";
  if (Math.abs(value - previous) < 1e-9) return "flat";
  return value > previous ? "up" : "down";
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "text/csv,text/plain,*/*" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function publicFredSeries(seriesId: string) {
  const url = new URL(FRED_CSV_ENDPOINT);
  url.searchParams.set("id", seriesId);
  const csv = await fetchText(url.toString());
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, value] = line.split(",");
      return { date, value };
    })
    .filter((row) => numberValue(row.value) !== null)
    .reverse();
  return rows.slice(0, 2);
}

export async function loadFredPublicFallback(): Promise<{
  macro: MacroIndicator[];
  status: SourceStatus;
  warnings: string[];
}> {
  const targets = [
    ["DGS10", "美国10年期国债收益率", "%"],
    ["DGS2", "美国2年期国债收益率", "%"],
    ["VIXCLS", "VIX恐慌指数", "点"],
    ["DTWEXBGS", "美元广义指数", "点"],
  ] as const;
  const results = await Promise.allSettled(targets.map(([id]) => publicFredSeries(id)));
  const macro: MacroIndicator[] = [];
  const warnings: string[] = [];

  results.forEach((result, index) => {
    const [id, name, unit] = targets[index];
    if (result.status === "rejected") {
      warnings.push(`${name}公开序列读取失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
      return;
    }
    const [latest, previous] = result.value;
    const value = numberValue(latest?.value);
    const previousValue = numberValue(previous?.value);
    let interpretation = "用于判断海外流动性和风险偏好";
    if (id === "VIXCLS" && value !== null) interpretation = value < 20 ? "海外波动率较低，风险偏好相对稳定" : value >= 30 ? "海外避险情绪显著升温" : "海外波动处于偏高区间";
    if (id === "DGS10" && value !== null) interpretation = value >= 4.5 ? "长端美债收益率偏高，对成长估值构成压力" : "长端利率压力相对可控";
    macro.push({
      id: id.toLowerCase(),
      name,
      value,
      previous: previousValue,
      unit,
      period: latest?.date ?? "",
      direction: direction(value, previousValue),
      interpretation,
      source: "FRED官方公开CSV",
    });
  });

  const ten = macro.find((item) => item.id === "dgs10")?.value;
  const two = macro.find((item) => item.id === "dgs2")?.value;
  if (ten !== undefined && ten !== null && two !== undefined && two !== null) {
    const spread = ten - two;
    macro.push({
      id: "us_2s10s",
      name: "美债2Y-10Y利差",
      value: spread,
      previous: null,
      unit: "百分点",
      period: macro.find((item) => item.id === "dgs10")?.period ?? "",
      direction: "unknown",
      interpretation: spread < 0 ? "收益率曲线倒挂，海外增长预期仍偏谨慎" : "收益率曲线为正，衰退定价压力相对减弱",
      source: "FRED官方公开CSV",
    });
  }

  return {
    macro,
    warnings,
    status: {
      id: "fred-public",
      name: "FRED公开序列",
      status: macro.length ? (warnings.length ? "partial" : "online") : "error",
      updatedAt: new Date().toISOString(),
      message: macro.length ? `免密钥读取${macro.length}项海外利率与波动数据` : "FRED公开序列暂不可用",
    },
  };
}

export async function loadAksharePortfolioPulse(): Promise<{
  macro: MacroIndicator[];
  status: SourceStatus;
  warnings: string[];
}> {
  try {
    const live = await getALiveQuotes();
    if (live.status !== "updated") {
      return {
        macro: [],
        warnings: [live.description || live.disclaimer || "AKShare实时行情未更新"],
        status: {
          id: "akshare-live",
          name: "AKShare实时行情服务",
          status: live.source === "本地静态持仓回退" ? "not_configured" : "error",
          updatedAt: new Date().toISOString(),
          message: live.description || live.disclaimer || "未获得实时行情",
        },
      };
    }

    const valid = live.quotes.filter((quote) => quote.changePct !== null && Number.isFinite(quote.changePct));
    const rising = valid.filter((quote) => (quote.changePct ?? 0) > 0).length;
    const falling = valid.filter((quote) => (quote.changePct ?? 0) < 0).length;
    const flat = valid.length - rising - falling;
    const averageChange = valid.length ? valid.reduce((sum, quote) => sum + (quote.changePct ?? 0), 0) / valid.length : null;
    const totalAmount = live.quotes.reduce((sum, quote) => sum + (quote.amount ?? 0), 0);
    const breadth = valid.length ? ((rising - falling) / valid.length) * 100 : null;

    const macro: MacroIndicator[] = [
      {
        id: "portfolio_avg_change",
        name: "当前持仓平均涨跌幅",
        value: averageChange,
        previous: null,
        unit: "%",
        period: live.updatedAt,
        direction: averageChange === null ? "unknown" : averageChange > 0 ? "up" : averageChange < 0 ? "down" : "flat",
        interpretation: averageChange === null ? "实时数据不足" : averageChange > 1 ? "当前持仓整体偏强" : averageChange < -1 ? "当前持仓整体承压" : "当前持仓盘面分化或震荡",
        source: live.source,
      },
      {
        id: "portfolio_breadth",
        name: "持仓涨跌家数差",
        value: breadth,
        previous: null,
        unit: "%",
        period: live.updatedAt,
        direction: breadth === null ? "unknown" : breadth > 0 ? "up" : breadth < 0 ? "down" : "flat",
        interpretation: `上涨${rising}只、下跌${falling}只、平盘${flat}只；用于判断你的持仓盘面，不代表全市场宽度。`,
        source: live.source,
      },
      {
        id: "portfolio_amount",
        name: "已覆盖持仓成交额",
        value: totalAmount > 0 ? totalAmount : null,
        previous: null,
        unit: "元",
        period: live.updatedAt,
        direction: "unknown",
        interpretation: "仅汇总AKShare服务当前覆盖标的的成交额，不等于A股全市场成交额。",
        source: live.source,
      },
    ];

    return {
      macro,
      warnings: [],
      status: {
        id: "akshare-live",
        name: "AKShare实时行情服务",
        status: valid.length ? "online" : "partial",
        updatedAt: new Date().toISOString(),
        message: `已覆盖${live.quotes.length}只持仓，其中${valid.length}只具备实时涨跌幅`,
      },
    };
  } catch (error) {
    return {
      macro: [],
      warnings: [error instanceof Error ? error.message : "AKShare实时行情读取失败"],
      status: {
        id: "akshare-live",
        name: "AKShare实时行情服务",
        status: "error",
        updatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "读取失败",
      },
    };
  }
}

function recomputeRegime(payload: MarketIntelligencePayload): MarketRegime {
  let score = 50;
  let evidence = 0;
  const reasons: string[] = [];

  if (payload.indices.length) {
    const average = payload.indices.reduce((sum, item) => sum + item.pctChange, 0) / payload.indices.length;
    score += Math.max(-15, Math.min(15, average * 5));
    evidence += 2;
    reasons.push(`主要A股指数平均涨跌${average >= 0 ? "+" : ""}${average.toFixed(2)}%`);
  }

  const portfolioAverage = payload.macro.find((item) => item.id === "portfolio_avg_change")?.value;
  if (portfolioAverage !== undefined && portfolioAverage !== null) {
    score += Math.max(-8, Math.min(8, portfolioAverage * 2.5));
    evidence += 1;
    reasons.push(`当前持仓平均涨跌${portfolioAverage >= 0 ? "+" : ""}${portfolioAverage.toFixed(2)}%`);
  }

  const breadth = payload.macro.find((item) => item.id === "portfolio_breadth")?.value;
  if (breadth !== undefined && breadth !== null) {
    score += Math.max(-6, Math.min(6, breadth / 12));
    evidence += 1;
    reasons.push(`持仓涨跌家数差为${breadth.toFixed(1)}%`);
  }

  const north = payload.macro.find((item) => item.id === "north_money")?.value;
  if (north !== undefined && north !== null) {
    score += north > 0 ? 7 : -7;
    evidence += 1;
    reasons.push(`北向资金${north > 0 ? "净流入" : "净流出"}${Math.abs(north).toFixed(0)}百万元`);
  }

  const pmi = payload.macro.find((item) => item.id === "cn_pmi")?.value;
  if (pmi !== undefined && pmi !== null) {
    score += pmi >= 50 ? 6 : -6;
    evidence += 1;
    reasons.push(`制造业PMI为${pmi.toFixed(1)}，处于${pmi >= 50 ? "扩张" : "收缩"}区间`);
  }

  const vix = payload.macro.find((item) => item.id === "vixcls")?.value;
  if (vix !== undefined && vix !== null) {
    score += vix < 20 ? 6 : vix >= 30 ? -10 : -3;
    evidence += 1;
    reasons.push(`VIX为${vix.toFixed(1)}，海外波动${vix < 20 ? "较低" : vix >= 30 ? "显著升高" : "偏高"}`);
  }

  const tenYear = payload.macro.find((item) => item.id === "dgs10")?.value;
  if (tenYear !== undefined && tenYear !== null) {
    score += tenYear >= 4.5 ? -6 : 2;
    evidence += 1;
    reasons.push(`美国10年期国债收益率${tenYear.toFixed(2)}%`);
  }

  const positiveNews = payload.news.filter((item) => item.impact === "利多").length;
  const negativeNews = payload.news.filter((item) => item.impact === "利空").length;
  if (payload.news.length) {
    score += Math.max(-6, Math.min(6, (positiveNews - negativeNews) * 0.8));
    evidence += 1;
    reasons.push(`过去24小时规则初筛利多${positiveNews}条、利空${negativeNews}条，其余需人工判断`);
  }

  score = Math.round(Math.max(0, Math.min(100, score)));
  if (evidence < 2) {
    return {
      label: "数据不足",
      score: null,
      confidence: Math.round((evidence / 7) * 100),
      reasons: reasons.length ? reasons : ["外部数据源尚未形成有效证据链"],
      actionBias: "暂不根据外部环境调整仓位，只保留持仓结构分析。",
    };
  }
  const label: MarketRegime["label"] = score >= 62 ? "风险偏好改善" : score <= 42 ? "风险偏好收缩" : "震荡中性";
  return {
    label,
    score,
    confidence: Math.min(100, 35 + evidence * 9),
    reasons,
    actionBias: label === "风险偏好改善" ? "可以寻找确认后的进攻机会，但不得忽视估值、仓位和事件风险。" : label === "风险偏好收缩" ? "优先控制回撤、减少追涨，等待宏观和市场信号企稳。" : "保持中性仓位，优先做高胜率的结构优化。",
  };
}

export async function extendMarketIntelligence(payload: MarketIntelligencePayload): Promise<MarketIntelligencePayload> {
  const [akshare, publicFred] = await Promise.all([
    loadAksharePortfolioPulse(),
    payload.macro.some((item) => item.source === "FRED") ? Promise.resolve(null) : loadFredPublicFallback(),
  ]);

  const macro = [...payload.macro, ...akshare.macro, ...(publicFred?.macro ?? [])];
  const sourceStatus = [
    ...payload.sourceStatus.filter((item) => !(item.id === "fred" && publicFred?.macro.length)),
    akshare.status,
    ...(publicFred ? [publicFred.status] : []),
  ];
  const warnings = [
    ...payload.warnings.filter((warning) => !(publicFred?.macro.length && warning.includes("FRED尚未配置"))),
    ...akshare.warnings,
    ...(publicFred?.warnings ?? []),
  ];
  const extended = { ...payload, macro, sourceStatus, warnings };
  return { ...extended, regime: recomputeRegime(extended) };
}
