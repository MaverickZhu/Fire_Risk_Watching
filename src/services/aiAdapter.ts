import type { AIAnalysisRequest, AIAnalysisResult } from '../types'
import { knowledgeSnippets } from '../data/mockData'

const aiApiBase = import.meta.env.VITE_AI_API_BASE || 'http://127.0.0.1:8787'

export async function askAI(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
  try {
    const response = await fetch(`${aiApiBase}/api/ai/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`AI proxy returned ${response.status}`)
    }

    return normalizeAIResult(await response.json())
  } catch (error) {
    console.warn('AI proxy unavailable, using mock fallback.', error)
    return mockAI(request)
  }
}

export async function checkAIHealth() {
  try {
    const response = await fetch(`${aiApiBase}/api/ai/health`)
    if (!response.ok) return { ok: false, model: 'qwen3.6:35b-a3b-q8_0' }
    return await response.json() as { ok: boolean; model: string; ollama?: string }
  } catch {
    return { ok: false, model: 'qwen3.6:35b-a3b-q8_0' }
  }
}

function normalizeAIResult(value: unknown): AIAnalysisResult {
  const result = value && typeof value === 'object' ? value as Partial<AIAnalysisResult> : {}

  return {
    summary: result.summary || '已完成当前态势综合研判。',
    riskDrivers: Array.isArray(result.riskDrivers) ? result.riskDrivers : [],
    evidence: Array.isArray(result.evidence) ? result.evidence : [],
    recommendedActions: Array.isArray(result.recommendedActions) ? result.recommendedActions : [],
    similarCases: Array.isArray(result.similarCases) ? result.similarCases : [],
    confidence: typeof result.confidence === 'number' && Number.isFinite(result.confidence) ? result.confidence : 0.72,
    toolCalls: Array.isArray(result.toolCalls) ? result.toolCalls : [],
    toolTrace: Array.isArray(result.toolTrace) ? result.toolTrace : [],
    followUpQuestions: Array.isArray(result.followUpQuestions) ? result.followUpQuestions : [],
    moduleDecision: result.moduleDecision || '',
    source: result.source || 'ollama',
  }
}

async function mockAI(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
  const criticalCount = request.riskObjects.filter((item) => item.riskLevel === 'critical').length
  const highCount = request.riskObjects.filter((item) => item.riskLevel === 'high').length
  const activeSignals = [...new Set(request.riskObjects.flatMap((item) => item.signals))].slice(0, 6)
  const region = request.selectedRegion || '全市'
  const question = request.question.trim()

  await delay(360)

  return {
    summary: `${region}当前叠加${criticalCount}个极高风险对象、${highCount}个高风险对象。${question ? `围绕“${question}”，` : ''}建议优先核查多点异常、设施离线、整改逾期和处置资源覆盖短板。`,
    riskDrivers: activeSignals.length ? activeSignals : ['物联设备离线', '同区域重复告警', '整改闭环滞后'],
    evidence: searchKnowledge(question || region).slice(0, 3),
    recommendedActions: [
      '向属地街镇和行业主管部门推送核查任务，要求30分钟内反馈首轮结果。',
      '对极高风险对象叠加消防站点、水源和微型消防站覆盖圈，复核最短响应路径。',
      '对重复隐患建立复查单，关联责任主体、整改期限和历史处置记录。',
    ],
    similarCases: ['高层建筑消防设施离线综合研判样本', '厂房仓库片区多点告警闭环样本', '医疗机构夜间巡查能力修正样本'],
    confidence: Math.min(0.96, 0.72 + request.riskObjects.length * 0.018),
    toolCalls: [],
    toolTrace: [{ name: 'ai_proxy', status: 'failed', message: '本地 Ollama 代理不可用，已启用 mock 降级。' }],
    followUpQuestions: ['是否需要按当前模块继续生成处置清单？'],
    moduleDecision: '降级研判',
    source: 'mock',
  }
}

export function searchKnowledge(query: string): string[] {
  const normalized = query.trim()

  if (!normalized) {
    return knowledgeSnippets
  }

  const matched = knowledgeSnippets.filter((item) =>
    [...normalized].some((char) => item.includes(char)),
  )

  return matched.length ? matched : knowledgeSnippets
}

export async function startVoiceInput(): Promise<string> {
  await delay(520)
  return '请分析浦东新区高层建筑、厂库房和新能源充电场站的叠加风险'
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
