"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { usePortfolioData } from "@/components/data-provider";

type PaperOrder = { order_id: string; symbol: string; side: string; status: string; limit_price: number; requested_quantity: number; filled_quantity: number; rejection_reason: string | null; submit_time: string };
type PaperPosition = { symbol: string; quantity: number; sellable_quantity: number; average_cost: number };
type PaperStatus = { available: boolean; environment: "paper"; message?: string; errorCode?: string; system?: { scheduler_enabled?: boolean; real_broker_connected?: boolean }; account?: { available_cash?: number; frozen_cash?: number; total_equity_at_cost?: number }; positions?: PaperPosition[]; orders?: PaperOrder[] };

const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-cyan-400 dark:text-slate-950";
const money = (value = 0) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value);

export function PaperTrading() {
  const { state } = usePortfolioData();
  const eligiblePlans = useMemo(() => state.tradePlans.flatMap((plan) => { const instrument = state.instruments.find((item) => item.id === plan.instrumentId); return plan.status === "actionable" && instrument?.market === "CN" && /^\d{6}$/.test(instrument.symbol) ? [{ plan, instrument }] : []; }), [state]);
  const [planId, setPlanId] = useState(eligiblePlans[0]?.plan.id ?? "");
  const [quantity, setQuantity] = useState(100);
  const [limitPrice, setLimitPrice] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<PaperStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected = eligiblePlans.find((item) => item.plan.id === planId);

  const load = useCallback(async () => {
    try { const response = await fetch("/api/paper/status", { cache: "no-store" }); setStatus(await response.json()); }
    catch { setStatus({ available: false, environment: "paper", message: "无法读取本机 Paper 服务。" }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!selected || !confirmed) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/paper/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, symbol: selected.instrument.symbol, side: selected.plan.direction === "sell" || selected.plan.direction === "reduce" ? "SELL" : "BUY", quantity, limitPrice, confirmedPaper: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "模拟委托提交失败。");
      const order = result.orders?.[0];
      setMessage(order?.status === "REJECTED" ? `模拟委托被拒绝：${order.rejection_reason}` : `PAPER 模拟委托已受理：${order?.order_id}`);
      setConfirmed(false); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "模拟委托提交失败。"); }
    finally { setBusy(false); }
  };

  const cancel = async (orderId: string) => {
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/paper/orders/${orderId}/cancel`, { method: "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "撤销失败。"); setMessage("PAPER 模拟委托已撤销。"); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "撤销失败。"); }
    finally { setBusy(false); }
  };

  const terminal = new Set(["FILLED", "CANCELLED", "REJECTED", "EXPIRED"]);
  return <><header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-cyan-600">Paper Broker</p><h1 className="text-3xl font-black tracking-tight sm:text-4xl">模拟委托台</h1><p className="mt-2 text-sm text-slate-500">只接受已通过计划状态机的 A 股计划；所有委托固定发送到本机 Paper Broker，不具备真实下单能力。</p></div><div className="flex flex-wrap gap-2"><Link className={buttonClass} href="/plans">返回计划</Link><Link className={buttonClass} href="/journal">进入复盘</Link></div></header>
    <section className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 text-emerald-600" /><div><p className="font-black">PAPER 安全边界</p><p className="text-sm text-emerald-800 dark:text-emerald-200">环境固定为 paper · 真实券商未连接 · 自动实盘不可用 · 调度器 {status?.system?.scheduler_enabled ? "已启用（需复核）" : "关闭"}</p></div></div></section>
    {!status?.available && <section className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"><p className="font-black">本机 Paper 服务未就绪</p><p className="mt-1 text-sm">{status?.message ?? "正在检查服务…"}</p><p className="mt-2 text-xs">请先运行量化 API，并在本机环境变量配置 HERMES_QUANT_API_TOKEN。云端预览不会连接你电脑上的本地服务。</p></section>}
    <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]"><section className="rounded-2xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-black">从计划创建模拟委托</h2>{eligiblePlans.length === 0 ? <p className="mt-3 text-sm text-slate-500">没有“待执行核验”状态且代码已确认的 A 股计划。请先在交易计划中完成条件核验。</p> : <div className="mt-4 space-y-3"><label className="block text-sm font-bold">已核验计划<select className={`${inputClass} mt-1`} value={planId} onChange={(event) => setPlanId(event.target.value)}>{eligiblePlans.map(({ plan, instrument }) => <option key={plan.id} value={plan.id}>{instrument.symbol} · {instrument.name} · {plan.direction}</option>)}</select></label><label className="block text-sm font-bold">数量（100股整数倍）<input className={`${inputClass} mt-1`} type="number" min="100" step="100" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><label className="block text-sm font-bold">限价<input className={`${inputClass} mt-1`} type="number" min="0.01" step="0.01" value={limitPrice} onChange={(event) => setLimitPrice(Number(event.target.value))} /></label><label className="flex items-start gap-2 rounded-xl border p-3 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>我确认这是 PAPER 模拟委托，不会发送到真实券商；价格和数量已经人工复核。</span></label><button className={buttonClass} disabled={!status?.available || !confirmed || busy || limitPrice <= 0 || quantity < 100 || quantity % 100 !== 0} onClick={() => void submit()}>提交 PAPER 模拟委托</button></div>}<p role="status" className="mt-3 text-sm font-bold text-amber-700 dark:text-amber-300">{message}</p></section>
      <section className="rounded-2xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="text-lg font-black">Paper 账户</h2><button className="inline-flex items-center gap-1 text-sm font-bold" onClick={() => void load()}><RefreshCw className="h-4 w-4" />刷新</button></div><dl className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><dt className="text-xs text-slate-500">可用现金</dt><dd className="font-black">{money(status?.account?.available_cash)}</dd></div><div><dt className="text-xs text-slate-500">冻结资金</dt><dd className="font-black">{money(status?.account?.frozen_cash)}</dd></div><div><dt className="text-xs text-slate-500">成本权益</dt><dd className="font-black">{money(status?.account?.total_equity_at_cost)}</dd></div></dl><h3 className="mt-5 font-black">持仓</h3><div className="mt-2 space-y-2 text-sm">{status?.positions?.length ? status.positions.map((position) => <div key={position.symbol} className="grid grid-cols-3 rounded-xl border p-2"><b>{position.symbol}</b><span>{position.quantity} 股</span><span className="text-right">可卖 {position.sellable_quantity}</span></div>) : <p className="text-slate-500">暂无 Paper 持仓。</p>}</div></section></div>
    <section className="mt-4 rounded-2xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-black">模拟委托记录</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-slate-500"><tr><th className="py-2">时间</th><th>标的</th><th>方向</th><th>限价/数量</th><th>成交</th><th>状态</th><th>原因</th><th></th></tr></thead><tbody>{status?.orders?.map((order) => <tr key={order.order_id} className="border-t dark:border-slate-800"><td className="py-3">{new Date(order.submit_time).toLocaleString("zh-CN")}</td><td className="font-bold">{order.symbol}</td><td>{order.side}</td><td>{order.limit_price} / {order.requested_quantity}</td><td>{order.filled_quantity}</td><td><b>{order.status}</b></td><td>{order.rejection_reason ?? "—"}</td><td>{!terminal.has(order.status) && <button className="font-bold text-red-600" disabled={busy} onClick={() => void cancel(order.order_id)}>撤销</button>}</td></tr>)}</tbody></table>{!status?.orders?.length && <p className="py-4 text-sm text-slate-500">暂无模拟委托。</p>}</div></section>
  </>;
}
