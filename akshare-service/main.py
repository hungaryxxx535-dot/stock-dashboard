from fastapi import FastAPI
import akshare as ak
import pandas as pd
from fastapi.responses import JSONResponse

app = FastAPI(title="AKShare A股服务")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/a/spot")
def a_spot():
    try:
        # 获取A股实时行情
        stock_list = ['000001', '510050']  # 示例股票+ETF
        result = {}
        for code in stock_list:
            data = ak.stock_zh_a_spot_em()
            df = data[data['代码'].isin(stock_list)]
            result[code] = df[df['代码'] == code].to_dict(orient='records')
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(content={'error': str(e)}, status_code=500)