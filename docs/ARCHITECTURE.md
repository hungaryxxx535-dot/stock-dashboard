# Hermes 架构

系统分为两个边界清晰的运行面：现有 Next.js 平台负责交互、持仓导入和展示；`hermes_quant` 负责历史数据、点时查询、策略、回测、模拟成交、运行记录和消息。两者不包含真实券商适配器。

数据链路：`DataProvider → ResilientProvider（超时/重试/限速/缓存）→ 校验 → SQLite版本库 → PointInTimeUniverse → 策略信号 → 风险检查 → EventDrivenBacktester/PaperBroker → 指标/账户 → 消息`。

关键模块：

- `hermes_quant/data`：AkShare适配器、缓存、迁移仓库、质量校验、板块规则和点时股票池。
- `hermes_quant/strategies`：A—E五套独立定义，保存分项评分与版本。
- `hermes_quant/paper`：订单状态机、现金冻结、T+1、部分成交和费用。
- `hermes_quant/backtest`：复用Paper Broker的事件顺序回测、Walk-Forward与指标。
- `hermes_quant/risk.py`：总仓位、单标的、行业和市场环境限额。
- `hermes_quant/governance.py`：20/60交易日和人工批准门槛。
- `hermes_quant/scheduler`：交易日、重试、补跑和幂等run_id。
- `hermes_quant/messaging`：飞书模板、拆分、重试、去重和免责声明。
- `hermes_quant/api`：仅监听loopback的Bearer鉴权HTTP边界，提供严格响应信封、速率限制和SQLite幂等键。Hermes只能经该边界调用，不能直接读取数据库。

SQLite默认存于 `.local-private/hermes_quant.db`，缓存存于 `.local-private/cache`；两者均被Git忽略。迁移按文件名顺序执行并记录于 `schema_migrations`。

调用流为：`Hermes skill/job → QuantClient → http://127.0.0.1:8765 → QuantApiService → repository/Paper account`。接口固定返回`environment=paper`，仓库没有真实券商SDK、账户登录或真实订单提交入口。
