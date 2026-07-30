# 非哥股票作战平台

面向个人投资者的本地优先、移动优先作战系统。它把持仓、市场、研究、计划、风险和复盘放进一条可审计的工作流，但不连接券商下单、不承诺收益，也不把缺失数据伪装为实时数据。

## 已实现

- 统一 App Shell：桌面可折叠侧栏、移动端五入口和 `Ctrl/Cmd + K` 命令面板。
- V2 强类型数据模型、Zod 校验、IndexedDB Repository、JSON 备份/恢复和 V1 迁移入口。
- 持仓新增与软关闭、券商成本/经济成本双口径、账户仓位/整体仓位双口径。
- 市场 Provider 聚合与超时、部分可用、缓存、过期、未配置、失败降级状态。
- 研究 14 维框架、观察池、结构化计划、每日时间线、风险压力测试和过程/结果分离的复盘。
- 无密钥可构建；Supabase、Cron、Tushare、AKShare、FRED 和 Twelve Data 均为可选能力。

## 本地运行

```bash
npm ci
npm run dev
```

真实持仓默认写入浏览器 IndexedDB。首次打开为匿名 Demo；在“设置”中导出 JSON 备份，在“导入中心”校验恢复。截图默认只应在本机 OCR，失败不会覆盖当前数据。

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
