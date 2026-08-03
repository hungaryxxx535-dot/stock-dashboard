# Hermes 验收报告

状态日期：2026-08-03。

## 已完成

- 安全基线、AGENTS规则和接管审计。
- 三版SQLite迁移及16类要求的数据表/等价结构。
- DataProvider、AkShare、超时、重试、限速、缓存、增量、质量日志、同步run和数据版本。
- Point-in-Time查询、公告时点和板块规则解析。
- A—E五策略独立定义与分项评分。
- 事件顺序回测、Walk-Forward、一次性holdout和完整指标结构。
- Paper Broker、五账户、风险限制和Champion–Challenger门槛。
- 默认关闭的幂等调度与飞书统一消息模块。

## 真实数据

- 当前上市A股5203条，带真实上市日期。
- 招商银行`600036`在2024-01-02至2024-01-10的7条日线，质量错误0。
- 未补齐已退市、历史ST/停牌、公告/财务披露、行业/指数成分、公司行动、复权和分钟数据。

## 可信度结论

点时与撮合机制已由测试夹具验证；真实全市场历史数据未完整，因此当前没有可信的策略回测收益，禁止发布业绩结论。Paper Broker机制已跑通，真实交易日模拟观察期尚未启动。飞书假传输已跑通，真实Webhook未配置、未发送。所有定时任务仍关闭。

## 实际测试结果

- `npm run security:scan`：通过，216个跟踪文件；新增文档提交后还需在最终提交前再跑一次。
- `npm run typecheck`：通过。
- `npm run lint`：通过，无错误；Next.js提示该命令未来将迁移到ESLint CLI，不影响本次结果。
- `npm run test`：5个文件、44个测试全部通过。
- `npm run quant:test`：28个测试全部通过，覆盖适配器恢复、迁移、点时、未来公告、板块规则、策略、订单状态、T+1、停牌、涨跌停、部分成交、费用、资金不足、风险拒单、调度幂等、飞书去重、治理和可复现性。
- `npm run quant:smoke`：通过；三版迁移、1个夹具股票池成员、2笔模拟订单、1笔闭合交易。输出明确标记`TEST_FIXTURE`，不是业绩。
- `npm run build`：通过，29个Next.js路由完成生产构建。
- `npm run smoke`：12个页面及市场API失败降级全部通过。
- `npm run test:e2e`：45个Playwright测试全部通过。
- `node --check tools/start-services.mjs`与`stop-services.mjs`：语法通过。

## 运行、停止与回滚

- 启动：`npm run services`。
- 停止：`npm run services:stop`，只读取`.local-private`中的专用PID文件。
- 量化初始化：`npm run quant:init`；诊断：`npm run quant:doctor`。
- 安全基线：`1663cff0e5427d84cad34435219cf5c90e35838e`。
- 非破坏性查看基线：`git switch --detach 1663cff0e5427d84cad34435219cf5c90e35838e`；返回：`git switch codex/ocr-name-match-layout`。

## 当前已知限制

- 日线回测是保守近似，不是分钟级成交重放。
- 行业/市场环境分组指标需要真实历史标签后才会产生。
- 当前证券快照不能替代含退市股的历史证券库。
- 20/60交易日模型观察期不能在本次工程验收中完成。
