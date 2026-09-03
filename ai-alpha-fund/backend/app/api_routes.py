from fastapi import APIRouter
from .engine import generate_strategy
from .risk_engine import risk_check
from .portfolio import get_positions

router = APIRouter()

@router.get('/strategy')
def strategy():
    return generate_strategy()

@router.get('/risk')
def risk():
    return risk_check(get_positions())

@router.get('/portfolio')
def portfolio():
    return get_positions()
