# 数据源

- Tushare：A 股指数、宏观与资金数据，需要 `TUSHARE_TOKEN`。
- AKShare/东方财富：A 股与港股公开行情，可部署独立服务。
- FRED：VIX、利率、美元和美国宏观；无密钥时可尝试公开 CSV。
- Twelve Data：美股收盘行情，需要 `TWELVE_DATA_API_KEY`。
- GDELT、Google News RSS：公开新闻线索，只作为研究证据，不直接生成买卖结论。

所有来源都必须设置超时并返回统一状态。静态数据只能标为匿名演示或历史快照，禁止标为实时/最新行情。缓存、延迟、回退与过期必须对用户可见。
