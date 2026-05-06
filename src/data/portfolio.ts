export type Suggestion = "持有" | "观察" | "分批锁盈" | "谨慎" | "加仓候选";

export type AShareHolding = {
  name: string;
  code: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  type: "核心仓" | "趋势仓" | "防守仓" | "观察仓";
  suggestion: Suggestion;
  note: string;
};

export type UsHolding = {
  name: string;
  code: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  stopLoss: number;
  targetPrice: number;
  trend: string;
  type: "核心仓" | "中概仓" | "趋势仓" | "观察仓" | "杠杆仓";
  note: string;
};

export type OperationRecord = {
  date: string;
  market: string;
  symbol: string;
  action: string;
  reason: string;
  result: string;
};

export const dataVersion = {
  aShare: "2026-04-28 持仓截图口径",
  us: "2026-05-05 持仓截图口径",
  description: "当前仍为 Mock/静态数据，不是实时行情。",
};

export const accountSnapshot = {
  aShare: {
    totalAssets: 1190647.76,
    marketValue: 1078700.75,
    availableCash: 112160.86,
    offsiteCash: 300000,
    totalFlexibleCash: 412000,
    brokerPositionPct: 90.6,
    overallPositionPct: 72,
    note: "券商账户仓位高，但整体资金口径不是满仓；场外约30万元机动资金需纳入判断。",
  },
  us: {
    accountDisplayUsd: 16638.64,
    holdingsValueUsd: 29698.09,
    holdingsPnlUsd: 2945.25,
    note: "当前为静态持仓，不是实时价格。",
  },
};

export const portfolioParams = {
  cash: 412000,
  usdRate: 7.2,
  riskThresholds: {
    stockPositionYellow: 80,
    techConcentrationYellow: 62,
    cashPctWarning: 10,
  },
  todayCommand: "今日总指令：不追高，优先看减仓与锁盈。",
  riskLight: "黄灯",
};

export const aShareHoldings: AShareHolding[] = [
  { name: "澜起科技", code: "688008", quantity: 825, costPrice: 106.255, currentPrice: 171.49, marketValue: 141479.25, pnl: 53818.46, type: "核心仓", suggestion: "分批锁盈", note: "主力核心仓，浮盈较大，优先用移动止盈保护利润。" },
  { name: "科创芯50", code: "588750", quantity: 131000, costPrice: 1.542, currentPrice: 1.948, marketValue: 255188, pnl: 53186, type: "核心仓", suggestion: "持有", note: "已减仓后的最新口径，仍是科创芯片主力仓。" },
  { name: "科创半导", code: "588170", quantity: 116600, costPrice: 1.732, currentPrice: 1.921, marketValue: 223988.6, pnl: 22037.4, type: "核心仓", suggestion: "持有", note: "与科创芯50相关度高，合并看科技集中度。" },
  { name: "科创200", code: "588220", quantity: 86100, costPrice: 1.736, currentPrice: 1.873, marketValue: 161255.3, pnl: 11812.92, type: "核心仓", suggestion: "观察", note: "科创弹性仓，回撤时看承接。" },
  { name: "招商银行", code: "600036", quantity: 2400, costPrice: 39.751, currentPrice: 39.3, marketValue: 94320, pnl: -1083.36, type: "防守仓", suggestion: "持有", note: "组合稳定器，承担防守和分红属性。" },
  { name: "通信ETF", code: "515880", quantity: 47400, costPrice: 0.681, currentPrice: 1.335, marketValue: 63279, pnl: 30990.12, type: "趋势仓", suggestion: "分批锁盈", note: "浮盈大，趋势仍强，但不适合追高。" },
  { name: "AI创业板", code: "159381", quantity: 19600, costPrice: 2.218, currentPrice: 2.64, marketValue: 51744, pnl: 8269.24, type: "趋势仓", suggestion: "观察", note: "AI弹性补充仓，控制节奏。" },
  { name: "胜宏科技", code: "300476", quantity: 100, costPrice: 207.937, currentPrice: 314.33, marketValue: 31433, pnl: 10639.29, type: "趋势仓", suggestion: "分批锁盈", note: "PCB/算力方向小仓趋势票，浮盈较大。" },
  { name: "金ETF", code: "518880", quantity: 1600, costPrice: 5.606, currentPrice: 10.241, marketValue: 16385.6, pnl: 7415.68, type: "防守仓", suggestion: "持有", note: "风险对冲资产，用于平滑组合波动。" },
  { name: "有色ETF", code: "159980", quantity: 3900, costPrice: 0, currentPrice: 2.052, marketValue: 8002.8, pnl: 0, type: "防守仓", suggestion: "观察", note: "券商App成本显示异常，先只记录市值。" },
  { name: "其他小仓位", code: "MISC", quantity: 1, costPrice: 0, currentPrice: 0, marketValue: 29000, pnl: 0, type: "观察仓", suggestion: "观察", note: "卫星ETF、欣灵电气、海信家电、五洲新春等零散观察仓合并展示。" },
];

