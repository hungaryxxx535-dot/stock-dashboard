# Point-in-Time 股票池

`PointInTimeUniverse.members(as_of, known_at)`只返回：

1. `listing_date <= as_of`且尚未在当日之前退市；
2. 证券主记录的有效区间覆盖`as_of`；
3. 风险警示、停牌等状态的有效区间覆盖查询时点，且其公告时间不晚于`known_at`；
4. 根据调用参数排除风险警示和不可交易证券。

公告查询强制`published_at <= signal_time`。板块涨跌停规则通过`PriceLimitRuleResolver`按板块、风险状态和有效起止日期解析。财务数据必须采用`financial_release_dates.published_at`，禁止用报告期末替代。

自动化测试已验证未来上市不提前进入、退市股仍保留在历史样本、ST和停牌区间生效、未来公告不可见、主板和创业板规则按日期区分。

当前生产数据库只有当前上市证券快照；没有完整退市和历史状态库。因此点时查询机制已通过，但真实全市场历史股票池数据尚未验收，不能用于可信策略业绩。
