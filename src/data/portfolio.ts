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
  aShare: "2026-05-07 北京时间16:56 A股持仓截图口径",
  us: "2026-05-07 北京时间17:51 美股持仓截图口径",
  description: "持仓数量和成本价来自手动维护清单；行情页接入价格后自动估算市值与浮盈亏，非券商账户实时同步。",
};

export const accountSnapshot = {
  aShare: {
    totalAssets: 1316590.82,
    marketValue: 1242890.35,
    availableCash: 69905.43,
    offsiteCash: 300000,
    totalFlexibleCash: 369905.43,
    brokerPositionPct: 95.9,
    overallPositionPct: 76.9,
    totalPnl: 355867.61,
    todayPnl: 32527.35,
    todayPnlPct: 2.53,
    note: "券商账户仓位95.9%，账户内现金约6.99万元；整体资金口径仍需纳入场外约30万元机动资金。",
  },
  us: {
    accountDisplayUsd: 17311.05,
    holdingsValueUsd: 30713.39,
    holdingsPnlUsd: 3638.48,
    todayPnlUsd: 20.32,
    note: "当前为北京时间17:51截图口径的手动持仓清单；美股收盘页会用接口收盘价自动估算盈亏。",
  },
};

export const portfolioParams = {
  cash: 369905.43,
  usdRate: 7.2,
  riskThresholds: {
    stockPositionYellow: 80,
    techConcentrationYellow: 62,
    cashPctWarning: 10,
  },
  todayCommand: "今日总指令：A股继续强势，但账户内仓位接近96%，不追高，优先保护浮盈和控制科技集中度。",
  riskLight: "黄灯",
};

