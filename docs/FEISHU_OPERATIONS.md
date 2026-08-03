# 飞书与日程运维

飞书消息类型包括盘前候选、竞价复核、模拟成交、持仓风险、收盘复盘、周报、月报和系统异常。每条消息包含PAPER标识、数据截止时间、模型版本和固定声明：

> 仅为模拟交易系统输出，不代表真实证券交易指令。

`FeishuMessenger`支持内容哈希去重、失败重试、失败记录和长消息拆分。默认`enabled=false`；Webhook只从`FEISHU_WEBHOOK_URL`读取并要求HTTPS。本次只用`RecordingTransport`完成测试，没有向真实飞书发送消息。

日程节点为07:30、08:00、09:25、09:30、11:30、14:30、15:10、15:30。所有任务由`HERMES_SCHEDULER_ENABLED=false`默认关闭；08:00与09:25另有独立门禁，当前配置类在它们为true时直接拒绝启动。运行记录包含run_id、幂等键、状态、重试次数和错误。

验收前不得改变以下值：

```text
HERMES_SCHEDULER_ENABLED=false
HERMES_0800_PUSH_ENABLED=false
HERMES_0925_PUSH_ENABLED=false
```
