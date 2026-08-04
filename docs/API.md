# Hermes Quant Loopback API

启动：`npm run quant:api:start`。状态：`npm run quant:api:status`。停止：`npm run quant:api:stop`。

服务只接受`http://127.0.0.1:8765`，每个请求必须带`Authorization: Bearer <HERMES_QUANT_API_TOKEN>`。POST还必须带`Idempotency-Key`；相同键和相同请求返回同一结果，相同键配不同请求会拒绝。密钥只放`.env.local`，不得写入Git、日志或请求URL。

响应统一包含`request_id`、`run_id`、`model_version`、`environment`、`data_timestamp`、`data_sources`、`data_quality`、`success`、`error_code`、`error_message`和`data`。Hermes客户端拒绝非`paper`环境、缺字段、过期时间和公开地址。

GET端点：`/health`、`/system/status`、`/market/regime`、`/paper/account`、`/paper/positions`、`/paper/orders`、`/reports/daily`、`/reports/weekly`、`/models/status`。

POST端点：`/candidates/premarket`、`/candidates/auction-review`、`/paper/orders`、`/paper/orders/{id}/cancel`、`/strategies/{id}/pause`、`/strategies/{id}/resume`。

系统没有真实券商端点。09:25接口在没有真实竞价数据时返回明确错误；盘前接口允许返回0只，不会强行凑数。
