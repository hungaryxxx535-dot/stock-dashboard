# 架构

`src/app` 只负责路由，`components` 负责展示与交互，`domain` 放置 Zod 模型和分析引擎，`lib/data-providers` 隔离外部数据源，`lib/storage` 提供统一 Repository，`server/services` 聚合服务端数据。

本地模式链路为：页面 → DataProvider → Repository → IndexedDB。市场链路为：API Route → Market Service → 多 Provider（`Promise.allSettled`、超时）→ 统一状态。缺少凭证或单源失败不会阻塞页面。

新增 Provider 时实现统一结果结构，包含数据、来源、行情时间、抓取时间、新鲜度、缓存与回退标志；在 Market Service 注册，并为未配置、超时和部分成功增加测试。
