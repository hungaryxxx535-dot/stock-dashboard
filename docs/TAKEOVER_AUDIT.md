# Hermes 接管审计记录

审计日期：2026-08-03（Asia/Shanghai）  
安全基线提交：`1663cff0e5427d84cad34435219cf5c90e35838e`

## 结论

现有仓库是可运行的 Next.js 个人股票作战平台，具备本地持仓、研究、风险、计划、复盘、行情聚合、AkShare 辅助服务和前端测试。它不是历史回测或模拟券商系统；审计时未发现点时股票池、历史状态库、事件顺序回测、Paper Broker、五账户对照、飞书统一消息或完整调度运行记录。

因此，现有页面通过不能证明策略有效，也不能生成可信历史业绩。接管采用“保留前端，新增隔离量化核心”的方式，避免重写已通过验收的界面和本地数据工作流。

## 仓库与环境

- Git 分支：`codex/ocr-name-match-layout`
- 接管前 HEAD：`dc326cb`
- 安全基线：`1663cff`
- Node/Next：以 `package-lock.json` 和 Node 20 CI 为准。
- Python：3.11.15。
- SQLite：3.53.1。
- AkShare：本机 1.18.75；现有服务声明 `akshare>=1.15`。
- `.env.local` 只审计了变量名，未读取或输出值；发现 `AKSHARE_API_URL`。

## 接管前真实验证

- `npm run security:scan`：通过，176个跟踪文件。
- `npm run typecheck`：通过。
- `npm run lint`：通过，无警告或错误。
- `npm run test`：通过，5个测试文件、44个测试。
- `npm run build`：通过，29个路由生成成功。
- `npm run smoke`：通过，12个页面及市场接口失败降级通过。
- `npm run test:e2e`：通过，45个 Playwright 测试。

## 模块现状

- 启动入口：`npm run dev`、`npm run services`、`akshare-service/main.py`。
- 选股：仅有候选评分与观察池展示，不是可回测的独立策略实现。
- 回测：不存在。
- 数据：前端 Provider 聚合、IndexedDB/Supabase Repository、AkShare FastAPI 服务存在，但没有统一历史数据版本和点时状态表。
- 数据库：浏览器 IndexedDB 为主；没有量化历史库或迁移版本表。
- 模拟交易：不存在。现有 TradePlan 仅是人工计划状态机，不撮合订单。
- 飞书：不存在本项目统一推送模块。
- 定时任务：`/api/cron/daily` 只返回时间线节点；未配置 `CRON_SECRET` 时关闭，未见08:00/09:25推送。

## 偏差与可信度审计

- 未发现可审计的历史回测结果，因此不存在“当前回测可信”的结论。
- 当前匿名 Demo 数据明确标注为演示，没有被当作真实回测。
- 当前候选评分基于当下状态对象，不能直接用于历史回测；若用今日证券清单回推历史将产生幸存者偏差。
- 现有代码没有财务披露时间、历史 ST/停牌/退市/行业成员关系，因此尚不能构造 Point-in-Time 股票池。
- 未发现删除亏损交易或同K线理想成交代码，因为成交引擎尚不存在。

## 安全发现

- `public/stock-backup.json` 为未跟踪文件，未读取其内容，按潜在真实持仓处理；已加入精确忽略规则，禁止提交。
- `Documents/Hermes/temp_portfolio_check.py` 位于另一个空仓库并连接本地 Futu Quote 服务，不属于本目标仓库；本次未执行、未修改，也未建立任何券商连接。
- 现有密钥均通过环境变量读取；接管期间不得输出其值。

## 实施边界

后续离线测试可使用明确标记的合成夹具验证时间规则和撮合逻辑，但夹具结果不得报告为真实 A 股回测。真实联网数据集成将单独运行并记录成功接口、数据时间和缺失项。
