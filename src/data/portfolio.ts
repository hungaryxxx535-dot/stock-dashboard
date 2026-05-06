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
  aShare: "2026-05-06 A股收盘持仓截图口径",
  us: "2026-05-06 北京时间 08:07 美股持仓截图口径",
  description: "当前仍为 Mock/静态数据，不是实时行情。",
};

export const accountSnapshot = {
  aShare: {
    totalAssets: 1284063.47,
    marketValue: 1210363,
    availableCash: 73700.47,
    offsiteCash: 300000,
    totalFlexibleCash: 373700.47,
    brokerPositionPct: 95.7,
    overallPositionPct: 76.4,
    totalPnl: 323340.26,
    todayPnl: 47902.7,
    todayPnlPct: 3.88,
    note: "券商账户仓位已到95.7%，但整体资金口径不是满仓；场外约30万元机动资金需纳入判断。",
  },
  us: {
    accountDisplayUsd: 16947.01,
    holdingsValueUsd: 31184.32,
    holdingsPnlUsd: 3272.41,
    todayPnlUsd: 446.52,
    note: "当前为北京时间截图口径的静态持仓，不是实时价格。",
  },
};

export const portfolioParams = {
  cash: 373700.47,
  usdRate: 7.2,
  riskThresholds: {
    stockPositionYellow: 80,
    techConcentrationYellow: 62,
    cashPctWarning: 10,
  },
  todayCommand: "今日总指令：大涨后不追高，优先锁盈、控集中度、保留现金垫。",
  riskLight: "黄灯",
};

export const aShareHoldings: AShareHolding[] = [
  { name: "科创芯50", code: "588750", quantity: 131300, costPrice: 1.538, currentPrice: 2.177, marketValue: 285840.1, pnl: 83913.83, type: "核心仓", suggestion: "持有", note: "当前第一大仓，今天贡献明显；继续作为芯片主线底仓，但不追高。" },
  { name: "澜起科技", code: "688008", quantity: 825, costPrice: 106.255, currentPrice: 198.8, marketValue: 164158.5, pnl: 76497.71, type: "核心仓", suggestion: "分批锁盈", note: "主力核心仓，浮盈与单日涨幅都很大，优先用移动止盈保护利润。" },
  { name: "通信ETF", code: "515880", quantity: 47400, costPrice: 0.681, currentPrice: 1.352, marketValue: 64084.8, pnl: 31795.92, type: "趋势仓", suggestion: "分批锁盈", note: "趋势强、浮盈大，继续保留主升趋势，但不适合情绪化追高。" },
  { name: "科创半导", code: "588170", quantity: 116600, costPrice: 1.732, currentPrice: 2, marketValue: 233200, pnl: 31248.8, type: "核心仓", suggestion: "持有", note: "与科创芯50高度相关，合并看科技集中度与半导体仓位。" },
  { name: "有色ETF", code: "512400", quantity: 13700, costPrice: 0.229, currentPrice: 2.199, marketValue: 30126.3, pnl: 26983.52, type: "防守仓", suggestion: "观察", note: "涨幅和累计浮盈较高，偏周期与资源属性，继续观察是否需要锁盈。" },
  { name: "科创200", code: "588230", quantity: 86100, costPrice: 1.736, currentPrice: 1.947, marketValue: 167636.7, pnl: 18184.32, type: "核心仓", suggestion: "观察", note: "科创弹性仓，代码按最新截图修正为588230，回撤时重点看承接。" },
  { name: "胜宏科技", code: "300476", quantity: 100, costPrice: 207.937, currentPrice: 325.92, marketValue: 32592, pnl: 11798.29, type: "趋势仓", suggestion: "分批锁盈", note: "PCB/算力方向小仓趋势票，浮盈较大，今日小幅回落。" },
  { name: "AI创业板", code: "159382", quantity: 19600, costPrice: 2.218, currentPrice: 2.733, marketValue: 53566.8, pnl: 10092.04, type: "趋势仓", suggestion: "观察", note: "AI弹性补充仓，代码按最新截图修正为159382。" },
  { name: "金ETF", code: "159834", quantity: 1600, costPrice: 5.606, currentPrice: 10.215, marketValue: 16344, pnl: 7374.08, type: "防守仓", suggestion: "持有", note: "风险对冲资产，用于平滑组合波动，不做追涨。" },
  { name: "卫星ETF", code: "159206", quantity: 400, costPrice: -12.171, currentPrice: 1.912, marketValue: 764.8, pnl: 5633.4, type: "观察仓", suggestion: "观察", note: "小仓观察，券商成本为负，按App截图原样记录。" },
  { name: "欣灵电气", code: "301388", quantity: 100, costPrice: -22.077, currentPrice: 32.66, marketValue: 3266, pnl: 5473.72, type: "观察仓", suggestion: "观察", note: "小仓观察，券商成本为负，按App截图原样记录。" },
  { name: "海信家电", code: "000921", quantity: 200, costPrice: 0.411, currentPrice: 24.26, marketValue: 4852, pnl: 4769.8, type: "观察仓", suggestion: "观察", note: "小仓观察，累计收益显示较高。" },
  { name: "五洲新春", code: "603667", quantity: 100, costPrice: 28.168, currentPrice: 67.19, marketValue: 6719, pnl: 3902.2, type: "观察仓", suggestion: "观察", note: "小仓趋势观察。" },
  { name: "信科移动", code: "688387", quantity: 200, costPrice: 2.069, currentPrice: 20.38, marketValue: 4076, pnl: 3662.28, type: "观察仓", suggestion: "观察", note: "小仓观察，科创通信属性。" },
  { name: "易天股份", code: "300812", quantity: 100, costPrice: 15.961, currentPrice: 36.46, marketValue: 3646, pnl: 2049.9, type: "观察仓", suggestion: "观察", note: "小仓观察。" },
  { name: "三变科技", code: "002112", quantity: 100, costPrice: 1.296, currentPrice: 20.91, marketValue: 2091, pnl: 1961.39, type: "观察仓", suggestion: "观察", note: "小仓观察，累计收益显示较高。" },
  { name: "游戏ETF", code: "159869", quantity: 100, costPrice: -11.117, currentPrice: 1.314, marketValue: 131.4, pnl: 1243.1, type: "观察仓", suggestion: "观察", note: "极小仓，券商成本为负，按App截图原样记录。" },
  { name: "北新建材", code: "000786", quantity: 300, costPrice: 22.651, currentPrice: 26.54, marketValue: 7962, pnl: 1166.76, type: "防守仓", suggestion: "持有", note: "偏稳健小仓。" },
  { name: "机器人", code: "562500", quantity: 100, costPrice: -1.474, currentPrice: 1.056, marketValue: 105.6, pnl: 252.98, type: "观察仓", suggestion: "观察", note: "极小仓，券商成本为负，按App截图原样记录。" },
  { name: "招商银行", code: "600036", quantity: 3400, costPrice: 39.372, currentPrice: 38, marketValue: 129200, pnl: -4663.78, type: "防守仓", suggestion: "持有", note: "账户内主要防守仓，今日拖累组合，仍承担稳定器与分红属性。" },
];

