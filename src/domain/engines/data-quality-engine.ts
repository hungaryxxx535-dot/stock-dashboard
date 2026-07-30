import type { AppState } from "@/domain/model";

export type QualityIssue = {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  action: string;
};

export function dataQualityEngine(state: AppState): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const instrumentIds = new Set(state.instruments.map((item) => item.id));
  const accountIds = new Set(state.accounts.map((item) => item.id));
  state.holdings.forEach((holding) => {
    if (!instrumentIds.has(holding.instrumentId)) issues.push({ id: `instrument-${holding.id}`, severity: "critical", message: "持仓缺少标的定义", action: "重新导入或补齐标的信息" });
    if (!accountIds.has(holding.accountId)) issues.push({ id: `account-${holding.id}`, severity: "critical", message: "持仓缺少账户", action: "选择正确账户" });
    if (!Number.isFinite(holding.quantity)) issues.push({ id: `quantity-${holding.id}`, severity: "critical", message: "持仓数量无效", action: "人工复核数量" });
    if (holding.brokerCost < 0) issues.push({ id: `negative-${holding.id}`, severity: "info", message: "券商成本为负，可能来自累计分红或历史减仓", action: "保留券商成本，并单独维护经济成本" });
  });
  const closedWithQuantity = state.holdings.filter((holding) => holding.status === "closed" && holding.quantity !== 0);
  if (closedWithQuantity.length) issues.push({ id: "closed-quantity", severity: "warning", message: "已清仓记录仍有数量", action: "复核清仓状态，不计入当前市值" });
  if (state.mode === "demo") issues.push({ id: "demo-mode", severity: "info", message: "当前为匿名演示模式", action: "从持仓中心导入或录入真实数据" });
  return issues;
}
