const aShares = [
  ["科创芯50", "588750", 255188, 53186, "核心仓", "持有"],
  ["科创半导", "588170", 223989, 22037, "核心仓", "持有"],
  ["科创200", "588220", 161255, 11813, "核心仓", "观察"],
  ["澜起科技", "688008", 141479, 53818, "核心仓", "分批锁盈"],
  ["招商银行", "600036", 94320, -1083, "防守仓", "持有"],
  ["通信ETF", "515880", 63279, 30990, "趋势仓", "分批锁盈"],
  ["AI创业板", "159381", 51744, 8269, "趋势仓", "观察"],
  ["胜宏科技", "300476", 31433, 10639, "趋势仓", "分批锁盈"],
  ["金ETF", "518880", 16386, 7416, "防守仓", "持有"],
];
const usShares = [
  ["META", 24, 14586, "核心仓", "上升趋势"],
  ["TME", 500, 4522, "中概仓", "温和上行"],
  ["APH", 23, 3319, "核心仓", "核心趋势"],
  ["AMD", 8, 2813, "趋势仓", "高波动趋势"],
  ["RMBS", 11, 1221, "观察仓", "观察上行"],
  ["MSFU", 23, 642, "杠杆仓", "高风险"],
  ["PDD", 4, 395, "观察仓", "观察修复"],
  ["INTC", 4, 395, "趋势仓", "已减半，剩余小仓趋势仓"],
];
const cny = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const aTotal = aShares.reduce((sum, item) => sum + item[2], 0);
const aPnl = aShares.reduce((sum, item) => sum + item[3], 0);
const usTotal = usShares.reduce((sum, item) => sum + item[2], 0);
const rate = 7.2;
const cash = 180000;
const totalAssets = aTotal + usTotal * rate + cash;
const stockPosition = ((aTotal + usTotal * rate) / totalAssets) * 100;

function cardRows(rows) {
  return rows.map(([title, value, sub]) => `<article class="card"><small>${title}</small><strong>${value}</strong><span>${sub}</span></article>`).join("");
}

function holdings(rows, market) {
  return rows.map((item) => {
    const isA = market === "A股";
    const value = isA ? cny.format(item[2]) : usd.format(item[2]);
    const pnl = isA ? `<b class="${item[3] >= 0 ? "up" : "down"}">${item[3] >= 0 ? "+" : ""}${Number(item[3]).toLocaleString("zh-CN")}</b>` : `<b>${item[4]}</b>`;
    return `<article class="holding"><div><h3>${item[0]}</h3><small>${isA ? item[1] : item[0]}</small></div><div class="right"><strong>${value}</strong>${pnl}</div><p><span>${isA ? item[4] : item[3]}</span><span>${isA ? item[5] : item[4]}</span></p></article>`;
  }).join("");
}

