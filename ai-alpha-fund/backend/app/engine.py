"""AI Alpha Fund decision engine core."""

from datetime import datetime


def market_score(macro=70, technical=70, industry=75):
    score = round(macro*0.3 + technical*0.3 + industry*0.4, 1)
    return {
        "score": score,
        "mode": "Adaptive Strategy" if score >= 65 else "Risk Control"
    }


def generate_decision():
    result = market_score()
    return {
        "date": str(datetime.now()),
        "market_score": result["score"],
        "strategy": result["mode"],
        "action": "SCAN_AND_SELECT",
        "description": "AI investment committee generated decision"
    }