export const usHoldings: UsHolding[] = [
  { name: "Meta Platforms", code: "META", quantity: 24, costPrice: 602.918, currentPrice: 607.76, marketValue: 14586.24, pnl: 116.21, stopLoss: 540, targetPrice: 680, trend: "核心持有", type: "核心仓", note: "美股第一大仓，核心锚。" },
  { name: "腾讯音乐", code: "TME", quantity: 500, costPrice: 10.5, currentPrice: 9.045, marketValue: 4522.5, pnl: -727.5, stopLoss: 8.1, targetPrice: 10.8, trend: "中概修复", type: "中概仓", note: "当前浮亏，关注中概情绪。" },
  { name: "Amphenol", code: "APH", quantity: 23, costPrice: 135.914, currentPrice: 144.285, marketValue: 3318.55, pnl: 192.53, stopLoss: 128, targetPrice: 158, trend: "核心趋势", type: "核心仓", note: "连接器龙头，偏稳。" },
  { name: "AMD", code: "AMD", quantity: 8, costPrice: 203.331, currentPrice: 351.74, marketValue: 2813.12, pnl: 1187.27, stopLoss: 315, targetPrice: 395, trend: "高波动趋势", type: "趋势仓", note: "AI芯片弹性仓，避免追高加码。" },
  { name: "Rambus", code: "RMBS", quantity: 11, costPrice: 97.7, currentPrice: 111, marketValue: 1221, pnl: 146.3, stopLoss: 98, targetPrice: 128, trend: "观察上行", type: "观察仓", note: "小仓观察。" },
  { name: "Direxion MSFT 2X", code: "MSFU", quantity: 23, costPrice: 31.767, currentPrice: 27.93, marketValue: 642.39, pnl: -88.25, stopLoss: 24.5, targetPrice: 32, trend: "杠杆仓，高风险", type: "杠杆仓", note: "严格小仓，不能补跌。" },
  { name: "拼多多", code: "PDD", quantity: 4, costPrice: 101.858, currentPrice: 98.8, marketValue: 395.2, pnl: -12.23, stopLoss: 88, targetPrice: 118, trend: "观察修复", type: "观察仓", note: "中概小仓观察。" },
  { name: "Intel", code: "INTC", quantity: 4, costPrice: 46.169, currentPrice: 98.916, marketValue: 395.33, pnl: 210.99, stopLoss: 86, targetPrice: 115, trend: "剩余趋势仓", type: "趋势仓", note: "已减半，剩余小仓趋势仓。" },
];

export const operationRecords: OperationRecord[] = [
  { date: "2026-05-06", market: "A股", symbol: "整体账户", action: "风控备忘", reason: "科技仓位集中度偏高", result: "不追高，优先看减仓与锁盈。" },
  { date: "2026-05-06", market: "A股", symbol: "科创芯50/科创半导", action: "观察", reason: "主线仓位重叠", result: "继续持有，但不再叠加同方向仓位。" },
  { date: "2026-05-06", market: "美股", symbol: "META / AMD", action: "持有", reason: "核心趋势仍在", result: "用止损线管理，不因盘中波动随意加仓。" },
];

export const settingsNotes = [
  "当前数据来源：手动静态录入。",
  "当前不接真实行情，不接数据库，不做登录。",
  "后续可接入持仓表格导入、手动更新价格、实时行情 API、Gmail/扣子日报同步、风险提醒推送。",
];
