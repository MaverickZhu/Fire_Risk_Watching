# 上海消防风险监测预警大屏原型

本项目是一个本地可运行的 `Vite + React + TypeScript` 前端原型，用于展示上海消防风险监测预警大屏的 UI 和交互设计。

## 已实现能力

- `16:9` 与 `32:9` 双横屏布局切换
- Three.js 风格化上海行政区三维风险沙盘
- 行政区专题模式：选中区后放大居中，并按真实街镇边界显示街镇分区
- 地图缩放控件：支持放大、缩小、复位
- 高层建筑、厂库房、医疗机构、新能源、电动自行车、危化动火、消防资源等图层开关
- 行政区点击、风险对象点击、模块折叠和拖拽原型
- AI 综合研判面板，预留 `askAI()`、`searchKnowledge()`、`startVoiceInput()` 接口
- RAG、语音、多模态图层融合的模拟交互
- 后续 RAG/向量库开发用 Docker Compose 预留配置

## 本地运行

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

访问：

```text
http://127.0.0.1:5173/
```

如需启用本地 Ollama AI 综合研判，先确认 Ollama 已启动并已拉取模型：

```bash
ollama serve
ollama list
```

模型名需包含：

```text
qwen3.6:35b-a3b-q8_0
```

启动本地 AI 代理：

```bash
npm run dev:api
```

或同时启动代理与前端：

```bash
npm run dev:all
```

前端默认请求：

```text
http://127.0.0.1:8787/api/ai/analyze
```

## 验证

```bash
npm run build
npm run lint
```

如需重新进行浏览器截图验证：

```bash
npx playwright install chromium
```

## Docker 预留

当前原型不依赖数据库。进入真实功能开发后，可先启动本地 `Postgres + pgvector`：

```bash
docker compose up -d
```

默认连接信息：

```text
POSTGRES_DB=fire_risk_dashboard
POSTGRES_USER=fire_risk
POSTGRES_PASSWORD=fire_risk_local
DATABASE_URL=postgresql://fire_risk:fire_risk_local@localhost:5432/fire_risk_dashboard
```

## 地图数据

- 区级行政区边界：DataV 公开上海市区级 GeoJSON。
- 街镇边界：OpenStreetMap Overpass 行政边界关系 `admin_level=8`，本地转换为 `src/data/geo/shanghai-street-towns.json`。
