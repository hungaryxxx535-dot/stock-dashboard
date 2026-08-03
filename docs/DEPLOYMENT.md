# 部署与启停

要求：Node 20、Python 3.11、SQLite。安装：

```bash
npm ci
python -m pip install -r requirements-quant.txt
python -m pip install -r akshare-service/requirements.txt
python -m hermes_quant.cli init-db
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
