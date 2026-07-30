export const dailyTimeline = [
  { id: "0800", time: "08:00", title: "A股 1—3 天候选池", description: "复核市场环境、板块强度、候选评分和数据完整性。" },
  { id: "0925", time: "09:25", title: "开盘前后评分", description: "记录跳空、量价和板块联动，不追逐未确认信号。" },
  { id: "1000", time: "10:00", title: "第一轮盘中确认", description: "对照计划条件，标记可执行、等待或失效。" },
  { id: "1120", time: "11:20", title: "上午收盘前复核", description: "检查仓位、风险和上午信号质量。" },
  { id: "1430", time: "14:30", title: "尾盘决策", description: "只处理已在计划中的交易，不临时扩大风险。" },
  { id: "1520", time: "15:20", title: "A股收盘复盘", description: "记录执行、偏差、数据版本和次日观察项。" },
  { id: "2100", time: "21:00", title: "美股盘前观察", description: "复核美股指数、利率、VIX、持仓新闻和计划。" },
];

export function timelineStatus(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false });
  const current = formatter.format(now);
  return dailyTimeline.map((node) => ({
    ...node,
    status: current < node.time ? "pending" : current === node.time ? "active" : "completed",
  }));
}