export const aShareHoldings: AShareHolding[] = [
  { name: "科创芯50", code: "588750", quantity: 131300, costPrice: 1.538, currentPrice: 2.22, marketValue: 291486, pnl: 89557.73, type: "核心仓", suggestion: "持有", note: "当前第一大仓，芯片主线底仓，仓位22.5%；继续享受趋势但不追高。" },
  { name: "澜起科技", code: "688008", quantity: 825, costPrice: 106.255, currentPrice: 209.91, marketValue: 173175.75, pnl: 85514.96, type: "核心仓", suggestion: "分批锁盈", note: "主力核心仓，浮盈接近翻倍，今日继续强势；优先用移动止盈保护利润。" },
  { name: "科创半导", code: "588170", quantity: 116600, costPrice: 1.732, currentPrice: 2.046, marketValue: 238563.6, pnl: 36612.4, type: "核心仓", suggestion: "持有", note: "与科创芯50高度相关，仓位18.4%；合并看半导体与科创集中度。" },
  { name: "通信ETF", code: "515880", quantity: 47400, costPrice: 0.681, currentPrice: 1.414, marketValue: 67023.6, pnl: 34734.72, type: "趋势仓", suggestion: "分批锁盈", note: "趋势强、浮盈大，今日仍明显上行；不适合情绪化追高。" },
  { name: "有色ETF", code: "512400", quantity: 13700, costPrice: 0.229, currentPrice: 2.207, marketValue: 30235.9, pnl: 27093.12, type: "防守仓", suggestion: "观察", note: "资源周期属性，累计浮盈很高，继续观察是否需要锁盈。" },
  { name: "科创200", code: "588230", quantity: 86100, costPrice: 1.736, currentPrice: 2.01, marketValue: 173061, pnl: 23008.62, type: "核心仓", suggestion: "观察", note: "科创弹性仓，仓位13.3%；今日表现较强，回撤时重点看承接。" },
  { name: "胜宏科技", code: "300476", quantity: 100, costPrice: 207.937, currentPrice: 338.06, marketValue: 33806, pnl: 13012.29, type: "趋势仓", suggestion: "分批锁盈", note: "PCB/算力方向小仓趋势票，浮盈较大，继续用移动止盈管理。" },
  { name: "AI创业板", code: "159382", quantity: 19600, costPrice: 2.218, currentPrice: 2.829, marketValue: 55448.4, pnl: 11973.64, type: "趋势仓", suggestion: "观察", note: "AI弹性补充仓，今日强势；与科技主线相关度高。" },
  { name: "金ETF", code: "159834", quantity: 1600, costPrice: 5.606, currentPrice: 10.341, marketValue: 16545.6, pnl: 7575.68, type: "防守仓", suggestion: "持有", note: "风险对冲资产，用于平滑组合波动，不做追涨。" },
  { name: "卫星ETF", code: "159206", quantity: 400, costPrice: -12.177, currentPrice: 1.93, marketValue: 772, pnl: 5640.6, type: "观察仓", suggestion: "观察", note: "小仓观察，券商成本为负，按App截图原样记录。" },
  { name: "欣灵电气", code: "301388", quantity: 100, costPrice: -22.077, currentPrice: 33.35, marketValue: 3335, pnl: 5542.72, type: "观察仓", suggestion: "观察", note: "小仓观察，券商成本为负，按App截图原样记录。" },
  { name: "海信家电", code: "000921", quantity: 200, costPrice: 0.411, currentPrice: 24.24, marketValue: 4848, pnl: 4765.8, type: "观察仓", suggestion: "观察", note: "小仓观察，累计收益显示较高。" },
  { name: "五洲新春", code: "603667", quantity: 100, costPrice: 28.168, currentPrice: 71.06, marketValue: 7106, pnl: 4289.2, type: "观察仓", suggestion: "观察", note: "小仓趋势观察，今日涨幅较大。" },
  { name: "信科移动", code: "688387", quantity: 200, costPrice: 2.069, currentPrice: 20.7, marketValue: 4140, pnl: 3726.28, type: "观察仓", suggestion: "观察", note: "小仓观察，科创通信属性。" },
  { name: "易天股份", code: "300812", quantity: 100, costPrice: 15.961, currentPrice: 39.75, marketValue: 3975, pnl: 2378.9, type: "观察仓", suggestion: "观察", note: "小仓观察，今日涨幅较大。" },
  { name: "三变科技", code: "002112", quantity: 100, costPrice: 1.296, currentPrice: 21.27, marketValue: 2127, pnl: 1997.39, type: "观察仓", suggestion: "观察", note: "小仓观察，累计收益显示较高。" },
  { name: "游戏ETF", code: "159869", quantity: 100, costPrice: -11.117, currentPrice: 1.338, marketValue: 133.8, pnl: 1245.5, type: "观察仓", suggestion: "观察", note: "极小仓，券商成本为负，按App截图原样记录。" },
  { name: "北新建材", code: "000786", quantity: 300, costPrice: 22.651, currentPrice: 26.56, marketValue: 7968, pnl: 1172.76, type: "防守仓", suggestion: "持有", note: "偏稳健小仓。" },
  { name: "机器人", code: "562500", quantity: 100, costPrice: -1.474, currentPrice: 1.097, marketValue: 109.7, pnl: 257.1, type: "观察仓", suggestion: "观察", note: "极小仓，券商成本为负，按App截图原样记录。" },
  { name: "招商银行", code: "600036", quantity: 3400, costPrice: 39.372, currentPrice: 37.95, marketValue: 129030, pnl: -4833.78, type: "防守仓", suggestion: "持有", note: "账户内主要防守仓，今日小幅拖累，仍承担稳定器与分红属性。" },
];