export const usHoldings: UsHolding[] = [
  { name: "美国超微公司", code: "AMD", quantity: 8, costPrice: 203.331, currentPrice: 417.01, marketValue: 3336.08, pnl: 1709.43, stopLoss: 380, targetPrice: 450, trend: "高波动趋势", type: "趋势仓", note: "今日贡献最大，AI芯片弹性仓，继续用移动止盈管理。" },
  { name: "Intel", code: "INTC", quantity: 4, costPrice: 46.169, currentPrice: 112.5, marketValue: 450, pnl: 265.32, stopLoss: 98, targetPrice: 125, trend: "剩余趋势仓", type: "趋势仓", note: "已减半后的剩余小仓，继续按趋势仓处理。" },
  { name: "Rambus", code: "RMBS", quantity: 11, costPrice: 97.7, currentPrice: 125.05, marketValue: 1375.55, pnl: 300.85, stopLoss: 110, targetPrice: 140, trend: "观察上行", type: "观察仓", note: "小仓观察，跟随半导体存储链节奏。" },
  { name: "Meta Platforms", code: "META", quantity: 24, costPrice: 602.918, currentPrice: 605.5, marketValue: 14532, pnl: 61.97, stopLoss: 560, targetPrice: 680, trend: "核心持有", type: "核心仓", note: "美股第一大仓，单票占比较高，是账户核心锚。" },
  { name: "Amphenol", code: "APH", quantity: 23, costPrice: 135.914, currentPrice: 138, marketValue: 3174, pnl: 47.98, stopLoss: 128, targetPrice: 158, trend: "核心趋势", type: "核心仓", note: "连接器龙头，偏稳，但近期弹性弱于AMD。" },
  { name: "拼多多", code: "PDD", quantity: 4, costPrice: 101.858, currentPrice: 97.2, marketValue: 388.8, pnl: -18.63, stopLoss: 88, targetPrice: 118, trend: "观察修复", type: "观察仓", note: "中概小仓观察。" },
  { name: "Direxion MSFT 2X", code: "MSFU", quantity: 23, costPrice: 31.767, currentPrice: 27.72, marketValue: 637.56, pnl: -93.08, stopLoss: 24.5, targetPrice: 32, trend: "杠杆仓，高风险", type: "杠杆仓", note: "严格小仓，不能补跌，优先控制风险。" },
  { name: "Arista Networks", code: "ANET", quantity: 17, costPrice: 174.5, currentPrice: 156.49, marketValue: 2660.33, pnl: -306.17, stopLoss: 150, targetPrice: 174.5, trend: "短线浮亏", type: "趋势仓", note: "新进趋势观察仓，当前浮亏，需重点盯止损与反抽质量。" },
  { name: "腾讯音乐", code: "TME", quantity: 500, costPrice: 10.5, currentPrice: 9.26, marketValue: 4630, pnl: -620, stopLoss: 8.1, targetPrice: 10.8, trend: "中概修复", type: "中概仓", note: "中概仓位，当前仍浮亏，关注修复持续性。" },
];

export const operationRecords: OperationRecord[] = [
  { date: "2026-05-06", market: "A股", symbol: "整体账户", action: "风控备忘", reason: "A股单日大涨约4.79万元，券商账户仓位升至95.7%", result: "不追高，优先看锁盈、控集中度、保留现金垫。" },
  { date: "2026-05-06", market: "A股", symbol: "科创芯50/科创半导/科创200/澜起科技", action: "重点观察", reason: "四大科创核心仓合计占比较高", result: "继续享受趋势，但冲高后优先分批锁盈，不再叠加同方向仓位。" },
  { date: "2026-05-06", market: "美股", symbol: "AMD / ANET", action: "趋势复核", reason: "AMD强势贡献，ANET新仓浮亏", result: "AMD用移动止盈保护利润，ANET重点看止损线与反抽质量。" },
];

export const settingsNotes = [
  "当前数据来源：用户最新A股收盘截图 + 美股北京时间截图手动静态录入。",
  "当前不接真实行情，不接数据库，不做登录。",
  "后续可接入持仓表格导入、手动更新价格、实时行情 API、Gmail/扣子日报同步、风险提醒推送。",
];
