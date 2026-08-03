# Paper Broker

唯一允许的成交组件是`hermes_quant.paper.PaperBroker`。订单状态包括`CREATED/SUBMITTED/ACCEPTED/PARTIALLY_FILLED/FILLED/CANCELLED/REJECTED/EXPIRED`，并保存附件要求的全部时间、价格、数量、费用、拒绝原因和数据时间戳。

买单按限价和最低佣金冻结现金；成交后释放实际使用部分，完成或撤单时释放余额。买入数量进入`pending_t1_quantity`，下一交易日结算后才进入`sellable_quantity`。卖单不得超过可卖数量。

成交数量不超过K线成交量参与率；停牌、无量、买入一字涨停和卖出一字跌停不成交。日线模式明确标记`DAILY_APPROXIMATION`，不宣称分钟级精度。

五个账户为Champion、候选等权、点时随机、指数/风格基准和Challenger，使用相同初始资金和费用对象，状态相互隔离。当前机制烟雾已跑通，但尚未启动真实交易日模拟观察期。
