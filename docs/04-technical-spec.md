# 上海消防风险监测预警平台技术说明书

## 1. 当前技术栈

原型阶段：

- 前端框架：Vite + React + TypeScript
- 三维地图：Three.js
- 图表与知识图谱：ECharts
- 图标：lucide-react
- 拖拽：@dnd-kit
- AI 代理：Node.js 本地 HTTP 服务
- 本地模型：Ollama `qwen3.6:35b-a3b-q8_0`
- Docker 预留：Postgres + pgvector

实体项目阶段建议：

- 前端继续采用 React + TypeScript。
- 后端采用 FastAPI 或 Node API。
- 主库采用 PostgreSQL/PostGIS。
- 向量库采用 pgvector 或独立向量数据库。
- 图数据库可在后续阶段接入 Neo4j。
- GIS 服务可接入 GeoServer、ArcGIS Server 或政务地图服务。
- 视频调度接入实际图传平台、GB/T 28181、WebRTC 或厂商 SDK。

## 2. 前端架构

核心结构：

- `src/App.tsx`：页面主状态、模块切换、AI 上下文、跨模块联动。
- `src/components/ThreeRiskMap.tsx`：上海三维地图、区级/街镇/行业/应急/安保图层。
- `src/components/KnowledgeGraphView.tsx`：ECharts 知识图谱。
- `src/components/TrendChart.tsx`：趋势图。
- `src/data/*.ts`：原型模拟数据。
- `src/data/knowledgeGraph.ts`：从 mock 数据派生知识图谱。
- `src/services/aiAdapter.ts`：AI 调用适配器与 mock 降级。
- `server/ollamaProxy.mjs`：本地 Ollama 代理。
- `server/dev.mjs`：本地开发启动器，自动检查并启动 AI 代理。

状态设计：

- `activeStage` 控制当前专题。
- `selectedDistrict`、`overviewDistrict` 控制总览和行政区聚焦。
- `selectedIndustry`、`industryScope`、`selectedIndustryUnit` 控制行业专题。
- `selectedIncident` 控制应急处置。
- `selectedSecurityTaskId`、`selectedSecurityForceId` 控制安保模式。
- `selectedGraphNodeId`、`selectedGraphEdgeId`、`graphFilters`、`graphSearch` 控制知识图谱。
- `question`、`aiResult`、`conversationHistory` 控制 AI 面板。

## 3. 数据模型

核心主数据：

- `RiskObject`：风险对象和行业单位统一结构。
- `LayerDefinition`：图层定义。
- `EmergencyIncident`：警情。
- `FireInspectionRecord`：消防检查记录。
- `SecurityTask`：安保任务。
- `SecurityForcePoint`：安保力量点位。
- `KnowledgeGraphNode`：知识图谱节点。
- `KnowledgeGraphEdge`：知识图谱关系。

实体项目建议补充：

- 统一单位主键：重点单位 ID、统一社会信用代码、场所编码。
- 统一空间主键：行政区编码、街镇编码、网格编码、建筑物编码。
- 统一事件主键：告警 ID、警情 ID、隐患 ID、检查记录 ID。
- 统一力量主键：队站 ID、车辆 ID、人员 ID、装备 ID、勤务点 ID。
- 元数据表：数据来源、更新时间、可信度、采集方式、责任系统。

## 4. AI 与工具调用

当前实现：

- 前端调用 `askAI()`。
- `askAI()` 请求 `http://127.0.0.1:8787/api/ai/analyze`。
- 代理调用 Ollama `/api/chat`。
- 模型返回结构化 JSON。
- 前端校验工具白名单并执行。
- Ollama 不可用时降级 mock。

AI 请求应包含：

- 当前专题 `stage`
- 用户操作 `operation`
- 选中对象 `selectedObject`
- 图层状态 `activeLayers`
- 筛选状态 `uiState`
- 当前风险对象集合 `riskObjects`
- 知识图谱节点、边和关系路径
- 对话历史 `conversationHistory`

工具调用白名单：

- `switch_stage`
- `select_district`
- `reset_overview`
- `select_industry`
- `select_industry_district`
- `select_industry_unit`
- `select_incident`
- `set_incident_time_preset`
- `select_security_task`
- `select_security_force`
- `toggle_layer`
- `toggle_security_layer`
- `open_emergency_video_dispatch`
- `open_security_video_dispatch`
- `set_question`
- `run_analysis`

