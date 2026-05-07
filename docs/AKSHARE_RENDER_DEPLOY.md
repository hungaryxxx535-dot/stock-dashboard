# A股 AKShare 服务部署清单

这份文档用于把 `akshare-service` 部署到 Render，并接入非哥股票作战台。

## 当前代码状态

仓库已经包含：

```text
akshare-service/main.py
akshare-service/requirements.txt
akshare-service/Dockerfile
render.yaml
src/app/a-live/page.tsx
src/app/system-status/page.tsx
src/app/api/a-live/latest/route.ts
src/app/api/a-live/health/route.ts
```

也就是说：代码已经准备好，下一步只需要在 Render 后台创建服务。

---

## 第一步：在 Render 部署 AKShare 服务

进入 Render 后台：

```text
New +
→ Blueprint
→ Connect GitHub Repository
→ 选择 stock-dashboard
→ Render 会读取根目录 render.yaml
→ Apply / Deploy
```

Render 会创建一个服务：

```text
fei-stock-akshare-api
```

部署完成后，Render 会给出一个服务地址，格式类似：

```text
https://fei-stock-akshare-api.onrender.com
```

---

## 第二步：测试 Render 服务是否启动

打开：

```text
https://你的-render服务地址/health
```

正常应该看到类似：

```json
{
  "status": "ok",
  "service": "fei-stock-akshare-api"
}
```

再测试：

```text
https://你的-render服务地址/api/a/spot
```

正常会返回 A股核心持仓行情 JSON。

---

## 第三步：把 Render 地址填到 Vercel

进入 Vercel 的 `stock-dashboard` 项目：

```text
Settings
→ Environment Variables
→ Add Environment Variable
```

添加：

```text
Name: AKSHARE_API_URL
Value: https://你的-render服务地址
Environment: Production / Preview / Development 全选
```

如果 Render 自动生成了 `AKSHARE_SERVICE_TOKEN`，则也需要在 Vercel 添加同一个：

```text
Name: AKSHARE_SERVICE_TOKEN
Value: Render 服务里的 AKSHARE_SERVICE_TOKEN
Environment: Production / Preview / Development 全选
```

如果你暂时不想用 token，可以在 Render 里删除或清空 `AKSHARE_SERVICE_TOKEN`，这样 Vercel 也不用填。

---

## 第四步：重新部署 Vercel

Vercel 环境变量保存后，需要重新部署一次。

可以手动 Redeploy，也可以让 ChatGPT 推一个小提交触发自动部署。

---

## 第五步：检查系统状态

打开股票作战台右下角：

```text
系统状态
```

或者直接打开：

```text
/system-status
```

看到以下状态即为接入完成：

```text
美股收盘：updated
A股盘中：updated
AKShare 服务：connected
AKSHARE_API_URL：已配置
```

---

## 关键页面

```text
/a-live
A股盘中观察页面
```

```text
/system-status
系统状态自检页面
```

```text
/api/a-live/health
AKShare 服务健康检查
```

```text
/api/a-live/latest
A股行情代理接口
```

---

## 常见问题

### 1. /system-status 显示 AKSHARE_API_URL 未配置

说明 Vercel 还没有填写 Render 服务地址。

解决：去 Vercel 添加 `AKSHARE_API_URL`。

### 2. /system-status 显示 connection_failed

可能原因：

```text
Render 服务还没部署完成
Render 免费服务冷启动中
AKSHARE_API_URL 地址填错
服务启动失败
```

先打开：

```text
https://你的-render服务地址/health
```

确认 Render 服务本身是否正常。

### 3. A股行情返回静态回退

说明 Vercel 前端没有成功连上 AKShare 服务，页面会自动回退到静态持仓，避免空白。

### 4. Render 构建失败

重点检查：

```text
render.yaml 是否在仓库根目录
Dockerfile 路径是否为 akshare-service/Dockerfile
requirements.txt 是否存在
main.py 是否存在
```

当前代码已经按根目录 Render Blueprint 修正过 Dockerfile 路径。

---

## 当前原则

AKShare 数据来自公开行情源，适合盘中观察，不作为唯一交易依据。真正下单前仍以券商 App / 同花顺 / 富途等实时行情为准。
