"""AI Alpha Fund simulated trading engine"""

from datetime import datetime

trades = []


def create_trade(symbol, action, amount, reason):
    trade = {
        "time": str(datetime.now()),
        "symbol": symbol,
        "action": action,
        "amount": amount,
        "reason": reason
    }
    trades.append(trade)
    return trade


def get_trades():
    return trades
