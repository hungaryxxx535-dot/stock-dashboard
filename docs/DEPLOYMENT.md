# 部署与启停

要求：Node 20、Python 3.11、SQLite。安装：

```bash
npm ci
python -m pip install -r requirements-quant.txt
python -m pip install -r akshare-service/requirements.txt
python -m hermes_quant.cli init-db
```

量化API使用`.env.local`中的随机`HERMES_QUANT_API_TOKEN`，只允许绑定`127.0.0.1`：

```bash
npm run quant:api:start
npm run quant:api:status
npm run quant:api:stop
```

启动开发平台与AkShare服务：

```bash
npm run services
```

停止由该命令记录的两个进程：

```bash
npm run services:stop
```

生产前检查：

```bash
npm run security:scan
npm run typecheck
npm run lint
npm run test
npm run quant:test
npm run quant:smoke
npm run build
npm run smoke
npm run test:e2e
```

数据库和日志位于`.local-private/`。升级只执行新增迁移，不清库。Git回滚到接管基线：`git switch --detach 1663cff0e5427d84cad34435219cf5c90e35838e`；恢复当前分支：`git switch codex/ocr-name-match-layout`。不要在有未提交私人数据时执行破坏性重置。

前向模拟盘的Hermes cron只有在远程备份、真实数据、Paper Broker、幂等性和飞书真实发送全部通过后才能创建。本次飞书缺少应用发送权限且竞价委托簿缺失，因此所有量化cron保持关闭。
