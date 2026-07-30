# 数据模型

Schema v2 定义在 `src/domain/model.ts`，包含 Account、Portfolio、Holding、Transaction、CashBalance、Instrument、Quote、PortfolioSnapshot、ImportJob、DataVersion、Watchlist、WatchlistItem、ResearchSnapshot、TradePlan、JournalEntry、RiskRule、Alert、DataSourceStatus 和 UserSettings。

Holding 分开记录券商显示成本与经济成本；关闭仓位不计入当前市值。所有导入必须先通过 Zod 校验，导入前生成快照。报价包含来源、市场时间、抓取时间、新鲜度和是否回退。交易计划使用显式状态机，不产生自动下单。
