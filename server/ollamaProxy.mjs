import http from 'node:http'

const PORT = Number(process.env.AI_PROXY_PORT || 8787)
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.6:35b-a3b-q8_0'

const responseShape = {
  summary: 'string',
  riskDrivers: ['string'],
  evidence: ['string'],
  recommendedActions: ['string'],
  similarCases: ['string'],
  confidence: 'number from 0 to 1',
  toolCalls: [{ name: 'tool_name', arguments: {}, reason: 'string' }],
  followUpQuestions: ['string'],
  moduleDecision: 'string',
}

const systemPrompt = `你是上海消防风险监测预警平台的专业辅助决策模型。
你需要基于用户当前大屏模块、选中对象、图层状态、筛选条件和原型数据，输出消防风险监测、监督检查、灭火准备、应急处置、安保勤务相关的专业研判。

必须遵守：
1. 只输出严格 JSON，不输出 Markdown，不输出解释性前后缀。
2. JSON 字段必须兼容这个结构：${JSON.stringify(responseShape)}。
3. toolCalls 只能使用请求中 availableTools 里的工具名。
4. 工具参数必须来自请求中的 uiState、riskObjects、selectedObject 或用户问题，不能臆造真实业务数据。
5. 如果需要操控界面，可输出 toolCalls；如果只需要研判，toolCalls 为空数组。
6. 对应模块重点：
- 总览：全市态势、重点区排名、极高/高风险对象、跨模块联动。
- 行政区专题：区/街镇风险、对象分布、监督检查、防火巡查。
- 行业专题：行业单位画像、行业风险因子、同类对象对比。
- 应急处置：当前警情、单位画像、历史检查记录、力量调度建议。
- 安保模式：任务类型、安保圈、力量覆盖、视频调度与现场图传。`

const server = http.createServer(async (req, res) => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    if (req.method === 'GET' && req.url === '/api/ai/health') {
      await handleHealth(res)
      return
    }

    if (req.method === 'POST' && req.url === '/api/ai/analyze') {
      await handleAnalyze(req, res)
      return
    }

    writeJson(res, 404, { error: 'Not found' })
  } catch (error) {
    writeJson(res, 500, {
      error: 'AI proxy failed',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`AI proxy listening on http://127.0.0.1:${PORT}`)
  console.log(`Ollama target ${OLLAMA_BASE_URL}, model ${OLLAMA_MODEL}`)
})

async function handleHealth(res) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
  if (!response.ok) {
    writeJson(res, 502, { ok: false, model: OLLAMA_MODEL, error: `Ollama returned ${response.status}` })
    return
  }
  const data = await response.json()
  const models = Array.isArray(data.models) ? data.models.map((item) => item.name) : []
  writeJson(res, 200, {
    ok: models.includes(OLLAMA_MODEL),
    model: OLLAMA_MODEL,
    models,
    ollama: OLLAMA_BASE_URL,
  })
}

async function handleAnalyze(req, res) {
  const request = await readJson(req)
  const payload = trimContext(request)
  const raw = await chat(payload)
  const parsed = parseModelJson(raw)

  if (!parsed) {
    const repaired = await chat({
      ...payload,
      question: `请把以下内容修复为严格 JSON，字段必须符合指定结构，不要输出其他文本：${raw.slice(0, 6000)}`,
    })
    const repairedJson = parseModelJson(repaired)
    if (repairedJson) {
      writeJson(res, 200, normalizeResult(repairedJson))
      return
    }
    writeJson(res, 200, fallbackFromRequest(request, '模型返回无法解析，已使用代理降级研判。'))
    return
  }

  writeJson(res, 200, normalizeResult(parsed))
}

async function chat(request) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.2,
        num_ctx: 8192,
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(request) },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`)
  }

  const data = await response.json()
  return String(data.message?.content || '')
}

function trimContext(request) {
  return {
    selectedRegion: request.selectedRegion,
    activeLayers: request.activeLayers,
    timeRange: request.timeRange,
    question: request.question,
    inputMode: request.inputMode,
    stage: request.stage,
    operation: request.operation,
    selectedObject: request.selectedObject,
    uiState: request.uiState,
    availableTools: request.availableTools,
    conversationHistory: Array.isArray(request.conversationHistory) ? request.conversationHistory.slice(-6) : [],
    riskObjects: Array.isArray(request.riskObjects)
      ? request.riskObjects.slice(0, 80).map((item) => ({
        id: item.id,
        name: item.name,
        district: item.district,
        street: item.street,
        industry: item.industry,
        objectType: item.objectType,
        riskLevel: item.riskLevel,
        signals: item.signals,
        status: item.status,
        updatedAt: item.updatedAt,
      }))
      : [],
  }
}

function parseModelJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function normalizeResult(value) {
  const result = value && typeof value === 'object' ? value : {}
  return {
    summary: stringOr(result.summary, '已完成当前态势综合研判。'),
    riskDrivers: stringArray(result.riskDrivers),
    evidence: stringArray(result.evidence),
    recommendedActions: stringArray(result.recommendedActions),
    similarCases: stringArray(result.similarCases),
    confidence: clamp(Number(result.confidence || 0.78), 0, 1),
    toolCalls: Array.isArray(result.toolCalls) ? result.toolCalls : [],
    toolTrace: Array.isArray(result.toolTrace) ? result.toolTrace : [],
    followUpQuestions: stringArray(result.followUpQuestions),
    moduleDecision: stringOr(result.moduleDecision, ''),
    source: 'ollama',
  }
}

function fallbackFromRequest(request, reason) {
  const riskObjects = Array.isArray(request.riskObjects) ? request.riskObjects : []
  const critical = riskObjects.filter((item) => item.riskLevel === 'critical').length
  const high = riskObjects.filter((item) => item.riskLevel === 'high').length
  return {
    summary: `${request.selectedRegion || '当前范围'}发现${critical}个极高风险、${high}个高风险对象。${reason}`,
    riskDrivers: ['重点对象风险叠加', '图层态势需要复核', '模型响应已降级'],
    evidence: ['本地代理已接收当前模块状态和对象数据。'],
    recommendedActions: ['复核当前选中对象和图层范围。', '确认 Ollama 服务与模型可用后重新研判。'],
    similarCases: [],
    confidence: 0.62,
    toolCalls: [],
    toolTrace: [{ name: 'ollama_proxy', status: 'failed', message: reason }],
    followUpQuestions: [],
    moduleDecision: '降级研判',
    source: 'fallback',
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 4_000_000) {
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function writeJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).slice(0, 8) : []
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