export function renderHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#0f172a"/><link rel="manifest" href="/manifest.json"/><title>非哥股票作战台</title><style>
  :root{color-scheme:light;--bg:#f8fafc;--card:#fff;--text:#0f172a;--muted:#64748b;--line:#e2e8f0;--dark:#020617;--red:#dc2626;--green:#059669;--amber:#d97706}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.app{max-width:960px;margin:0 auto;padding:16px 16px 88px}.top{position:sticky;top:0;z-index:2;margin:-16px -16px 16px;padding:14px 16px;background:rgba(248,250,252,.92);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}h1{margin:2px 0 0;font-size:22px}.mock{display:inline-flex;margin-top:10px;border:1px solid #fed7aa;background:#fff7ed;color:#9a3412;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800}.hero{background:var(--dark);color:white;border-radius:24px;padding:18px;box-shadow:0 16px 40px rgba(15,23,42,.16)}.hero h2{font-size:24px;margin:8px 0}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:14px 0}.card,.holding,.panel{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:14px;box-shadow:0 3px 12px rgba(15,23,42,.04)}small,span{color:var(--muted)}.card strong{display:block;font-size:18px;margin:6px 0}.tabs{display:flex;gap:8px;overflow:auto;padding:12px 0}.tabs a{white-space:nowrap;text-decoration:none;background:#e2e8f0;color:#0f172a;border-radius:999px;padding:9px 12px;font-size:14px;font-weight:800}.tabs a:first-child{background:#0f172a;color:#fff}.holding{display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:10px}.holding h3{margin:0 0 4px}.right{text-align:right}.holding p{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 0}.holding p span{background:#f1f5f9;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:700}.up{color:var(--red)}.down{color:var(--green)}.section{margin-top:20px}.section h2{font-size:20px;margin:0 0 10px}.risk{display:grid;gap:10px}.risk div{display:flex;justify-content:space-between;gap:8px}.bottom{position:fixed;left:0;right:0;bottom:0;background:rgba(255,255,255,.96);border-top:1px solid var(--line);padding:8px 10px calc(8px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.bottom a{text-align:center;text-decoration:none;color:#64748b;font-size:12px;font-weight:700;border-radius:14px;padding:8px 2px}.bottom a:first-child{background:#0f172a;color:white}@media(min-width:720px){.app{padding-bottom:24px}.grid{grid-template-columns:repeat(4,1fr)}.hold-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.bottom{display:none}}
  </style></head><body><main class="app"><header class="top"><small>Mobile-first PWA MVP</small><h1>非哥股票作战台</h1><div class="mock">模拟数据 · 静态持仓 · 手动参数</div><nav class="tabs"><a href="#overview">总览</a><a href="#a">A股</a><a href="#us">美股</a><a href="#risk">风险</a><a href="#records">记录</a><a href="#settings">设置</a></nav></header><section id="overview" class="hero"><small>今日总指令</small><h2>不追高，只做分批锁盈</h2><div class="grid">${cardRows([["总仓位", `${stockPosition.toFixed(1)}%`, "黄灯区间"],["风险灯","黄灯","科技集中度偏高"],["科技集中度","约 70%","芯片/AI/通信相关"],["现金垫",cny.format(cash),"可在设置页修改"]])}</div></section><section class="grid">${cardRows([["A股持仓市值", cny.format(aTotal), `浮盈 ${cny.format(aPnl)}`],["美股持仓市值", usd.format(usTotal), `折算 ${cny.format(usTotal * rate)}`],["机动现金", cny.format(cash), "模拟参数"],["总资产估算", cny.format(totalAssets), "静态数据 + 手动参数"]])}</section><section id="a" class="section"><h2>A股持仓</h2><div class="hold-grid">${holdings(aShares, "A股")}</div></section><section id="us" class="section"><h2>美股持仓</h2><div class="hold-grid">${holdings(usShares, "美股")}</div></section><section id="risk" class="section panel"><h2>风险提醒</h2><div class="risk"><div><span>整体股票仓位</span><b>${stockPosition.toFixed(1)}%</b></div><div><span>科创/科技集中度</span><b>偏高</b></div><div><span>单票集中风险</span><b>需关注科创芯50</b></div><div><span>现金垫是否充足</span><b>${cny.format(cash)}</b></div><div><span>今日操作</span><b>不追高</b></div></div></section><section id="records" class="section panel"><h2>操作记录</h2><p>2026-05-06 · A股 · 澜起科技 · 卖出计划：浮盈较大，防单票回撤。</p><p>2026-05-06 · 美股 · META / APH · 持有：核心仓趋势仍在。</p></section><section id="settings" class="section panel"><h2>参数设置</h2><p>机动现金：${cny.format(cash)}；美股折算汇率：${rate}。</p><p>预留接口：/api/quotes/a-share、/api/quotes/us、/api/portfolio/sync。</p></section></main><nav class="bottom"><a href="#overview">总览</a><a href="#a">A股</a><a href="#us">美股</a><a href="#risk">风险</a><a href="#records">记录</a><a href="#settings">设置</a></nav></body></html>`;
}
