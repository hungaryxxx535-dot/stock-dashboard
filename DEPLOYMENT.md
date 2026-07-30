# 部署

Vercel 导入 GitHub 仓库后使用 Node 20、`npm ci` 和 `npm run build`。所有环境变量均可留空，站点会以匿名 Demo 和降级行情模式运行。

需要市场数据时按 `.env.example` 配置对应 Provider。需要 Cron 时设置高熵 `CRON_SECRET`；`/api/cron/daily` 未配置时返回手工模式说明，未授权请求返回 401。Supabase 未配置时自动停用云同步。

部署后验证 `/manifest.json`、`/icon.svg`、所有核心路由、`/api/market` 和 `/api/cron/daily`。API 超时不得拖住整页，构建日志不得输出环境变量。回滚方式是在 Vercel 将上一个成功 Deployment 提升为 Production，数据结构则使用用户导出的 JSON 或 IndexedDB 快照恢复。
