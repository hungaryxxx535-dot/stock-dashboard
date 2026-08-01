# 非哥股票作战平台

面向个人投资者的本地优先、移动优先作战系统。它把持仓、市场、研究、计划、风险和复盘放进一条可审计的工作流，但不连接券商下单、不承诺收益，也不把缺失数据伪装为实时数据。

## 已实现

- 统一 App Shell：桌面可折叠侧栏、移动端五入口和 `Ctrl/Cmd + K` 命令面板。
- V2 强类型数据模型、Zod 校验、IndexedDB Repository、JSON 备份/恢复和 V1 迁移入口。
- 持仓新增与软关闭、券商成本/经济成本双口径、账户仓位/整体仓位双口径。
- 市场 Provider 聚合与超时、部分可用、缓存、过期、未配置、失败降级状态。
- 市场雷达免密钥接入腾讯公开指数、新浪商品/汇率与新浪财经新闻；Tushare 配置后自动增强。
- 研究 14 维框架、观察池、结构化计划、每日时间线、风险压力测试和过程/结果分离的复盘。
- 自动日/周/月复盘与“今日归档”：一键生成可审计复盘报告，归档时创建日终快照。
- 无密钥可构建；Supabase、Cron、Tushare、AKShare、FRED 和 Twelve Data 均为可选能力。

## 本地运行

```bash
npm ci
npm run dev
```

真实持仓默认写入浏览器 IndexedDB。首次打开为匿名 Demo；持仓中心按 A股、美股、港股分区展示，新增持仓可从“上传持仓截图”或“上传 CSV（含列映射）”进入。导入时先选择市场，可连续上传多张券商截图；OCR 在当前浏览器运行，识别结果经逐条核对和一次确认后才写入本机，截图之外的现有持仓不会自动删除。A股名称匹配使用内置证券字典（A股 + 基金/ETF），拿不准的标的会列出候选并要求确认后才可导入，绝不自动猜码。每次确认导入前都会创建可恢复快照。

一键拉起本地行情服务（AKShare，端口 8000）与开发服务器：

```bash
npm run services
```

可选云同步（Supabase）：设置 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 后自动启用；建表 SQL 见 `src/lib/storage/supabase-adapter.ts` 顶部注释。未配置时保持本地 IndexedDB 模式。

“设置”支持导出 JSON 备份，“导入中心”保留 V2 JSON 严格校验恢复。OCR 运行组件和中英文模型首次使用时需要联网加载，但持仓图片不会发送到本站服务器或写入 GitHub。

## 质量检查

```bash
npm run security:scan
npm run typecheck
npm run lint
npm run test
npm run build
npm run smoke
npx playwright install chromium
npm run test:e2e
```

更多说明见 [产品规格](PRODUCT_SPEC.md)、[架构](ARCHITECTURE.md)、[数据模型](DATA_MODEL.md)、[数据源](DATA_SOURCES.md)、[迁移](MIGRATION.md)、[安全](SECURITY.md) 和 [部署](DEPLOYMENT.md)。