export const usHoldings: UsHolding[] = [
  { name: "美国超微公司", code: "AMD", quantity: 6, costPrice: 203.331, currentPrice: 419.27, marketValue: 2515.62, pnl: 1295.63, stopLoss: 380, targetPrice: 450, trend: "高波动趋势", type: "趋势仓", note: "已减至6股，AI芯片弹性仓；继续用移动止盈管理，不追高补仓。" },
  { name: "Intel", code: "INTC", quantity: 4, costPrice: 46.169, currentPrice: 110.98, marketValue: 443.92, pnl: 259.24, stopLoss: 98, targetPrice: 125, trend: "剩余趋势仓", type: "趋势仓", note: "剩余4股小仓趋势仓，继续按纪律线观察。" },
  { name: "Rambus", code: "RMBS", quantity: 11, costPrice: 97.7, currentPrice: 130.28, marketValue: 1433.08, pnl: 358.38, stopLoss: 115, targetPrice: 145, trend: "观察上行", type: "观察仓", note: "小仓观察，跟随半导体存储链节奏。" },
  { name: "Meta Platforms", code: "META", quantity: 24, costPrice: 602.918, currentPrice: 613.22, marketValue: 14717.28, pnl: 247.25, stopLoss: 580, targetPrice: 680, trend: "核心持有", type: "核心仓", note: "美股第一大仓，仍是账户核心锚，重点看单票集中风险。" },
  { name: "Amphenol", code: "APH", quantity: 23, costPrice: 135.914, currentPrice: 139.21, marketValue: 3201.83, pnl: 75.81, stopLoss: 128, targetPrice: 158, trend: "核心趋势", type: "核心仓", note: "连接器龙头，偏稳，作为美股核心趋势仓观察。" },
  { name: "拼多多", code: "PDD", quantity: 4, costPrice: 101.858, currentPrice: 101.8, marketValue: 407.2, pnl: -0.23, stopLoss: 92, targetPrice: 118, trend: "观察修复", type: "观察仓", note: "中概小仓观察，接近成本线。" },
  { name: "Direxion MSFT 2X", code: "MSFU", quantity: 23, costPrice: 31.767, currentPrice: 28.37, marketValue: 652.51, pnl: -78.13, stopLoss: 24.5, targetPrice: 32, trend: "杠杆仓，高风险", type: "杠杆仓", note: "严格小仓，不能补跌，优先控制风险。" },
  { name: "Arista Networks", code: "ANET", quantity: 17, costPrice: 174.5, currentPrice: 148.35, marketValue: 2521.95, pnl: -444.55, stopLoss: 145, targetPrice: 174.5, trend: "短线浮亏", type: "趋势仓", note: "短线趋势观察仓，仍处浮亏，重点盯止损线与反抽质量。" },
  { name: "腾讯音乐", code: "TME", quantity: 500, costPrice: 10.5, currentPrice: 9.65, marketValue: 4825, pnl: -425, stopLoss: 8.6, targetPrice: 10.8, trend: "中概修复", type: "中概仓", note: "中概仓位，当前仍浮亏，关注修复持续性。" },
];

export const operationRecords: OperationRecord[] = [
  { date: "2026-05-07", market: "美股", symbol: "整体账户", action: "持仓更新", reason: "北京时间17:51截图显示美股市值约30713.39美元，持仓盈亏+3638.48美元，今日盈亏+20.32美元", result: "美股底表已更新；AMD为6股，META仍为第一大仓，ANET和TME仍为主要浮亏观察对象。" },
  { date: "2026-05-07", market: "A股", symbol: "整体账户", action: "持仓更新", reason: "北京时间16:56截图显示券商账户仓位95.9%，当日参考盈亏+32527.35元", result: "持仓底表已更新；无交易变动时后续只需刷新行情即可自动估算盈亏。" },
  { date: "2026-05-07", market: "A股", symbol: "科创芯50/澜起科技/科创半导/科创200", action: "重点观察", reason: "科创核心仓仍是账户主要收益来源，合计仓位较高", result: "继续享受趋势，但账户内仓位接近96%，不再追高叠加同方向仓位。" },
];

export const settingsNotes = [
  "持仓数量、成本价、备注来自手动维护清单；有买卖变动时更新底表。",
  "A股盘中页和美股收盘页会接入行情价格，并根据持仓数量和成本价自动估算市值与浮盈亏。",
  "当前不连接券商账户，不自动下单；所有信号仅用于观察、风控和复盘。",
];
