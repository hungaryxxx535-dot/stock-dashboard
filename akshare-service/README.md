# 非哥 A股 AKShare 行情服务

这是一个独立的 Python FastAPI 服务，用 AKShare 获取 A股 / ETF 公开行情，供非哥股票作战台读取。

## 接口

### 健康检查

```bash
GET /health
```

### A股盘中行情

```bash
GET /api/a/spot
```

可选参数：

```bash
GET /api/a/spot?force=true
```

如果配置了 `AKSHARE_SERVICE_TOKEN`，请求时需要带 Header：

```bash
x-service-token: 你的token
```

## 本地运行

```bash
cd akshare-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

打开：

```bash
http://127.0.0.1:8000/health
http://127.0.0.1:8000/api/a/spot
```

## Docker 运行

```bash
cd akshare-service
docker build -t fei-stock-akshare-api .
docker run -p 8000:8000 fei-stock-akshare-api
```

## Render 部署

仓库已经包含：

```text
akshare-service/Dockerfile
akshare-service/render.yaml
```

在 Render 中选择：

```text
New +
Blueprint
Connect GitHub Repository
选择 stock-dashboard
Apply render.yaml
```

部署完成后，会得到一个类似这样的地址：

```text
https://fei-stock-akshare-api.onrender.com
```

然后在 Vercel 的 stock-dashboard 项目里增加环境变量：

```text
AKSHARE_API_URL=https://你的-render服务地址
AKSHARE_SERVICE_TOKEN=你的服务token（如果 Render 里配置了）
```

如果 Render 里没有强制 token，则 Vercel 里可以不填 `AKSHARE_SERVICE_TOKEN`。

## 前端接入

前端接口：

```text
/api/a-live/latest
```

页面：

```text
/a-live
```

## 注意

AKShare 数据来自公开行情源，适合盘中观察，不作为唯一交易依据。

建议：

- 缓存 30 秒，不要高频刷新。
- 接口失败时前端回退静态持仓。
- 真正下单前仍然以券商 App / 同花顺 / 富途等实时行情为准。