## 5. 知识图谱实现

当前实现为前端派生图谱：

- 输入：风险对象、行业单位、警情、检查记录、安保任务、安保力量、行政区、图层。
- 输出：`KnowledgeGraphSnapshot`。
- 渲染：ECharts graph force layout。
- 节点密度：连接数、风险等级、状态、证据数量综合计算。
- 边权重：同区域、同行业、同信号、同来源和业务强关系综合计算。

实体项目演进：

- 第一阶段：保持前端派生图谱，作为原型和业务验证。
- 第二阶段：后端生成图谱快照，前端只消费 API。
- 第三阶段：引入 Neo4j 或图计算服务，支持深度路径查询、社区发现和影响传播分析。

建议 API：

- `GET /api/knowledge-graph/snapshot`
- `GET /api/knowledge-graph/node/{id}`
- `GET /api/knowledge-graph/path?source=&target=`
- `POST /api/knowledge-graph/query`

## 6. GIS 与地图实现

当前实现：

- 区级边界：本地 GeoJSON。
- 街镇边界：本地 `shanghai-street-towns.json`。
- Three.js 负责三维行政区、街镇分区、对象标牌、风险光柱、安保圈。

实体项目建议：

- 使用 PostGIS 存储行政区、街镇、网格、建筑物、重点单位、消防水源、消防站点。
- 通过后端 GIS API 输出 GeoJSON、MVT 或矢量瓦片。
- 安保圈应使用真实 GIS buffer 计算，而不是视觉圆环近似。
- 地图坐标应统一采用 WGS84/GCJ02/CGCS2000 转换规则。

## 7. 数据接入与落地

建议数据分层：

- ODS：原始系统接入层。
- DWD：清洗后的明细层。
- DWS：专题汇总层。
- ADS：大屏服务层。
- KG：知识图谱关系层。
- Vector：RAG 知识向量层。

数据接入方式：

- 数据库同步。
- API 拉取。
- 消息队列订阅。
- 文件批量导入。
- 视频/图传平台 SDK。
- 物联平台 MQTT/HTTP 推送。

数据质量要求：

- 每条数据必须有来源系统。
- 每条关键业务数据必须有更新时间。
- 重点单位、警情、隐患、检查、力量必须可追溯。
- 低可信度数据应在界面和 AI 上下文中标记。

## 8. 部署方案

原型本地运行：

```bash
npm install
npm run dev
```

Ollama：

```bash
ollama serve
ollama list
```

Docker 预留：

```bash
docker compose up -d
```

实体项目建议部署：

- 前端：Nginx 静态部署。
- API：容器化部署，多实例。
- 数据库：PostgreSQL/PostGIS 主从或高可用。
- 向量库：pgvector 或独立向量服务。
- 图数据库：Neo4j 可选。
- 模型服务：Ollama、vLLM 或国产模型推理服务。
- 视频服务：专网部署，按安全要求隔离。
- 日志监控：Prometheus、Grafana、ELK 或政务云统一监控。

## 9. 安全与权限

实体项目必须补充：

- 用户认证：统一身份认证或政务单点登录。
- 权限模型：市、区、街镇、支队、大队、专班、管理员分级授权。
- 数据脱敏：人员、联系方式、视频、单位敏感信息按权限展示。
- 操作审计：查询、调度、AI 工具调用、配置修改均应留痕。
- 网络安全：内外网隔离、接口签名、访问白名单、日志审计。
- AI 安全：限制工具调用白名单，禁止模型执行任意代码或越权操作。

## 10. 验收与测试

基础验证：

```bash
npm run build
npm run lint
```

页面验收：

- `16:9`、`32:9` 均无文字溢出和模块重叠。
- 总览、行政区、行业、应急、安保、知识图谱均可进入。
- 地图缩放、对象点击、图层开关、滚动轴点击可联动。
- AI 研判能读取当前模块与对象。

实体项目测试：

- 接口测试。
- 数据质量测试。
- GIS 精度测试。
- 视频调度联调。
- 大模型问答准确性测试。
- 工具调用安全测试。
- 多屏分辨率兼容测试。
- 高并发和长时间运行稳定性测试。

