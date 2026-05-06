# 非哥股票作战台

手机优先的股票持仓 Dashboard / PWA MVP。当前版本使用**模拟数据 / 静态示例持仓 / 手动参数**，不接真实行情 API。

## 技术栈

- Next.js App Router 项目结构
- React 页面组件
- Tailwind CSS 样式约定
- shadcn/ui 风格本地组件
- recharts
- lucide-react
- framer-motion

> 说明：本仓库为受限环境下的可运行 MVP，`npm install` 使用本仓库内的本地 package 依赖，避免 npm registry 代理/权限导致安装失败；`.npmrc` 仍固定为官方 npm registry：`https://registry.npmjs.org/`，后续接入真实外部依赖时可直接替换为正式版本号。

## 本地运行

```bash
npm install
npm run dev
```

默认端口：`3000`。

启动后访问：<http://localhost:3000>

如需指定端口：

```bash
npm run dev -- --port 3001
```

## 功能范围

- 首页总览：A股市值、美股市值、机动现金、总仓位、今日总指令、风险灯。
- A股持仓：名称、代码、持仓数量、成本价、现价、市值、浮盈亏、仓位占比、类型、操作建议、备注。
- 美股持仓：名称、代码、持仓数量、成本价、现价、市值、浮盈亏、仓位占比、止损价、目标价、趋势状态、备注。
- 风险提醒：整体股票仓位、科技集中度、单票集中风险、现金垫、今日操作建议。
- 操作记录：日期、市场、标的、买入/卖出计划、操作原因、结果复盘。
- 参数设置：机动现金、美股折算汇率，并预留行情 API 接口。
