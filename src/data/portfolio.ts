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
  aShare: "2026-05-11 北京时间13:52 A股持仓截图口径",
  us: "2026-05-07 北京时间17:51 美股持仓截图口径",
  description: "持仓数量和成本价来自手动维护清单；行情页接入价格后自动估算市值与浮盈亏，非券商账户实时同步。",
};

export const accountSnapshot = {
  aShare: {
    totalAssets: 1387613.64,
    marketValue: 837315.95,
    availableCash: 550256.74,
    offsiteCash: 300000,
    totalFlexibleCash: 850256.74,
    brokerPositionPct: 61.9,
    overallPositionPct: 49.6,
    totalPnl: 411910.64,
    todayPnl: 63936.0,
    todayPnlPct: 4.83,
    note: "券商账户仓位约61.9%，账户内现金约55.03万元；若纳入此前场外约30万元机动资金，整体A股资金口径股票仓位约49.6%。",
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
  cash: 850256.74,
  usdRate: 7.2,
  riskThresholds: {
    stockPositionYellow: 80,
    techConcentrationYellow: 62,
    cashPctWarning: 10,
  },
  todayCommand: "今日总指令：A股已明显降仓，现金垫很厚；不急追涨，优先等回踩和高胜率机会，核心仓只做移动止盈和风险跟踪。",
  riskLight: "绿灯",
};

export const aShareHoldings: AShareHolding[] = [
  { name: "科创芯50", code: "588750", quantity: 87600, costPrice: 1.18, currentPrice: 2.282, marketValue: 199903.2, pnl: 96508.92, type: "核心仓", suggestion: "持有", note: "当前A股第一大科技底仓，已较前期明显降仓；继续保留核心敞口，不追高加回。" },
  { name: "招商银行", code: "600036", quantity: 4700, costPrice: 38.972, currentPrice: 37.89, marketValue: 178083, pnl: -5086.34, type: "防守仓", suggestion: "持有", note: "已加至4700股，是账户内重要防守仓；承担稳定器与分红属性，短期仍按防守仓看。" },
  { name: "科创半导", code: "588170", quantity: 38900, costPrice: 0.998, currentPrice: 2.137, marketValue: 83129.3, pnl: 44326.55, type: "核心仓", suggestion: "持有", note: "半导体核心底仓，数量已明显下降；与科创芯50相关度高，后续不重复追高。" },
  { name: "通信ETF", code: "515880", quantity: 47400, costPrice: 0.681, currentPrice: 1.478, marketValue: 70057.2, pnl: 37768.32, type: "趋势仓", suggestion: "分批锁盈", note: "趋势仍强、浮盈较大；不新增追高，继续用移动止盈管理。" },
  { name: "澜起科技", code: "688008", quantity: 275, costPrice: -164.938, currentPrice: 248.45, marketValue: 68323.75, pnl: 113695.56, type: "核心仓", suggestion: "分批锁盈", note: "已大幅降至275股，券商成本显示为负；作为利润仓继续持有，重点看移动止盈。" },
  { name: "科创200", code: "588230", quantity: 28700, costPrice: 1.096, currentPrice: 2.072, marketValue: 59466.4, pnl: 28016.94, type: "核心仓", suggestion: "观察", note: "科创弹性仓已明显下降；保留观察，回踩承接强再看是否加回。" },
  { name: "AI创业板", code: "159382", quantity: 19600, costPrice: 2.218, currentPrice: 2.89, marketValue: 56644, pnl: 13169.24, type: "趋势仓", suggestion: "观察", note: "AI弹性补充仓，与科技主线相关度高；不在大涨后主动追高。" },
  { name: "有色ETF", code: "512400", quantity: 18100, costPrice: 0.705, currentPrice: 2.19, marketValue: 39639, pnl: 26885.74, type: "防守仓", suggestion: "观察", note: "资源周期属性，累计浮盈高；可作为非科技方向分散，但涨高后同样要防回撤。" },
  { name: "胜宏科技", code: "300476", quantity: 100, costPrice: 207.937, currentPrice: 377.79, marketValue: 37779, pnl: 16985.29, type: "趋势仓", suggestion: "分批锁盈", note: "PCB/算力方向小仓趋势票，浮盈较大；继续移动止盈，不补追。" },
  { name: "金ETF", code: "159834", quantity: 1600, costPrice: 5.606, currentPrice: 10.156, marketValue: 16249.6, pnl: 7279.68, type: "防守仓", suggestion: "持有", note: "组合对冲资产，用于平滑波动；目前维持防守配置。" },
  { name: "北新建材", code: "000786", quantity: 300, costPrice: 22.651, currentPrice: 26.47, marketValue: 7941, pnl: 1145.76, type: "防守仓", suggestion: "持有", note: "偏稳健小仓，继续作为非科技分散观察。" },
  { name: "海信家电", code: "000921", quantity: 200, costPrice: 0.411, currentPrice: 24.79, marketValue: 4958, pnl: 4875.8, type: "观察仓", suggestion: "观察", note: "小仓观察，券商显示累计收益较高；不作为主线仓处理。" },
  { name: "信科移动", code: "688387", quantity: 200, costPrice: 2.069, currentPrice: 22.42, marketValue: 4484, pnl: 4070.28, type: "观察仓", suggestion: "观察", note: "科创通信属性小仓观察，金额较小。" },
  { name: "易天股份", code: "300812", quantity: 100, costPrice: 15.961, currentPrice: 41.38, marketValue: 4138, pnl: 2541.9, type: "观察仓", suggestion: "观察", note: "小仓观察，涨幅较大但不是主力仓。" },
  { name: "欣灵电气", code: "301388", quantity: 100, costPrice: -22.077, currentPrice: 33.78, marketValue: 3378, pnl: 5585.72, type: "观察仓", suggestion: "观察", note: "小仓观察，券商成本显示为负，按App截图原样记录。" },
  { name: "三变科技", code: "002112", quantity: 100, costPrice: 1.296, currentPrice: 20.92, marketValue: 2092, pnl: 1962.39, type: "观察仓", suggestion: "观察", note: "小仓观察，累计收益显示较高。" },
  { name: "卫星ETF", code: "159206", quantity: 400, costPrice: -12.171, currentPrice: 2.019, marketValue: 807.6, pnl: 5676.6, type: "观察仓", suggestion: "观察", note: "极小仓，券商成本显示为负，按App截图原样记录。" },
  { name: "游戏ETF", code: "159869", quantity: 100, costPrice: -11.117, currentPrice: 1.328, marketValue: 132.8, pnl: 1244.5, type: "观察仓", suggestion: "观察", note: "极小仓，券商成本显示为负，按App截图原样记录。" },
  { name: "机器人", code: "562500", quantity: 100, costPrice: -1.474, currentPrice: 1.14, marketValue: 114, pnl: 261.48, type: "观察仓", suggestion: "观察", note: "极小仓，券商成本显示为负，按App截图原样记录。" },
  { name: "五洲新春", code: "603667", quantity: 0, costPrice: 0, currentPrice: 78.71, marketValue: 0, pnl: 5000.21, type: "观察仓", suggestion: "观察", note: "当前持仓为0，视为已清仓；平台仅保留券商App历史盈亏显示。" },
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
  { date: "2026-05-11", market: "A股", symbol: "整体账户", action: "持仓更新", reason: "截图显示总资产138.76万元，总市值83.73万元，可用资金55.03万元，账户内仓位约61.9%，当日参考盈亏+63936.00元。", result: "A股底表已更新；本次为明显降仓后的新基准，后续建议按现金充足、科技核心仓保留、等待回踩的口径判断。" },
  { date: "2026-05-11", market: "A股", symbol: "科创芯50/科创半导/科创200/澜起科技", action: "明显减仓", reason: "科创核心仓数量较上一版明显下降，账户内现金提升至约55.03万元。", result: "平台风险灯调整为绿灯；不再按此前接近满仓口径判断。" },
  { date: "2026-05-07", market: "美股", symbol: "整体账户", action: "持仓更新", reason: "北京时间17:51截图显示美股市值约30713.39美元，持仓盈亏+3638.48美元，今日盈亏+20.32美元", result: "美股底表已更新；AMD为6股，META仍为第一大仓，ANET和TME仍为主要浮亏观察对象。" },
  { date: "2026-05-07", market: "A股", symbol: "整体账户", action: "持仓更新", reason: "北京时间16:56截图显示券商账户仓位95.9%，当日参考盈亏+32527.35元", result: "旧口径保留为历史记录；2026-05-11之后以新降仓口径为准。" },
];

export const settingsNotes = [
  "持仓数量、成本价、备注来自手动维护清单；有买卖变动时更新底表。",
  "A股盘中页和美股收盘页会接入行情价格，并根据持仓数量和成本价自动估算市值与浮盈亏。",
  "当前不连接券商账户，不自动下单；所有信号仅用于观察、风控和复盘。",
];
