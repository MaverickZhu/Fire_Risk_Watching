import { useEffect, useMemo, useState } from 'react'
import { DndContext, useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  Activity,
  AlertTriangle,
  AudioLines,
  Bot,
  Boxes,
  CalendarClock,
  ChevronDown,
  Database,
  Flame,
  History,
  Layers,
  MapPinned,
  Mic,
  PanelLeft,
  PhoneCall,
  Plus,
  RadioTower,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Sparkles,
  Video,
} from 'lucide-react'
import './App.css'
import { ThreeRiskMap } from './components/ThreeRiskMap'
import { TrendChart } from './components/TrendChart'
import { askAI, checkAIHealth, startVoiceInput } from './services/aiAdapter'
import { emergencyIncidents, fireInspectionRecords } from './data/emergencyIncidents'
import { industryProfiles, knownIndustryUnits } from './data/knownIndustryUnits'
import { districtShapes, layerDefinitions, moduleCards, riskObjects } from './data/mockData'
import { defaultSecurityLayerState, securityForcePoints, securityTasks } from './data/securityTasks'
import type {
  AIAnalysisResult,
  AIConversationMessage,
  AIToolCall,
  AIToolTrace,
  EmergencyIncident,
  EmergencyTimePreset,
  FireInspectionRecord,
  IndustryScope,
  IndustrySelection,
  LayerDefinition,
  ModuleCard,
  RiskLevel,
  RiskObject,
  SecurityForcePoint,
  SecurityForceType,
  SecurityLayerState,
  SecurityTask,
  StageTab,
} from './types'

type AspectMode = '16:9' | '32:9'
const stageTabs: StageTab[] = ['总览', '行政区专题', '行业专题', '应急处置', '安保模式']

const levelLabel: Record<RiskLevel, string> = {
  medium: '中',
  high: '高',
  critical: '极高',
}

const currentEmergencyStatuses = new Set(['接警', '出动', '到场', '处置中', '控制'])
const latestCurrentIncident = getLatestIncident(emergencyIncidents.filter((incident) => currentEmergencyStatuses.has(incident.status))) || emergencyIncidents[0]

const securityLayerLabels: Record<keyof SecurityLayerState, string> = {
  fireStations: '消防站点',
  mobileStations: '前置流动站',
  gridPatrols: '网格巡查力量',
  eventForces: '活动驻防力量',
  riskObjects: '社会面风险对象',
  securityRings: '500/1000米安保圈',
}

const securityForceLabels: Record<SecurityForceType, string> = {
  'fire-station': '消防站点',
  'mobile-forward-station': '前置流动站',
  'grid-patrol': '网格巡查力量',
  'event-standby-force': '活动驻防力量',
}

const aiToolNames = [
  'switch_stage',
  'select_district',
  'reset_overview',
  'select_industry',
  'select_industry_district',
  'select_industry_unit',
  'select_incident',
  'set_incident_time_preset',
  'select_security_task',
  'select_security_force',
  'toggle_layer',
  'toggle_security_layer',
  'open_emergency_video_dispatch',
  'open_security_video_dispatch',
  'set_question',
  'run_analysis',
]

function App() {
  const [aspectMode, setAspectMode] = useState<AspectMode>('16:9')
  const [selectedDistrict, setSelectedDistrict] = useState('浦东新区')
  const [overviewDistrict, setOverviewDistrict] = useState('')
  const [layers, setLayers] = useState<LayerDefinition[]>(layerDefinitions)
  const [cards, setCards] = useState<ModuleCard[]>(moduleCards)
  const [question, setQuestion] = useState('请综合分析当前高层建筑、厂库房、医疗机构和新能源场站的叠加风险')
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiHealth, setAiHealth] = useState<{ ok: boolean; model: string }>({ ok: false, model: 'qwen3.6:35b-a3b-q8_0' })
  const [conversationHistory, setConversationHistory] = useState<AIConversationMessage[]>([])
  const [lastUserOperation, setLastUserOperation] = useState('页面初始化')
  const [selectedObject, setSelectedObject] = useState<RiskObject | null>(riskObjects[0])
  const [activeStage, setActiveStage] = useState<StageTab>('总览')
  const [selectedIndustry, setSelectedIndustry] = useState<IndustrySelection>('全部行业')
  const [industryScope, setIndustryScope] = useState<IndustryScope>('city')
  const [selectedIndustryDistrict, setSelectedIndustryDistrict] = useState('')
  const [selectedIndustryUnit, setSelectedIndustryUnit] = useState<RiskObject | null>(null)
  const [selectedIncident, setSelectedIncident] = useState<EmergencyIncident>(latestCurrentIncident)
  const [incidentQuery, setIncidentQuery] = useState('')
  const [incidentPreset, setIncidentPreset] = useState<EmergencyTimePreset>('1月内')
  const [incidentStartDate, setIncidentStartDate] = useState('2026-05-01')
  const [incidentEndDate, setIncidentEndDate] = useState('2026-05-18')
  const [emergencyVideoIds, setEmergencyVideoIds] = useState<string[]>(() => defaultEmergencyVideoIds(latestCurrentIncident))
  const [emergencyVideoOpen, setEmergencyVideoOpen] = useState(false)
  const [emergencyVideoDispatched, setEmergencyVideoDispatched] = useState(false)
  const [emergencyVideoEnlargedId, setEmergencyVideoEnlargedId] = useState('')
  const [selectedSecurityTaskId, setSelectedSecurityTaskId] = useState(securityTasks[0].id)
  const [securityForces, setSecurityForces] = useState<SecurityForcePoint[]>(securityForcePoints)
  const [selectedSecurityForceId, setSelectedSecurityForceId] = useState(securityForcePoints[1].id)
  const [securityLayers, setSecurityLayers] = useState<SecurityLayerState>(defaultSecurityLayerState)
  const [securityVideoForceIds, setSecurityVideoForceIds] = useState<string[]>([securityForcePoints[1].id, securityForcePoints[2].id, securityForcePoints[3].id])
  const [securityVideoDispatched, setSecurityVideoDispatched] = useState(false)
  const [securityVideoOpen, setSecurityVideoOpen] = useState(false)

  const visibleLayers = layers.filter((layer) => layer.visible)
  const isOverviewStage = activeStage === '总览'
  const isIndustryStage = activeStage === '行业专题'
  const isEmergencyStage = activeStage === '应急处置'
  const isSecurityStage = activeStage === '安保模式'
  const industryFilteredUnits = useMemo(() => {
    return selectedIndustry === '全部行业'
      ? knownIndustryUnits
      : knownIndustryUnits.filter((item) => item.industry === selectedIndustry)
  }, [selectedIndustry])
  const industryMapObjects = useMemo(() => {
    if (industryScope === 'city') {
      return industryFilteredUnits
    }

    const district = selectedIndustryUnit?.district || selectedIndustryDistrict || selectedDistrict
    return industryFilteredUnits.filter((item) => item.district === district)
  }, [industryFilteredUnits, industryScope, selectedDistrict, selectedIndustryDistrict, selectedIndustryUnit])
  const regionObjects = useMemo(() => {
    const visibleIndustries = new Set(visibleLayers.flatMap((layer) => layer.filters.industries))
    return riskObjects.filter((item) => {
      const region = isOverviewStage ? overviewDistrict : selectedDistrict
      const regionMatched = region ? item.district === region : true
      return regionMatched && visibleIndustries.has(item.industry)
    })
  }, [isOverviewStage, overviewDistrict, selectedDistrict, visibleLayers])
  const filteredIncidents = useMemo(() => {
    return sortIncidentsByTimeDesc(emergencyIncidents.filter((incident) => {
      const queryMatched = incidentQuery.trim()
        ? `${incident.title}${incident.alarmNo}${incident.unit.name}${incident.district}${incident.incidentType}`
          .toLowerCase()
          .includes(incidentQuery.trim().toLowerCase())
        : true
      return queryMatched && matchIncidentTime(incident, incidentPreset, incidentStartDate, incidentEndDate)
    }))
  }, [incidentEndDate, incidentPreset, incidentQuery, incidentStartDate])
  const currentIncidents = useMemo(() => {
    return sortIncidentsByTimeDesc(emergencyIncidents.filter((incident) => currentEmergencyStatuses.has(incident.status)))
  }, [])
  const emergencyMapObjects = useMemo(() => {
    return [incidentToRiskObject(selectedIncident)]
  }, [selectedIncident])
  const emergencyStationVideos = useMemo(() => createEmergencyStationVideos(selectedIncident), [selectedIncident])
  const emergencyActiveVideos = emergencyStationVideos.filter((video) => emergencyVideoIds.includes(video.id)).slice(0, 9)
  const selectedIncidentInspections = useMemo(() => {
    return fireInspectionRecords.filter((record) => record.unitId === selectedIncident.unit.id)
  }, [selectedIncident])
  const selectedSecurityTask = securityTasks.find((task) => task.id === selectedSecurityTaskId) || securityTasks[0]
  const taskSecurityForces = useMemo(() => {
    return securityForces.filter((force) => {
      if (force.taskId === selectedSecurityTask.id) return true
      return selectedSecurityTask.taskType === 'event-ring' && force.taskId === 'sec-city-holiday' && force.forceType === 'fire-station'
    })
  }, [securityForces, selectedSecurityTask])
  const visibleSecurityForces = useMemo(() => {
    return taskSecurityForces.filter((force) => securityForceVisible(force, securityLayers))
  }, [securityLayers, taskSecurityForces])
  const selectedSecurityForce = visibleSecurityForces.find((force) => force.id === selectedSecurityForceId)
    || taskSecurityForces.find((force) => force.id === selectedSecurityForceId)
    || taskSecurityForces[0]
  const securityVideoForces = taskSecurityForces.filter((force) => securityVideoForceIds.includes(force.id)).slice(0, 9)
  const securityRiskObjects = useMemo(() => {
    if (!securityLayers.riskObjects) return []
    if (selectedSecurityTask.taskType === 'citywide') return riskObjects
    return riskObjects.filter((object) => {
      const distance = approximateDistanceMeters(selectedSecurityTask.center, object.location)
      return distance <= 2400 || object.district === selectedSecurityTask.district
    })
  }, [securityLayers.riskObjects, selectedSecurityTask])
  const securityMapObjects = useMemo(() => {
    return [
      ...visibleSecurityForces.map(securityForceToRiskObject),
      ...securityRiskObjects.map((object) => ({ ...object, id: `security-risk-${object.id}` })),
    ]
  }, [securityRiskObjects, visibleSecurityForces])

  const activeOverviewDistrict = districtShapes.find((item) => item.name === overviewDistrict)
  const cityRiskScore = calculateCityRiskScore()
  const overviewTitle = overviewDistrict || '全市'
  const overviewScore = activeOverviewDistrict?.riskScore || cityRiskScore
  const criticalCount = riskObjects.filter((item) => item.riskLevel === 'critical').length
  const highCount = riskObjects.filter((item) => item.riskLevel === 'high').length
  const processingCount = riskObjects.filter((item) => item.status === '处置中').length
  const activeObjects = isSecurityStage ? securityMapObjects : isEmergencyStage ? emergencyMapObjects : isIndustryStage ? industryMapObjects : regionObjects
  const mapObjects = isSecurityStage ? securityMapObjects : isEmergencyStage ? emergencyMapObjects : isIndustryStage ? industryMapObjects : riskObjects

  useEffect(() => {
    void checkAIHealth().then((health) => setAiHealth({ ok: Boolean(health.ok), model: health.model || 'qwen3.6:35b-a3b-q8_0' }))
  }, [])

  const runAI = async (
    inputMode: 'text' | 'voice' | 'region-click' | 'object-click',
    prompt = question,
    operation = lastUserOperation,
    executeTools = true,
  ) => {
    setAiLoading(true)
    const result = await askAI({
      selectedRegion: isOverviewStage
        ? overviewDistrict || '全市'
        : isSecurityStage
          ? selectedSecurityTask.venueName
        : isIndustryStage
          ? selectedIndustryDistrict || selectedDistrict
          : selectedDistrict,
      activeLayers: visibleLayers.map((layer) => layer.id),
      riskObjects: activeObjects.length ? activeObjects : riskObjects,
      timeRange: '今日',
      question: prompt,
      inputMode,
      stage: activeStage,
      operation,
      selectedObject: isEmergencyStage ? selectedIncident.unit : isIndustryStage ? selectedIndustryUnit : selectedObject,
      uiState: {
        aspectMode,
        activeStage,
        selectedDistrict,
        overviewDistrict,
        selectedIndustry,
        industryScope,
        selectedIndustryDistrict,
        selectedIndustryUnitId: selectedIndustryUnit?.id,
        selectedIncidentId: selectedIncident.id,
        incidentPreset,
        incidentQuery,
        selectedSecurityTaskId,
        selectedSecurityForceId: selectedSecurityForce?.id,
        visibleLayers: layers.filter((layer) => layer.visible).map((layer) => ({ id: layer.id, name: layer.name })),
        securityLayers,
        emergencyVideoOpen,
        securityVideoOpen,
        candidateDistricts: districtShapes.map((district) => district.name),
        candidateIndustries: ['全部行业', ...industryProfiles.map((profile) => profile.industry)],
        candidateIncidents: emergencyIncidents.map((incident) => ({ id: incident.id, alarmNo: incident.alarmNo, title: incident.title, unit: incident.unit.name })),
        candidateSecurityTasks: securityTasks.map((task) => ({ id: task.id, name: task.name, venueName: task.venueName })),
      },
      availableTools: aiToolNames,
      conversationHistory,
    })
    const trace = executeTools ? executeAIToolCalls(result.toolCalls || []) : []
    const mergedResult = {
      ...result,
      toolTrace: [...(result.toolTrace || []), ...trace],
    }
    setAiResult(mergedResult)
    setConversationHistory((current) => [
      ...current.slice(-8),
      { role: 'user', content: prompt, at: new Date().toLocaleTimeString() },
      { role: 'assistant', content: mergedResult.summary, at: new Date().toLocaleTimeString() },
    ])
    setAiLoading(false)
    setLastUserOperation(operation)

    if (trace.some((item) => item.name === 'run_analysis' && item.status === 'executed') && executeTools) {
      window.setTimeout(() => void runAI('text', prompt, 'AI工具执行后自动复核', false), 0)
    }
  }

  const handleVoice = async () => {
    setAiLoading(true)
    const prompt = await startVoiceInput()
    setQuestion(prompt)
    setAiLoading(false)
    await runAI('voice', prompt, '语音输入启动研判')
  }

  const executeAIToolCalls = (toolCalls: AIToolCall[]): AIToolTrace[] => {
    return toolCalls.map((toolCall) => {
      const args = toolCall.arguments || {}
      const toolName = toolCall.name

      if (!aiToolNames.includes(toolName)) {
        return { name: toolName, status: 'skipped', message: '未知工具，已忽略。' }
      }

      try {
        if (toolName === 'switch_stage') {
          const stage = stringArg(args, 'stage')
          if (!isStageTab(stage)) return skipped(toolName, '专题名称不存在。')
          setActiveStage(stage)
          if (stage === '总览') setOverviewDistrict('')
          if (stage === '行业专题') setIndustryScope('city')
          if (stage === '应急处置') {
            setSelectedIncident(latestCurrentIncident)
            setSelectedDistrict(latestCurrentIncident.district)
            setSelectedObject(incidentToRiskObject(latestCurrentIncident))
          }
          if (stage === '安保模式') setSelectedDistrict(selectedSecurityTask.district === '全市' ? '' : selectedSecurityTask.district)
          return executed(toolName, `已切换至${stage}。`)
        }

        if (toolName === 'select_district') {
          const district = stringArg(args, 'district')
          if (!districtShapes.some((item) => item.name === district)) return skipped(toolName, '行政区不存在。')
          setSelectedDistrict(district)
          if (activeStage === '总览') {
            setOverviewDistrict(district)
          } else {
            setActiveStage('行政区专题')
          }
          return executed(toolName, `已选中${district}。`)
        }

        if (toolName === 'reset_overview') {
          setActiveStage('总览')
          setOverviewDistrict('')
          return executed(toolName, '已回到全市总览。')
        }

        if (toolName === 'select_industry') {
          const industry = stringArg(args, 'industry')
          if (!isIndustrySelection(industry)) return skipped(toolName, '行业不存在。')
          setSelectedIndustry(industry)
          setIndustryScope('city')
          setSelectedIndustryDistrict('')
          setSelectedIndustryUnit(null)
          setActiveStage('行业专题')
          return executed(toolName, `已切换行业专题：${industry}。`)
        }

        if (toolName === 'select_industry_district') {
          const district = stringArg(args, 'district')
          if (!districtShapes.some((item) => item.name === district)) return skipped(toolName, '行政区不存在。')
          setSelectedDistrict(district)
          setSelectedIndustryDistrict(district)
          setSelectedIndustryUnit(null)
          setIndustryScope('district')
          setActiveStage('行业专题')
          return executed(toolName, `已进入${district}行业详情。`)
        }

        if (toolName === 'select_industry_unit') {
          const unitKey = stringArg(args, 'unitId') || stringArg(args, 'id') || stringArg(args, 'name')
          const unit = knownIndustryUnits.find((item) => item.id === unitKey || item.name.includes(unitKey) || unitKey.includes(item.name))
          if (!unit) return skipped(toolName, '行业单位不存在。')
          setSelectedObject(unit)
          setSelectedIndustryUnit(unit)
          setSelectedIndustry(unit.industry)
          setSelectedIndustryDistrict(unit.district)
          setSelectedDistrict(unit.district)
          setIndustryScope('unit')
          setActiveStage('行业专题')
          return executed(toolName, `已选中行业单位：${unit.name}。`)
        }

        if (toolName === 'select_incident') {
          const incidentKey = stringArg(args, 'incidentId') || stringArg(args, 'id') || stringArg(args, 'alarmNo') || stringArg(args, 'name')
          const incident = args.latest
            ? latestCurrentIncident
            : emergencyIncidents.find((item) => item.id === incidentKey || item.alarmNo === incidentKey || item.title.includes(incidentKey) || item.unit.name.includes(incidentKey))
          if (!incident) return skipped(toolName, '警情不存在。')
          setSelectedIncident(incident)
          setSelectedDistrict(incident.district)
          setSelectedObject(incidentToRiskObject(incident))
          setEmergencyVideoIds(defaultEmergencyVideoIds(incident))
          setEmergencyVideoOpen(false)
          setEmergencyVideoDispatched(false)
          setEmergencyVideoEnlargedId('')
          setActiveStage('应急处置')
          return executed(toolName, `已选中警情：${incident.unit.name}。`)
        }

        if (toolName === 'set_incident_time_preset') {
          const preset = stringArg(args, 'preset')
          if (!isEmergencyTimePreset(preset)) return skipped(toolName, '时间范围不存在。')
          setIncidentPreset(preset)
          setActiveStage('应急处置')
          return executed(toolName, `已设置警情时间范围：${preset}。`)
        }

        if (toolName === 'select_security_task') {
          const taskKey = stringArg(args, 'taskId') || stringArg(args, 'id') || stringArg(args, 'name')
          const task = securityTasks.find((item) => item.id === taskKey || item.name.includes(taskKey) || item.venueName.includes(taskKey))
          if (!task) return skipped(toolName, '安保任务不存在。')
          setSelectedSecurityTaskId(task.id)
          setSelectedDistrict(task.district === '全市' ? '' : task.district)
          setSelectedSecurityForceId(securityForces.find((force) => force.taskId === task.id)?.id || selectedSecurityForceId)
          setActiveStage('安保模式')
          return executed(toolName, `已进入安保任务：${task.name}。`)
        }

        if (toolName === 'select_security_force') {
          const forceKey = stringArg(args, 'forceId') || stringArg(args, 'id') || stringArg(args, 'name')
          const force = securityForces.find((item) => item.id === forceKey || item.name.includes(forceKey))
          if (!force) return skipped(toolName, '安保力量不存在。')
          setSelectedSecurityForceId(force.id)
          setActiveStage('安保模式')
          return executed(toolName, `已选中安保力量：${force.name}。`)
        }

        if (toolName === 'toggle_layer') {
          const layerKey = stringArg(args, 'layerId') || stringArg(args, 'id') || stringArg(args, 'name')
          const layer = layers.find((item) => item.id === layerKey || item.name.includes(layerKey))
          if (!layer) return skipped(toolName, '图层不存在。')
          setLayers((current) => current.map((item) => (item.id === layer.id ? { ...item, visible: !item.visible } : item)))
          return executed(toolName, `已切换图层：${layer.name}。`)
        }

        if (toolName === 'toggle_security_layer') {
          const layerKey = stringArg(args, 'layerId') || stringArg(args, 'id') || stringArg(args, 'name')
          const entry = Object.entries(securityLayerLabels).find(([id, label]) => id === layerKey || label.includes(layerKey))
          if (!entry) return skipped(toolName, '安保图层不存在。')
          setSecurityLayers((current) => ({ ...current, [entry[0]]: !current[entry[0] as keyof SecurityLayerState] }))
          setActiveStage('安保模式')
          return executed(toolName, `已切换安保图层：${entry[1]}。`)
        }

        if (toolName === 'open_emergency_video_dispatch') {
          setActiveStage('应急处置')
          setEmergencyVideoOpen(true)
          setEmergencyVideoDispatched(true)
          return executed(toolName, '已打开当前警情视频调度。')
        }

        if (toolName === 'open_security_video_dispatch') {
          setActiveStage('安保模式')
          setSecurityVideoOpen(true)
          setSecurityVideoDispatched(true)
          return executed(toolName, '已打开安保视频调度。')
        }

        if (toolName === 'set_question') {
          const nextQuestion = stringArg(args, 'question')
          if (!nextQuestion) return skipped(toolName, '问题为空。')
          setQuestion(nextQuestion)
          return executed(toolName, `已更新问题：${nextQuestion}`)
        }

        if (toolName === 'run_analysis') {
          return executed(toolName, '已触发工具执行后的自动复核。')
        }

        return skipped(toolName, '工具未实现。')
      } catch (error) {
        return { name: toolName, status: 'failed', message: error instanceof Error ? error.message : String(error) }
      }
    })
  }

  const handleStageSelect = (tab: StageTab) => {
    setActiveStage(tab)
    if (tab === '总览') {
      setOverviewDistrict('')
      setQuestion('请综合分析上海市全市消防风险态势和重点区域变化')
    }
    if (tab === '行业专题') {
      setIndustryScope('city')
      setSelectedIndustryDistrict('')
      setSelectedIndustryUnit(null)
      setQuestion(`请分析上海市${selectedIndustry === '全部行业' ? '重点行业' : selectedIndustry}消防风险态势`)
    }
    if (tab === '应急处置') {
      setSelectedIncident(latestCurrentIncident)
      setSelectedDistrict(latestCurrentIncident.district)
      setSelectedObject(incidentToRiskObject(latestCurrentIncident))
      setEmergencyVideoIds(defaultEmergencyVideoIds(latestCurrentIncident))
      setEmergencyVideoOpen(false)
      setEmergencyVideoDispatched(false)
      setEmergencyVideoEnlargedId('')
      setQuestion(`请结合智能接处警和隐患排查记录，研判${latestCurrentIncident.unit.name}当前警情处置重点`)
    }
    if (tab === '安保模式') {
      setSelectedDistrict(selectedSecurityTask.district === '全市' ? '' : selectedSecurityTask.district)
      setQuestion(`请研判${selectedSecurityTask.name}的消防力量覆盖、圈层风险和安保勤务重点`)
    }
  }

  const handleDistrictSelect = (district: string) => {
    if (activeStage === '总览') {
      const nextDistrict = overviewDistrict === district ? '' : district
      setOverviewDistrict(nextDistrict)
      setSelectedDistrict(district)
      setQuestion(nextDistrict ? `分析${nextDistrict}当前消防风险态势` : '请综合分析上海市全市消防风险态势和重点区域变化')
      window.setTimeout(
        () => void runAI('region-click', nextDistrict ? `分析${nextDistrict}当前消防风险态势` : '分析上海市全市消防风险态势'),
        0,
      )
      return
    }

    setSelectedDistrict(district)
    setActiveStage('行政区专题')
    window.setTimeout(() => void runAI('region-click', `分析${district}当前消防风险态势`), 0)
  }

  const resetOverview = () => {
    setOverviewDistrict('')
    setQuestion('请综合分析上海市全市消防风险态势和重点区域变化')
  }

  const handleIndustryDistrictSelect = (district: string) => {
    setSelectedDistrict(district)
    setSelectedIndustryDistrict(district)
    setSelectedIndustryUnit(null)
    setIndustryScope('district')
    setActiveStage('行业专题')
    window.setTimeout(
      () =>
        void runAI(
          'region-click',
          `分析${district}${selectedIndustry === '全部行业' ? '重点行业' : selectedIndustry}消防风险态势`,
        ),
      0,
    )
  }

  const handleEmergencyDistrictSelect = (district: string) => {
    const incident = getLatestIncident(currentIncidents.filter((item) => item.district === district))
      || getLatestIncident(filteredIncidents.filter((item) => item.district === district))
      || selectedIncident
    setSelectedDistrict(district)
    setSelectedIncident(incident)
    setSelectedObject(incidentToRiskObject(incident))
    setEmergencyVideoIds(defaultEmergencyVideoIds(incident))
    setEmergencyVideoOpen(false)
    setEmergencyVideoDispatched(false)
    setEmergencyVideoEnlargedId('')
    setActiveStage('应急处置')
  }

  const handleIncidentSelect = (incident: EmergencyIncident) => {
    setSelectedIncident(incident)
    setSelectedDistrict(incident.district)
    setSelectedObject(incidentToRiskObject(incident))
    setEmergencyVideoIds(defaultEmergencyVideoIds(incident))
    setEmergencyVideoOpen(false)
    setEmergencyVideoDispatched(false)
    setEmergencyVideoEnlargedId('')
    setActiveStage('应急处置')
  }

  const handleEmergencyVideoToggle = (videoId: string) => {
    setEmergencyVideoIds((current) => {
      if (current.includes(videoId)) {
        return current.filter((id) => id !== videoId)
      }
      return [videoId, ...current].slice(0, 9)
    })
    setEmergencyVideoDispatched(false)
    setEmergencyVideoEnlargedId('')
  }

  const handleEmergencyVideoDispatchOpen = () => {
    if (!emergencyVideoIds.length) {
      setEmergencyVideoIds(defaultEmergencyVideoIds(selectedIncident))
    }
    setEmergencyVideoOpen(true)
    setEmergencyVideoDispatched(true)
  }

  const handleSecurityTaskSelect = (taskId: string) => {
    const task = securityTasks.find((item) => item.id === taskId) || securityTasks[0]
    const firstForce = securityForces.find((force) => force.taskId === task.id)
      || securityForces.find((force) => force.taskId === 'sec-city-holiday')
    setSelectedSecurityTaskId(task.id)
    setSelectedDistrict(task.district === '全市' ? '' : task.district)
    if (firstForce) {
      setSelectedSecurityForceId(firstForce.id)
    }
    setSecurityVideoForceIds(securityForces.filter((force) => force.taskId === task.id).slice(0, 4).map((force) => force.id))
    setSecurityVideoDispatched(false)
    setSecurityVideoOpen(false)
    setActiveStage('安保模式')
    setQuestion(`请研判${task.name}的消防力量覆盖、圈层风险和安保勤务重点`)
  }

  const handleSecurityLayerToggle = (id: keyof SecurityLayerState) => {
    setSecurityLayers((current) => ({ ...current, [id]: !current[id] }))
  }

  const handleSecurityForceSelect = (forceId: string) => {
    setSelectedSecurityForceId(forceId)
    setActiveStage('安保模式')
  }

  const handleSecurityVideoToggle = (forceId: string) => {
    setSecurityVideoForceIds((current) => {
      if (current.includes(forceId)) {
        return current.filter((id) => id !== forceId)
      }
      return [...current, forceId].slice(0, 9)
    })
    setSecurityVideoDispatched(false)
  }

  const handleSecurityVideoDispatch = () => {
    if (!securityVideoForceIds.length && selectedSecurityForce) {
      setSecurityVideoForceIds([selectedSecurityForce.id])
    }
    setSecurityVideoDispatched(true)
  }

  const handleSecurityVideoOpen = () => {
    if (selectedSecurityForce && !securityVideoForceIds.includes(selectedSecurityForce.id)) {
      setSecurityVideoForceIds((current) => [selectedSecurityForce.id, ...current].slice(0, 9))
    }
    setSecurityVideoDispatched(false)
    setSecurityVideoOpen(true)
  }

  const handleSecurityForceChange = (forceId: string, patch: Partial<SecurityForcePoint>) => {
    setSecurityForces((current) => current.map((force) => (force.id === forceId ? { ...force, ...patch } : force)))
  }

  const handleAddSecurityForce = () => {
    const id = `sf-custom-${Date.now()}`
    const newForce: SecurityForcePoint = {
      id,
      taskId: selectedSecurityTask.id,
      name: `${selectedSecurityTask.taskType === 'citywide' ? '全市' : selectedSecurityTask.venueName}临时前置点`,
      forceType: 'mobile-forward-station',
      district: selectedSecurityTask.district === '全市' ? '黄浦区' : selectedSecurityTask.district,
      address: selectedSecurityTask.venueName,
      location: {
        lng: selectedSecurityTask.center.lng + 0.006,
        lat: selectedSecurityTask.center.lat + 0.004,
      },
      status: '待命',
      editable: true,
      personnel: 8,
      vehicles: 2,
      equipment: ['小型水罐车', '图传终端', '灭火器材包'],
      commander: '临时勤务指挥员',
      contactChannel: '沪消-临时-新增',
      coverageRadius: 600,
      liveFeed: {
        status: 'online',
        title: '新增前置点现场画面',
        snapshotTone: 'red',
      },
    }
    setSecurityForces((current) => [newForce, ...current])
    setSelectedSecurityForceId(id)
  }

  const handleObjectSelect = (object: RiskObject) => {
    if (activeStage === '安保模式' || object.id.startsWith('sf-')) {
      const forceId = object.id.startsWith('security-risk-') ? '' : object.id
      if (forceId) {
        setSelectedSecurityForceId(forceId)
      }
      setActiveStage('安保模式')
      return
    }

    if (activeStage === '应急处置' || object.id.startsWith('e-')) {
      const incident = emergencyIncidents.find((item) => item.id === object.id)
      if (incident) {
        setSelectedIncident(incident)
        setSelectedDistrict(incident.district)
        setSelectedObject(object)
        setActiveStage('应急处置')
        setQuestion(`研判${incident.unit.name}${incident.incidentType}处置态势，并结合历史消防检查记录提出指挥建议`)
        window.setTimeout(() => void runAI('object-click', `分析${incident.title}的处置态势、单位画像和历史隐患关联`), 0)
      }
      return
    }

    if (activeStage === '行业专题' || object.id.startsWith('u-')) {
      setSelectedObject(object)
      setSelectedIndustryUnit(object)
      setSelectedIndustry(object.industry)
      setSelectedIndustryDistrict(object.district)
      setSelectedDistrict(object.district)
      setIndustryScope('unit')
      setActiveStage('行业专题')
      window.setTimeout(() => void runAI('object-click', `分析${object.name}的行业风险画像、证据片段和处置建议`), 0)
      return
    }

    setSelectedObject(object)
    setSelectedDistrict(object.district)
    setActiveStage('行政区专题')
    window.setTimeout(() => void runAI('object-click', `分析${object.name}的风险触发因素和处置建议`), 0)
  }

  const handleTimelineAlertSelect = (object: RiskObject) => {
    if (object.id.startsWith('u-')) {
      handleObjectSelect(object)
      return
    }

    setSelectedObject(object)
    setSelectedDistrict(object.district)
    setQuestion(`定位并研判${object.name}当前重点隐患告警、处置状态和闭环建议`)

    if (activeStage === '总览') {
      setOverviewDistrict(object.district)
    } else if (activeStage === '行政区专题') {
      setSelectedDistrict(object.district)
    } else if (activeStage === '行业专题') {
      setSelectedIndustry(object.industry)
      setSelectedIndustryDistrict(object.district)
      setSelectedIndustryUnit(object)
      setIndustryScope('unit')
    }

    setLastUserOperation(`点击告警闭环时间轴：${object.name}`)
  }

  const handleIndustrySelect = (industry: IndustrySelection) => {
    setSelectedIndustry(industry)
    setIndustryScope('city')
    setSelectedIndustryDistrict('')
    setSelectedIndustryUnit(null)
    setActiveStage('行业专题')
    setQuestion(`请分析上海市${industry === '全部行业' ? '重点行业' : industry}消防风险态势`)
  }

  const toggleLayer = (id: string) => {
    setLayers((current) =>
      current.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)),
    )
  }

  const toggleCard = (id: string) => {
    setCards((current) =>
      current.map((card) => (card.id === id ? { ...card, collapsed: !card.collapsed } : card)),
    )
  }

  return (
    <DndContext>
      <main className={`dashboard aspect-${aspectMode.replace(':', '-')}`}>
        <Header
          aspectMode={aspectMode}
          setAspectMode={setAspectMode}
          criticalCount={criticalCount}
          highCount={highCount}
          processingCount={processingCount}
        />

        <section className="dashboard-grid">
          <aside className="panel-stack left-stack">
            <DraggableCard
              card={cards[0]}
              onToggle={toggleCard}
              titleOverride={isSecurityStage ? '安保任务概览' : undefined}
            >
              {isSecurityStage ? (
                <SecurityTaskPanel
                  task={selectedSecurityTask}
                  tasks={securityTasks}
                  forces={taskSecurityForces}
                  risks={securityRiskObjects}
                  onSelectTask={handleSecurityTaskSelect}
                />
              ) : isEmergencyStage ? (
                <EmergencyOverviewPanel
                  incidents={currentIncidents}
                  selectedIncident={selectedIncident}
                  onOpenVideoDispatch={handleEmergencyVideoDispatchOpen}
                />
              ) : isIndustryStage ? (
                <IndustryOverviewPanel selectedIndustry={selectedIndustry} objects={industryFilteredUnits} />
              ) : (
                <OverviewPanel
                  district={overviewTitle}
                  score={overviewScore}
                  isCity={!overviewDistrict}
                  onReset={resetOverview}
                />
              )}
            </DraggableCard>
            <DraggableCard
              card={cards[1]}
              onToggle={toggleCard}
              titleOverride={isSecurityStage ? '安保力量配置' : undefined}
            >
              {isSecurityStage ? (
                <SecurityForceEditor
                  forces={taskSecurityForces}
                  selectedForceId={selectedSecurityForce?.id || ''}
                  onAdd={handleAddSecurityForce}
                  onSelect={handleSecurityForceSelect}
                  onChange={handleSecurityForceChange}
                />
              ) : isEmergencyStage ? (
                <EmergencySearchPanel
                  query={incidentQuery}
                  setQuery={setIncidentQuery}
                  preset={incidentPreset}
                  setPreset={setIncidentPreset}
                  startDate={incidentStartDate}
                  setStartDate={setIncidentStartDate}
                  endDate={incidentEndDate}
                  setEndDate={setIncidentEndDate}
                  incidents={filteredIncidents}
                  selectedIncident={selectedIncident}
                  onSelect={handleIncidentSelect}
                />
              ) : isIndustryStage ? (
                <IndustryDistrictRank
                  objects={industryFilteredUnits}
                  selectedDistrict={selectedIndustryDistrict || selectedDistrict}
                  onSelect={handleIndustryDistrictSelect}
                />
              ) : (
                <DistrictRank selectedDistrict={isOverviewStage ? overviewDistrict : selectedDistrict} onSelect={handleDistrictSelect} />
              )}
            </DraggableCard>
            <DraggableCard
              card={cards[2]}
              onToggle={toggleCard}
              titleOverride={isSecurityStage ? '安保图层编排' : undefined}
            >
              {isSecurityStage ? (
                <SecurityLayerPanel layers={securityLayers} onToggle={handleSecurityLayerToggle} />
              ) : isEmergencyStage ? (
                <EmergencyLayerPanel incidents={emergencyIncidents} />
              ) : isIndustryStage ? (
                <IndustryMatrix
                  objects={knownIndustryUnits}
                  selectedIndustry={selectedIndustry}
                  onSelect={handleIndustrySelect}
                />
              ) : (
                <LayerPanel layers={layers} onToggle={toggleLayer} />
              )}
            </DraggableCard>
          </aside>

          <section className="map-stage">
            <div className="stage-tabs">
              {stageTabs.map((tab) => (
                <button
                  className={activeStage === tab ? 'active' : ''}
                  key={tab}
                  type="button"
                  onClick={() => handleStageSelect(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <ThreeRiskMap
              districts={districtShapes}
              layers={layers}
              objects={mapObjects}
              selectedDistrict={isOverviewStage ? overviewDistrict : selectedDistrict}
              mapMode={activeStage === '行政区专题' ? 'district' : activeStage === '行业专题' ? 'industry' : activeStage === '应急处置' ? 'emergency' : activeStage === '安保模式' ? 'security' : 'overview'}
              selectedIndustry={selectedIndustry}
              industryScope={industryScope}
              selectedObjectId={selectedObject?.id}
              selectedIndustryUnitId={selectedIndustryUnit?.id}
              selectedEmergencyObjectId={selectedIncident.id}
              selectedSecurityForceId={selectedSecurityForce?.id}
              securityTask={selectedSecurityTask}
              showSecurityRings={securityLayers.securityRings}
              onSelectDistrict={handleDistrictSelect}
              onSelectIndustryDistrict={handleIndustryDistrictSelect}
              onSelectEmergencyDistrict={handleEmergencyDistrictSelect}
              onSelectObject={handleObjectSelect}
            />
            {isSecurityStage && securityVideoOpen && (
              <SecurityVideoCommandOverlay
                forces={taskSecurityForces}
                selectedForceIds={securityVideoForceIds}
                activeForces={securityVideoForces}
                dispatched={securityVideoDispatched}
                onToggle={handleSecurityVideoToggle}
                onDispatch={handleSecurityVideoDispatch}
                onClose={() => setSecurityVideoOpen(false)}
              />
            )}
            {isEmergencyStage && emergencyVideoOpen && (
              <EmergencyVideoCommandOverlay
                videos={emergencyStationVideos}
                selectedVideoIds={emergencyVideoIds}
                activeVideos={emergencyActiveVideos}
                dispatched={emergencyVideoDispatched}
                enlargedVideoId={emergencyVideoEnlargedId}
                onToggle={handleEmergencyVideoToggle}
                onClose={() => setEmergencyVideoOpen(false)}
                onToggleEnlarge={(videoId) => setEmergencyVideoEnlargedId((current) => (current === videoId ? '' : videoId))}
              />
            )}
            <SelectedObjectCard object={isOverviewStage || isSecurityStage ? null : isEmergencyStage ? selectedIncident.unit : isIndustryStage ? selectedIndustryUnit : selectedObject} />
          </section>

          <aside className="panel-stack right-stack">
            <DraggableCard card={cards[3]} onToggle={toggleCard}>
              <AIPanel
                question={question}
                setQuestion={setQuestion}
                result={aiResult}
                loading={aiLoading}
                aiHealth={aiHealth}
                conversationHistory={conversationHistory}
                onRun={() => void runAI('text', question, '用户输入文本研判')}
                onVoice={() => void handleVoice()}
              />
            </DraggableCard>
            <DraggableCard
              card={cards[4]}
              onToggle={toggleCard}
              titleOverride={isSecurityStage ? '力量画像与图传' : undefined}
            >
              {isSecurityStage ? (
                <SecurityForceProfile
                  force={selectedSecurityForce}
                  task={selectedSecurityTask}
                  risks={securityRiskObjects}
                  forces={taskSecurityForces}
                  videoOpen={securityVideoOpen}
                  selectedVideoTeamCount={securityVideoForceIds.length}
                  onOpenVideoDispatch={handleSecurityVideoOpen}
                />
              ) : isEmergencyStage ? (
                <EmergencyDispositionPanel incident={selectedIncident} inspections={selectedIncidentInspections} />
              ) : isIndustryStage ? (
                <IndustryDetailPanel
                  scope={industryScope}
                  selectedIndustry={selectedIndustry}
                  district={selectedIndustryDistrict || selectedDistrict}
                  unit={selectedIndustryUnit}
                  objects={industryFilteredUnits}
                  onSelectUnit={handleObjectSelect}
                />
              ) : (
                <ActionPanel result={aiResult} objects={regionObjects} />
              )}
            </DraggableCard>
          </aside>

          {aspectMode === '32:9' && (
            <>
              <aside className="panel-stack wide-left-stack">
                <DraggableCard
                  card={cards[6]}
                  onToggle={toggleCard}
                  titleOverride={isSecurityStage ? '安保力量清单' : undefined}
                >
                  {isSecurityStage ? (
                    <SecurityForceEditor
                      forces={taskSecurityForces}
                      selectedForceId={selectedSecurityForce?.id || ''}
                      onAdd={handleAddSecurityForce}
                      onSelect={handleSecurityForceSelect}
                      onChange={handleSecurityForceChange}
                    />
                  ) : isEmergencyStage ? (
                    <EmergencySearchPanel
                      query={incidentQuery}
                      setQuery={setIncidentQuery}
                      preset={incidentPreset}
                      setPreset={setIncidentPreset}
                      startDate={incidentStartDate}
                      setStartDate={setIncidentStartDate}
                      endDate={incidentEndDate}
                      setEndDate={setIncidentEndDate}
                      incidents={filteredIncidents}
                      selectedIncident={selectedIncident}
                      onSelect={handleIncidentSelect}
                    />
                  ) : (
                    <IndustryMatrix
                      objects={knownIndustryUnits}
                      selectedIndustry={selectedIndustry}
                      onSelect={handleIndustrySelect}
                    />
                  )}
                </DraggableCard>
              </aside>
              <aside className="panel-stack wide-right-stack">
                <DraggableCard
                  card={cards[7]}
                  onToggle={toggleCard}
                  titleOverride={isSecurityStage ? '安保覆盖能力' : undefined}
                >
                  {isSecurityStage ? (
                    <SecurityCoveragePanel task={selectedSecurityTask} forces={taskSecurityForces} risks={securityRiskObjects} />
                  ) : isEmergencyStage ? <EmergencyResourcePanel incident={selectedIncident} /> : <ResourceCoverage />}
                </DraggableCard>
              </aside>
            </>
          )}
        </section>

        <footer className="event-dock">
          {isSecurityStage ? (
            <SecurityTimeline task={selectedSecurityTask} forces={taskSecurityForces} />
          ) : isEmergencyStage ? (
            <EmergencyTimeline incidents={[selectedIncident]} />
          ) : (
            <EventTimeline
              events={isIndustryStage ? industryMapObjects : riskObjects}
              selectedEventId={selectedObject?.id}
              onSelect={handleTimelineAlertSelect}
            />
          )}
        </footer>
      </main>
    </DndContext>
  )
}

function Header({
  aspectMode,
  setAspectMode,
  criticalCount,
  highCount,
  processingCount,
}: {
  aspectMode: AspectMode
  setAspectMode: (mode: AspectMode) => void
  criticalCount: number
  highCount: number
  processingCount: number
}) {
  return (
    <header className="command-header">
      <div className="brand-mark">
        <Siren size={26} />
        <div>
          <span>上海消防</span>
          <strong>风险智能监测预警中枢</strong>
        </div>
      </div>
      <div className="header-kpis">
        <Kpi label="综合风险指数" value="86.4" tone="blue" />
        <Kpi label="极高风险" value={String(criticalCount)} tone="red" />
        <Kpi label="高风险" value={String(highCount)} tone="orange" />
        <Kpi label="处置中" value={String(processingCount)} tone="cyan" />
        <Kpi label="闭环率" value="87%" tone="green" />
      </div>
      <div className="header-tools">
        <div className="status-chip"><RadioTower size={15} />物联在线 91.6%</div>
        <div className="aspect-switch" aria-label="大屏比例切换">
          {(['16:9', '32:9'] as AspectMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={aspectMode === mode ? 'active' : ''}
              onClick={() => setAspectMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function DraggableCard({
  card,
  children,
  onToggle,
  titleOverride,
}: {
  card: ModuleCard
  children: React.ReactNode
  onToggle: (id: string) => void
  titleOverride?: string
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: card.id })
  const style = {
    transform: CSS.Translate.toString(transform),
  }

  return (
    <section ref={setNodeRef} style={style} className={`module-card ${card.collapsed ? 'collapsed' : ''}`}>
      <header className="module-head" {...listeners} {...attributes}>
        <span>{card.pinned ? <PanelLeft size={15} /> : <Boxes size={15} />}{titleOverride || card.title}</span>
        <button type="button" onClick={() => onToggle(card.id)} aria-label="折叠模块">
          <ChevronDown size={15} />
        </button>
      </header>
      {!card.collapsed && <div className="module-body">{children}</div>}
    </section>
  )
}

function OverviewPanel({
  district,
  score,
  isCity,
  onReset,
}: {
  district: string
  score: number
  isCity: boolean
  onReset: () => void
}) {
  return (
    <div className="overview-panel">
      <div className="risk-gauge">
        <div className="overview-scope-row">
          <span>{district}</span>
          {!isCity && (
            <button type="button" onClick={onReset}>
              回到全市
            </button>
          )}
        </div>
        <strong>{score}</strong>
        <em>Risk Index</em>
      </div>
      <div className="metric-list">
        <span>动态监测预警 <strong>2819</strong></span>
        <span>风险评估 <strong>5039</strong></span>
        <span>防火监督检查 <strong>4274</strong></span>
        <span>灭火准备 <strong>2301</strong></span>
        <span>应急联动 <strong>9803</strong></span>
      </div>
      <TrendChart data={[62, 66, 75, 81, 86, 82, 88]} />
    </div>
  )
}

function DistrictRank({ selectedDistrict, onSelect }: { selectedDistrict: string; onSelect: (district: string) => void }) {
  return (
    <div className="district-rank">
      {districtShapes
        .slice()
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 8)
        .map((district, index) => (
          <button
            className={selectedDistrict === district.name ? 'active' : ''}
            key={district.name}
            type="button"
            onClick={() => onSelect(district.name)}
          >
            <span>{String(index + 1).padStart(2, '0')} {district.name}</span>
            <i style={{ width: `${district.riskScore}%` }} />
            <strong>{district.riskScore}</strong>
          </button>
        ))}
    </div>
  )
}

function LayerPanel({ layers, onToggle }: { layers: LayerDefinition[]; onToggle: (id: string) => void }) {
  return (
    <div className="layer-panel">
      {layers.map((layer) => (
        <button className={layer.visible ? 'enabled' : ''} key={layer.id} type="button" onClick={() => onToggle(layer.id)}>
          <span style={{ borderColor: layer.color, backgroundColor: `${layer.color}22` }}>
            <Layers size={15} color={layer.color} />
          </span>
          <em>{layer.name}</em>
          <i>{layer.renderMode}</i>
        </button>
      ))}
    </div>
  )
}

function AIPanel({
  question,
  setQuestion,
  result,
  loading,
  aiHealth,
  conversationHistory,
  onRun,
  onVoice,
}: {
  question: string
  setQuestion: (value: string) => void
  result: AIAnalysisResult | null
  loading: boolean
  aiHealth: { ok: boolean; model: string }
  conversationHistory: AIConversationMessage[]
  onRun: () => void
  onVoice: () => void
}) {
  return (
    <div className="ai-panel">
      <div className="ai-input">
        <Bot size={20} />
        <input value={question} onChange={(event) => setQuestion(event.target.value)} />
        <button type="button" onClick={onVoice} title="模拟语音输入"><Mic size={17} /></button>
        <button type="button" onClick={onRun} title="RAG 综合研判"><Search size={17} /></button>
      </div>
      <div className="ai-capabilities">
        <span><Sparkles size={14} />多模态图层融合</span>
        <span><Database size={14} />{aiHealth.ok ? 'Ollama 在线' : 'Ollama 降级'} {aiHealth.model}</span>
        <span><AudioLines size={14} />语音交互预留</span>
      </div>
      <div className="ai-result">
        {loading && <p className="loading-text">AI 正在综合图层、对象、知识片段和处置状态...</p>}
        {!loading && result && (
          <>
            <strong>{result.summary}</strong>
            <div className="confidence">置信度 {(result.confidence * 100).toFixed(0)}%</div>
            <ul>
              {result.riskDrivers.slice(0, 4).map((driver) => <li key={driver}>{driver}</li>)}
            </ul>
            {!!result.moduleDecision && <p className="ai-module-decision">{result.moduleDecision}</p>}
            {!!result.toolTrace?.length && (
              <div className="ai-tool-trace">
                <span>工具调用轨迹</span>
                {result.toolTrace.slice(0, 5).map((trace, index) => (
                  <em className={trace.status} key={`${trace.name}-${index}`}>{trace.name} · {trace.message}</em>
                ))}
              </div>
            )}
            {!!result.recommendedActions.length && (
              <div className="ai-action-list">
                {result.recommendedActions.slice(0, 3).map((action) => <span key={action}>{action}</span>)}
              </div>
            )}
          </>
        )}
        {!loading && !result && <p>点击行政区、风险对象，或输入问题启动本地大模型研判。</p>}
      </div>
      {!!conversationHistory.length && (
        <div className="ai-conversation-mini">
          {conversationHistory.slice(-4).map((message, index) => (
            <span key={`${message.at}-${index}`}><i>{message.role === 'user' ? '问' : '答'}</i>{message.content}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionPanel({ result, objects }: { result: AIAnalysisResult | null; objects: RiskObject[] }) {
  const actions = result?.recommendedActions || [
    '优先核查极高风险对象的消防设施在线状态。',
    '叠加消防站点、水源、微型消防站覆盖圈复核响应能力。',
    '对同区域重复隐患建立复查闭环任务。',
  ]

  return (
    <div className="action-panel">
      {actions.map((action, index) => (
        <div className="action-item" key={action}>
          <span>{index + 1}</span>
          <p>{action}</p>
        </div>
      ))}
      <div className="object-mini-list">
        {objects.slice(0, 4).map((object) => (
          <span className={`level-${object.riskLevel}`} key={object.id}>{object.name}</span>
        ))}
      </div>
    </div>
  )
}

function SelectedObjectCard({ object }: { object: RiskObject | null }) {
  if (!object) {
    return null
  }

  return (
    <aside className="selected-object">
      <ShieldAlert size={18} />
      <div>
        <strong>{object.name}</strong>
        <span>{object.district} / {object.street} / {object.industry}</span>
      </div>
      <em className={`level-${object.riskLevel}`}>{levelLabel[object.riskLevel]}</em>
    </aside>
  )
}

function SecurityTaskPanel({
  task,
  tasks,
  forces,
  risks,
  onSelectTask,
}: {
  task: SecurityTask
  tasks: SecurityTask[]
  forces: SecurityForcePoint[]
  risks: RiskObject[]
  onSelectTask: (taskId: string) => void
}) {
  const personnel = forces.reduce((sum, force) => sum + force.personnel, 0)
  const vehicles = forces.reduce((sum, force) => sum + force.vehicles, 0)
  const abnormalForces = forces.filter((force) => force.status === '离线' || force.liveFeed.status === 'offline').length

  return (
    <div className="security-task-panel">
      <div className="security-task-switch">
        {tasks.map((item) => (
          <button
            className={task.id === item.id ? 'active' : ''}
            key={item.id}
            type="button"
            onClick={() => onSelectTask(item.id)}
          >
            <strong>{item.name}</strong>
            <span>{item.taskType === 'citywide' ? '全市安保' : '安保圈勤务'} · {item.status}</span>
          </button>
        ))}
      </div>
      <div className="security-hero">
        <span><ShieldCheck size={16} />{task.taskType === 'citywide' ? '全市安保模式' : '重大勤务安保圈'}</span>
        <strong>{task.venueName}</strong>
        <em>{task.dateRange}</em>
      </div>
      <div className="security-metric-grid">
        <span>安保力量 <strong>{forces.length}</strong></span>
        <span>投入人员 <strong>{personnel}</strong></span>
        <span>勤务车辆 <strong>{vehicles}</strong></span>
        <span>风险对象 <strong>{risks.length}</strong></span>
        <span>图传异常 <strong>{abnormalForces}</strong></span>
        <span>圈层范围 <strong>{task.rings.length ? '500/1000m' : '全市'}</strong></span>
      </div>
    </div>
  )
}

function SecurityLayerPanel({
  layers,
  onToggle,
}: {
  layers: SecurityLayerState
  onToggle: (id: keyof SecurityLayerState) => void
}) {
  return (
    <div className="security-layer-panel">
      {(Object.keys(layers) as Array<keyof SecurityLayerState>).map((id) => (
        <button className={layers[id] ? 'enabled' : ''} key={id} type="button" onClick={() => onToggle(id)}>
          <Layers size={15} />
          <span>{securityLayerLabels[id]}</span>
          <strong>{layers[id] ? 'ON' : 'OFF'}</strong>
        </button>
      ))}
    </div>
  )
}

function SecurityForceEditor({
  forces,
  selectedForceId,
  onAdd,
  onSelect,
  onChange,
}: {
  forces: SecurityForcePoint[]
  selectedForceId: string
  onAdd: () => void
  onSelect: (forceId: string) => void
  onChange: (forceId: string, patch: Partial<SecurityForcePoint>) => void
}) {
  const selectedForce = forces.find((force) => force.id === selectedForceId) || forces[0]

  return (
    <div className="security-force-editor">
      <button className="security-add-button" type="button" onClick={onAdd}>
        <Plus size={15} />新增可配置力量
      </button>
      <div className="security-force-list">
        {forces.slice(0, 8).map((force) => (
          <button
            className={selectedForce?.id === force.id ? 'active' : ''}
            key={force.id}
            type="button"
            onClick={() => onSelect(force.id)}
          >
            <span>{securityForceLabels[force.forceType]}</span>
            <strong>{force.name}</strong>
            <em>{force.personnel}人 / {force.vehicles}车 / {force.status}</em>
          </button>
        ))}
      </div>
      {selectedForce && (
        <div className="security-edit-form">
          <label>
            名称
            <input
              disabled={!selectedForce.editable}
              value={selectedForce.name}
              onChange={(event) => onChange(selectedForce.id, { name: event.target.value })}
            />
          </label>
          <label>
            类型
            <select
              disabled={!selectedForce.editable}
              value={selectedForce.forceType}
              onChange={(event) => onChange(selectedForce.id, { forceType: event.target.value as SecurityForceType })}
            >
              {Object.entries(securityForceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="security-edit-row">
            <label>
              人员
              <input
                disabled={!selectedForce.editable}
                min={0}
                type="number"
                value={selectedForce.personnel}
                onChange={(event) => onChange(selectedForce.id, { personnel: Number(event.target.value) })}
              />
            </label>
            <label>
              车辆
              <input
                disabled={!selectedForce.editable}
                min={0}
                type="number"
                value={selectedForce.vehicles}
                onChange={(event) => onChange(selectedForce.id, { vehicles: Number(event.target.value) })}
              />
            </label>
          </div>
          <div className="security-edit-row">
            <label>
              经度
              <input
                disabled={!selectedForce.editable}
                step="0.001"
                type="number"
                value={selectedForce.location.lng}
                onChange={(event) => onChange(selectedForce.id, { location: { ...selectedForce.location, lng: Number(event.target.value) } })}
              />
            </label>
            <label>
              纬度
              <input
                disabled={!selectedForce.editable}
                step="0.001"
                type="number"
                value={selectedForce.location.lat}
                onChange={(event) => onChange(selectedForce.id, { location: { ...selectedForce.location, lat: Number(event.target.value) } })}
              />
            </label>
          </div>
          <span className="security-edit-note">
            <Save size={13} />{selectedForce.editable ? '本地原型已即时保存' : '消防站点为固定底账，仅展示'}
          </span>
        </div>
      )}
    </div>
  )
}

function SecurityForceProfile({
  force,
  task,
  risks,
  forces,
  videoOpen,
  selectedVideoTeamCount,
  onOpenVideoDispatch,
}: {
  force?: SecurityForcePoint
  task: SecurityTask
  risks: RiskObject[]
  forces: SecurityForcePoint[]
  videoOpen: boolean
  selectedVideoTeamCount: number
  onOpenVideoDispatch: () => void
}) {
  if (!force) {
    return <p className="empty-text">请选择一个安保力量点位。</p>
  }

  const nearbyRisks = risks.filter((risk) => approximateDistanceMeters(force.location, risk.location) <= Math.max(1200, force.coverageRadius * 1.4))

  return (
    <div className="security-profile-panel">
      <div className="detail-hero">
        <span>{securityForceLabels[force.forceType]}画像</span>
        <strong>{force.name}</strong>
        <em>{force.status} · {force.district}</em>
      </div>
      <div className="security-metric-grid">
        <span>人员 <strong>{force.personnel}</strong></span>
        <span>车辆 <strong>{force.vehicles}</strong></span>
        <span>覆盖半径 <strong>{force.coverageRadius}m</strong></span>
        <span>通信信道 <strong>{force.contactChannel}</strong></span>
        <span>现场指挥 <strong>{force.commander}</strong></span>
        <span>周边风险 <strong>{nearbyRisks.length}</strong></span>
      </div>
      <div className={`security-live-feed tone-${force.liveFeed.snapshotTone}`}>
        <div>
          <Video size={18} />
          <strong>{force.liveFeed.title}</strong>
          <span>{force.liveFeed.status === 'online' ? '图传在线' : '图传离线'}</span>
        </div>
        <i />
      </div>
      <div className="security-action-row">
        <button type="button"><Video size={15} />视频连线</button>
        <button type="button"><PhoneCall size={15} />语音呼叫</button>
        <button className={videoOpen ? 'active' : ''} type="button" onClick={onOpenVideoDispatch}>
          <Video size={15} />九宫格调度
        </button>
      </div>
      <span className="security-dispatch-hint">
        已预选 {selectedVideoTeamCount} 组勤务团队，可在九宫格中增减后发起多团队视频会议。
      </span>
      <div className="evidence-list">
        <strong>装备与安保研判</strong>
        <p>{force.equipment.join('、')}</p>
        <p>{task.taskType === 'event-ring' ? `${task.venueName}周边 500 米核心圈由 ${forces.length} 个点位协同覆盖。` : '全市节假日勤务以商圈、景区、交通枢纽和滨江区域为重点。'}</p>
        <p>建议保持图传在线、每 30 分钟上报巡查轨迹，异常风险点由最近前置力量先期核查。</p>
      </div>
    </div>
  )
}

function SecurityVideoCommandOverlay({
  forces,
  selectedForceIds,
  activeForces,
  dispatched,
  onToggle,
  onDispatch,
  onClose,
}: {
  forces: SecurityForcePoint[]
  selectedForceIds: string[]
  activeForces: SecurityForcePoint[]
  dispatched: boolean
  onToggle: (forceId: string) => void
  onDispatch: () => void
  onClose: () => void
}) {
  const cells = Array.from({ length: 9 }, (_, index) => activeForces[index])

  return (
    <aside className="security-video-overlay">
      <header>
        <div>
          <span><Video size={16} />多团队视频调度</span>
          <strong>{dispatched ? '会议调度中' : '待发起调度'}</strong>
        </div>
        <div className="security-video-header-actions">
          <button type="button" onClick={onDispatch}>
            <Video size={15} />一键调度
          </button>
          <button className="ghost" type="button" onClick={onClose}>
            收起
          </button>
        </div>
      </header>
      <div className="security-video-workbench">
        <div className="security-video-grid">
          {cells.map((force, index) => (
            <div
              className={`security-video-cell ${force ? `tone-${force.liveFeed.snapshotTone}` : 'empty'}`}
              key={force?.id || `empty-${index}`}
            >
              {force ? (
                <>
                  <strong>{force.name}</strong>
                  <span>{securityForceLabels[force.forceType]} · {force.liveFeed.status === 'online' ? '在线' : '离线'}</span>
                  <i>{String(index + 1).padStart(2, '0')}</i>
                </>
              ) : (
                <span>待拉入团队</span>
              )}
            </div>
          ))}
        </div>
        <div className="security-video-team-picker">
          {forces.slice(0, 10).map((force) => (
            <button
              className={selectedForceIds.includes(force.id) ? 'active' : ''}
              key={force.id}
              type="button"
              onClick={() => onToggle(force.id)}
            >
              <span>{securityForceLabels[force.forceType]}</span>
              <strong>{force.name}</strong>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

function SecurityCoveragePanel({
  task,
  forces,
  risks,
}: {
  task: SecurityTask
  forces: SecurityForcePoint[]
  risks: RiskObject[]
}) {
  const onlineRate = forces.length ? Math.round((forces.filter((force) => force.liveFeed.status === 'online').length / forces.length) * 100) : 0

  return (
    <div className="resource-panel security-coverage-panel">
      <div className="coverage-ring">
        <MapPinned size={28} />
        <strong>{onlineRate}%</strong>
        <span>图传在线率</span>
      </div>
      <div className="resource-bars">
        <span>力量覆盖 <i style={{ width: `${Math.min(100, forces.length * 12)}%` }} /></span>
        <span>人员投入 <i style={{ width: `${Math.min(100, forces.reduce((sum, force) => sum + force.personnel, 0) / 2)}%` }} /></span>
        <span>风险压制 <i style={{ width: `${Math.max(32, 100 - risks.length * 6)}%` }} /></span>
        <span>{task.rings.length ? '圈层部署' : '全市撒点'} <i style={{ width: task.rings.length ? '92%' : '78%' }} /></span>
      </div>
    </div>
  )
}

function EmergencyOverviewPanel({
  incidents,
  selectedIncident,
  onOpenVideoDispatch,
}: {
  incidents: EmergencyIncident[]
  selectedIncident: EmergencyIncident
  onOpenVideoDispatch: () => void
}) {
  const activeCount = incidents.filter((incident) => incident.status !== '已归档').length

  return (
    <div className="emergency-overview-panel">
      <div className="emergency-command-card">
        <span><Flame size={16} />当前处置事件</span>
        <strong>{selectedIncident.progress}%</strong>
        <em>{selectedIncident.status} / {selectedIncident.commandLevel}</em>
      </div>
      <div className="emergency-metric-grid">
        <span>投入车辆 <strong>{selectedIncident.forces.vehicles}</strong></span>
        <span>消防救援人员 <strong>{selectedIncident.forces.firefighters}</strong></span>
        <span>响应时间 <strong>{selectedIncident.responseMinutes}min</strong></span>
        <span>重点单位 <strong>{selectedIncident.unit.name}</strong></span>
      </div>
      <div className="live-incident-strip">
        <article className={`incident-strip-item severity-${selectedIncident.severity}`}>
          <strong>{selectedIncident.title}</strong>
          <span>{selectedIncident.occurredAt} · 当前实时处置焦点</span>
        </article>
        <article className="incident-strip-item">
          <strong>全市正在处置警情</strong>
          <span>{activeCount} 起 · 搜索列表可切换历史复现</span>
        </article>
      </div>
      <button className="emergency-dispatch-trigger" type="button" onClick={onOpenVideoDispatch}>
        <Video size={16} />一键调度
      </button>
    </div>
  )
}

interface EmergencyStationVideo {
  id: string
  stationName: string
  channelName: string
  status: 'online' | 'busy' | 'offline'
  tone: 'red' | 'blue' | 'cyan' | 'gold'
  vehicle: string
}

function EmergencyVideoCommandOverlay({
  videos,
  selectedVideoIds,
  activeVideos,
  dispatched,
  enlargedVideoId,
  onToggle,
  onClose,
  onToggleEnlarge,
}: {
  videos: EmergencyStationVideo[]
  selectedVideoIds: string[]
  activeVideos: EmergencyStationVideo[]
  dispatched: boolean
  enlargedVideoId: string
  onToggle: (videoId: string) => void
  onClose: () => void
  onToggleEnlarge: (videoId: string) => void
}) {
  const enlargedVideo = activeVideos.find((video) => video.id === enlargedVideoId)
  const cells = enlargedVideo ? [enlargedVideo] : Array.from({ length: 9 }, (_, index) => activeVideos[index])

  return (
    <aside className="emergency-video-overlay">
      <header>
        <div>
          <span><Video size={15} />队站视频调度</span>
          <strong>{dispatched ? '视频会议调度中' : `${activeVideos.length} 路待调度`}</strong>
        </div>
        <button className="ghost" type="button" onClick={onClose}>收起</button>
      </header>
      <div className="emergency-video-workbench">
        <div className={`emergency-video-grid ${enlargedVideo ? 'is-enlarged' : ''}`}>
          {cells.map((video, index) => (
            <button
              className={`emergency-video-cell ${video ? `tone-${video.tone}` : 'empty'} ${enlargedVideo ? 'enlarged' : ''}`}
              key={video?.id || `empty-emergency-video-${index}`}
              type="button"
              onDoubleClick={() => {
                if (!video) return
                onToggleEnlarge(video.id)
              }}
            >
              {video ? (
                <>
                  <strong>{video.stationName}</strong>
                  <span>{video.channelName} · {video.vehicle}</span>
                  <i>{enlargedVideo ? '双击恢复' : String(index + 1).padStart(2, '0')}</i>
                </>
              ) : (
                <span>待接入</span>
              )}
            </button>
          ))}
        </div>
        <div className="emergency-video-resources">
          {videos.map((video) => (
            <button
              className={selectedVideoIds.includes(video.id) ? 'active' : ''}
              key={video.id}
              type="button"
              onClick={() => onToggle(video.id)}
            >
              <span>{video.stationName}</span>
              <strong>{video.status === 'offline' ? '离线' : video.status === 'busy' ? '处置中' : '在线'}</strong>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

function EmergencySearchPanel({
  query,
  setQuery,
  preset,
  setPreset,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  incidents,
  selectedIncident,
  onSelect,
}: {
  query: string
  setQuery: (value: string) => void
  preset: EmergencyTimePreset
  setPreset: (value: EmergencyTimePreset) => void
  startDate: string
  setStartDate: (value: string) => void
  endDate: string
  setEndDate: (value: string) => void
  incidents: EmergencyIncident[]
  selectedIncident: EmergencyIncident
  onSelect: (incident: EmergencyIncident) => void
}) {
  return (
    <div className="emergency-search-panel">
      <label className="incident-search-box">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索单位、警情编号、区域"
        />
      </label>
      <div className="time-preset-row">
        {(['1月内', '3个月内', '1年内', '自定义'] as EmergencyTimePreset[]).map((item) => (
          <button
            className={preset === item ? 'active' : ''}
            key={item}
            type="button"
            onClick={() => setPreset(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {preset === '自定义' && (
        <div className="custom-date-row">
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
      )}
      <div className="incident-result-list">
        {incidents.slice(0, 6).map((incident) => (
          <button
            className={selectedIncident.id === incident.id ? 'active' : ''}
            key={incident.id}
            data-incident-id={incident.id}
            type="button"
            onPointerDown={() => onSelect(incident)}
            onClick={() => onSelect(incident)}
          >
            <span>{incident.alarmNo}</span>
            <strong>{incident.unit.name}</strong>
            <em>{incident.occurredAt} · {incident.status}</em>
          </button>
        ))}
      </div>
    </div>
  )
}

function EmergencyLayerPanel({ incidents }: { incidents: EmergencyIncident[] }) {
  const ongoing = incidents.filter((incident) => currentEmergencyStatuses.has(incident.status))
  const archived = incidents.filter((incident) => incident.status === '已归档')
  const severe = incidents.filter((incident) => incident.severity === '重大风险')

  return (
    <div className="emergency-layer-panel">
      <div className="emergency-layer-card live">
        <AlertTriangle size={17} />
        <span>实时警情图层</span>
        <strong>{ongoing.length}</strong>
      </div>
      <div className="emergency-layer-card">
        <History size={17} />
        <span>历史警情复现</span>
        <strong>{archived.length}</strong>
      </div>
      <div className="emergency-layer-card severe">
        <CalendarClock size={17} />
        <span>重大风险复盘</span>
        <strong>{severe.length}</strong>
      </div>
    </div>
  )
}

function EmergencyDispositionPanel({
  incident,
  inspections,
}: {
  incident: EmergencyIncident
  inspections: FireInspectionRecord[]
}) {
  return (
    <div className="emergency-disposition-panel">
      <section className="disaster-block">
        <div className="detail-hero">
          <span>{incident.status === '已归档' ? '历史警情复现' : '正在发生的灾情处置'}</span>
          <strong>{incident.unit.name}</strong>
          <em>{incident.incidentType} · {incident.status}</em>
        </div>
        <div className="incident-progress">
          <span style={{ width: `${incident.progress}%` }} />
        </div>
        <div className="emergency-param-grid">
          <span>响应时间 <strong>{incident.responseMinutes}min</strong></span>
          <span>被困/伤亡 <strong>{incident.trapped}/{incident.casualties}</strong></span>
          <span>车辆/人员 <strong>{incident.forces.vehicles}/{incident.forces.firefighters}</strong></span>
          <span>供水压力 <strong>{incident.waterPressure}</strong></span>
          <span>烟气态势 <strong>{incident.smokeSpread}</strong></span>
          <span>指挥层级 <strong>{incident.commandLevel}</strong></span>
        </div>
        <div className="evidence-list">
          <strong>处置措施</strong>
          {incident.measures.map((measure) => <p key={measure}>{measure}</p>)}
        </div>
        <div className="incident-mini-timeline">
          {incident.timeline.map((item) => (
            <span key={`${item.time}-${item.text}`}><i>{item.time}</i>{item.text}</span>
          ))}
        </div>
      </section>
      <section className="inspection-block">
        <div className="section-title-row">
          <strong>历史消防检查情况</strong>
          <span>{inspections.length} 条记录</span>
        </div>
        <div className="inspection-list">
          {inspections.map((record) => (
            <article key={record.id} className={record.rectified ? 'closed' : 'open'}>
              <time>{record.date}</time>
              <strong>{record.inspectionType}</strong>
              <span>{record.sourceSystem} · {record.result}</span>
              <p>{record.issues.join('；')}</p>
            </article>
          ))}
          {!inspections.length && <p className="empty-text">暂无匹配检查记录，实际开发时从消防监督和隐患排查系统提取。</p>}
        </div>
      </section>
    </div>
  )
}

function EmergencyResourcePanel({ incident }: { incident: EmergencyIncident }) {
  return (
    <div className="resource-panel emergency-resource-panel">
      <div className="coverage-ring">
        <MapPinned size={28} />
        <strong>{incident.forces.stations}</strong>
        <span>联动消防站</span>
      </div>
      <div className="resource-bars">
        <span>到场车辆 <i style={{ width: `${Math.min(100, incident.forces.vehicles * 8)}%` }} /></span>
        <span>救援人员 <i style={{ width: `${Math.min(100, incident.forces.firefighters)}%` }} /></span>
        <span>处置进度 <i style={{ width: `${incident.progress}%` }} /></span>
        <span>响应效率 <i style={{ width: `${Math.max(30, 100 - incident.responseMinutes * 7)}%` }} /></span>
      </div>
    </div>
  )
}

function IndustryOverviewPanel({ selectedIndustry, objects }: { selectedIndustry: IndustrySelection; objects: RiskObject[] }) {
  const critical = objects.filter((object) => object.riskLevel === 'critical').length
  const high = objects.filter((object) => object.riskLevel === 'high').length
  const closed = objects.filter((object) => object.status === '已闭环').length
  const score = Math.min(99, 68 + critical * 4 + high * 2)

  return (
    <div className="industry-overview-panel">
      <div className="risk-gauge">
        <span>{selectedIndustry === '全部行业' ? '全市重点行业' : selectedIndustry}</span>
        <strong>{score}</strong>
        <em>Industry Index</em>
      </div>
      <div className="industry-summary-grid">
        <span>单位对象 <strong>{objects.length}</strong></span>
        <span>极高/高风险 <strong>{critical + high}</strong></span>
        <span>覆盖行政区 <strong>{new Set(objects.map((object) => object.district)).size}</strong></span>
        <span>闭环率 <strong>{objects.length ? Math.round((closed / objects.length) * 100) : 0}%</strong></span>
      </div>
      <TrendChart data={[58, 63, 69, 76, score - 4, score - 1, score]} />
    </div>
  )
}

function IndustryDistrictRank({
  objects,
  selectedDistrict,
  onSelect,
}: {
  objects: RiskObject[]
  selectedDistrict: string
  onSelect: (district: string) => void
}) {
  const ranked = districtShapes
    .map((district) => {
      const districtObjects = objects.filter((object) => object.district === district.name)
      const critical = districtObjects.filter((object) => object.riskLevel === 'critical').length
      const high = districtObjects.filter((object) => object.riskLevel === 'high').length
      return {
        ...district,
        unitCount: districtObjects.length,
        score: Math.min(99, district.riskScore + critical * 4 + high * 2),
      }
    })
    .filter((district) => district.unitCount > 0)
    .sort((a, b) => b.score - a.score)

  return (
    <div className="district-rank industry-district-rank">
      {ranked.slice(0, 8).map((district, index) => (
        <button
          className={selectedDistrict === district.name ? 'active' : ''}
          key={district.name}
          type="button"
          onClick={() => onSelect(district.name)}
        >
          <span>{String(index + 1).padStart(2, '0')} {district.name}</span>
          <i style={{ width: `${district.score}%` }} />
          <strong>{district.unitCount}</strong>
        </button>
      ))}
    </div>
  )
}

function IndustryMatrix({
  objects,
  selectedIndustry,
  onSelect,
}: {
  objects: RiskObject[]
  selectedIndustry: IndustrySelection
  onSelect: (industry: IndustrySelection) => void
}) {
  const options: Array<{ industry: IndustrySelection; label: string; color: string }> = [
    { industry: '全部行业', label: '全部行业', color: '#4cc9ff' },
    ...industryProfiles.map((profile) => ({
      industry: profile.industry,
      label: profile.label,
      color: profile.color,
    })),
  ]

  return (
    <div className="industry-matrix">
      {options.map((option) => {
        const scoped = option.industry === '全部行业'
          ? objects
          : objects.filter((object) => object.industry === option.industry)
        const critical = scoped.filter((object) => object.riskLevel === 'critical').length
        const high = scoped.filter((object) => object.riskLevel === 'high').length
        const score = Math.min(99, 62 + critical * 5 + high * 3 + scoped.length)

        return (
        <button
          className={selectedIndustry === option.industry ? 'active' : ''}
          key={option.industry}
          style={{ borderColor: `${option.color}66` }}
          type="button"
          onClick={() => onSelect(option.industry)}
        >
          <Activity size={16} />
          <span>{option.label}</span>
          <strong style={{ color: option.color }}>{score}</strong>
          <em>{scoped.length} 个对象 / {critical + high} 个高风险</em>
        </button>
        )
      })}
    </div>
  )
}

function IndustryDetailPanel({
  scope,
  selectedIndustry,
  district,
  unit,
  objects,
  onSelectUnit,
}: {
  scope: IndustryScope
  selectedIndustry: IndustrySelection
  district: string
  unit: RiskObject | null
  objects: RiskObject[]
  onSelectUnit: (object: RiskObject) => void
}) {
  const profile = selectedIndustry === '全部行业'
    ? null
    : industryProfiles.find((item) => item.industry === selectedIndustry)
  const districtObjects = objects.filter((object) => object.district === district)
  const scopeObjects = scope === 'city' ? objects : districtObjects

  if (scope === 'unit' && unit) {
    return (
      <div className="industry-detail-panel">
        <div className="detail-hero">
          <span>单位画像</span>
          <strong>{unit.name}</strong>
          <em className={`level-${unit.riskLevel}`}>{levelLabel[unit.riskLevel]}</em>
        </div>
        <div className="detail-kv">
          <span>行政区 <strong>{unit.district}</strong></span>
          <span>街镇 <strong>{unit.street}</strong></span>
          <span>行业 <strong>{unit.industry}</strong></span>
          <span>对象类型 <strong>{unit.objectType}</strong></span>
          <span>状态 <strong>{unit.status}</strong></span>
          <span>数据置信 <strong>{unit.dataConfidence === 'high' ? '高' : '中'}</strong></span>
        </div>
        <div className="evidence-list">
          <strong>模拟 RAG 证据</strong>
          {unit.signals.map((signal) => <p key={signal}>{signal}</p>)}
          {unit.sourceNote && <p>{unit.sourceNote}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="industry-detail-panel">
      <div className="detail-hero">
        <span>{scope === 'district' ? '区级行业详情' : '全市行业研判'}</span>
        <strong>{scope === 'district' ? `${district} · ${selectedIndustry}` : selectedIndustry}</strong>
        <em>{scopeObjects.length} 个对象</em>
      </div>
      <div className="detail-kv">
        <span>极高风险 <strong>{scopeObjects.filter((object) => object.riskLevel === 'critical').length}</strong></span>
        <span>高风险 <strong>{scopeObjects.filter((object) => object.riskLevel === 'high').length}</strong></span>
        <span>处置中 <strong>{scopeObjects.filter((object) => object.status === '处置中').length}</strong></span>
        <span>预警中 <strong>{scopeObjects.filter((object) => object.status === '预警').length}</strong></span>
      </div>
      <div className="evidence-list">
        <strong>风险触发因子</strong>
        {(profile?.riskDrivers || ['跨行业风险叠加', '重点场所客流或作业强度变化', '多源感知信号需要联动核验']).map((driver) => (
          <p key={driver}>{driver}</p>
        ))}
      </div>
      <div className="unit-list">
        {scopeObjects.slice(0, 6).map((object) => (
          <button
            className={`level-${object.riskLevel}`}
            key={object.id}
            type="button"
            onClick={() => onSelectUnit(object)}
          >
            {object.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function ResourceCoverage() {
  return (
    <div className="resource-panel">
      <div className="coverage-ring">
        <MapPinned size={28} />
        <strong>92%</strong>
        <span>5分钟响应覆盖</span>
      </div>
      <div className="resource-bars">
        <span>消防站点 <i style={{ width: '88%' }} /></span>
        <span>消防水源 <i style={{ width: '79%' }} /></span>
        <span>微型消防站 <i style={{ width: '84%' }} /></span>
        <span>专业队伍 <i style={{ width: '73%' }} /></span>
      </div>
    </div>
  )
}

function EventTimeline({
  events,
  selectedEventId,
  onSelect,
}: {
  events: RiskObject[]
  selectedEventId?: string
  onSelect: (event: RiskObject) => void
}) {
  const alertEvents = [...events]
    .filter((event) => event.status !== '已闭环' && event.riskLevel !== 'medium')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const marqueeEvents = alertEvents.length ? alertEvents : events.slice(0, 8)
  const repeatedEvents = [...marqueeEvents, ...marqueeEvents]

  return (
    <div className="event-timeline">
      <div className="dock-title">
        <SlidersHorizontal size={17} />
        <span>重点隐患告警滚动轴</span>
      </div>
      <div className="alarm-marquee" aria-label="当前重点隐患告警">
        <div className="alarm-marquee-track">
          {repeatedEvents.map((event, index) => (
            <button
              className={`timeline-item level-${event.riskLevel} ${selectedEventId === event.id ? 'active' : ''}`}
              key={`${event.id}-${index}`}
              type="button"
              onClick={() => onSelect(event)}
            >
              <time>{event.updatedAt}</time>
              <strong>{event.name}</strong>
              <span>{event.district} · {event.status}</span>
              <em>{event.signals[0]}</em>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmergencyTimeline({ incidents }: { incidents: EmergencyIncident[] }) {
  return (
    <div className="event-timeline emergency-timeline">
      <div className="dock-title">
        <SlidersHorizontal size={17} />
        <span>警情复现时间轴</span>
      </div>
      {incidents.slice(0, 8).map((incident) => (
        <article key={incident.id} className={`timeline-item severity-${incident.severity}`}>
          <time>{incident.occurredAt.slice(5, 16)}</time>
          <strong>{incident.unit.name}</strong>
          <span>{incident.incidentType} · {incident.status}</span>
        </article>
      ))}
    </div>
  )
}

function SecurityTimeline({ task, forces }: { task: SecurityTask; forces: SecurityForcePoint[] }) {
  const events = [
    { time: '07:30', title: '勤务启动', text: task.name },
    { time: '08:10', title: '力量到位', text: `${forces.length} 个安保点位完成签到` },
    { time: '09:00', title: '图传巡检', text: `${forces.filter((force) => force.liveFeed.status === 'online').length} 路现场画面在线` },
    { time: '10:30', title: '风险复核', text: task.taskType === 'event-ring' ? '500米核心圈完成第一轮巡查' : '商圈景区完成第一轮巡查' },
    { time: '12:00', title: '指挥研判', text: 'AI 汇总力量覆盖与社会面风险变化' },
  ]

  return (
    <div className="event-timeline security-timeline">
      <div className="dock-title">
        <SlidersHorizontal size={17} />
        <span>安保勤务时间轴</span>
      </div>
      {events.map((event) => (
        <article key={`${event.time}-${event.title}`} className="timeline-item level-high">
          <time>{event.time}</time>
          <strong>{event.title}</strong>
          <span>{event.text}</span>
        </article>
      ))}
    </div>
  )
}

function incidentToRiskObject(incident: EmergencyIncident): RiskObject {
  const riskLevel: RiskLevel = incident.severity === '重大风险'
    ? 'critical'
    : incident.severity === '较大'
      ? 'high'
      : 'medium'

  return {
    ...incident.unit,
    id: incident.id,
    name: incident.unit.name,
    district: incident.district,
    street: incident.street,
    riskLevel,
    location: incident.location,
    signals: [
      incident.title,
      `${incident.status} / ${incident.commandLevel}`,
      `${incident.forces.vehicles}车 ${incident.forces.firefighters}人`,
    ],
    status: incident.status === '已归档' ? '已闭环' : '处置中',
    updatedAt: incident.occurredAt.slice(11, 16),
  }
}

function createEmergencyStationVideos(incident: EmergencyIncident): EmergencyStationVideo[] {
  const stationNames = [
    `${incident.street}消防救援站`,
    `${incident.district}特勤站`,
    `${incident.district}战勤保障站`,
    `${incident.unit.name}现场指挥点`,
    '支队作战指挥中心',
    '供水编组图传',
    '侦检编组图传',
    '疏散警戒组图传',
    '增援待命站',
  ]
  const tones: EmergencyStationVideo['tone'][] = ['red', 'blue', 'cyan', 'gold']
  const onlineCount = Math.min(9, Math.max(incident.forces.stations + 3, 5))

  return stationNames.slice(0, onlineCount).map((stationName, index) => ({
    id: `${incident.id}-video-${index + 1}`,
    stationName,
    channelName: incident.forces.rescueTeams[index % incident.forces.rescueTeams.length] || '现场图传',
    status: index === onlineCount - 1 && incident.status === '到场' ? 'busy' : index === 8 ? 'offline' : 'online',
    tone: tones[index % tones.length],
    vehicle: index < incident.forces.vehicles ? `${index + 1}号车载终端` : '单兵图传',
  }))
}

function defaultEmergencyVideoIds(incident: EmergencyIncident) {
  const videos = createEmergencyStationVideos(incident)
  return videos.slice(0, Math.min(9, Math.max(4, incident.forces.stations + 1))).map((video) => video.id)
}

function securityForceVisible(force: SecurityForcePoint, layers: SecurityLayerState) {
  if (force.forceType === 'fire-station') return layers.fireStations
  if (force.forceType === 'mobile-forward-station') return layers.mobileStations
  if (force.forceType === 'grid-patrol') return layers.gridPatrols
  return layers.eventForces
}

function securityForceToRiskObject(force: SecurityForcePoint): RiskObject {
  const riskLevel: RiskLevel = force.status === '离线' ? 'critical' : force.status === '处置中' ? 'high' : 'medium'
  return {
    id: force.id,
    name: force.name,
    district: force.district,
    street: force.address,
    industry: force.forceType === 'fire-station' ? '消防站点' : '消防队伍',
    objectType: securityForceLabels[force.forceType],
    riskLevel,
    location: force.location,
    signals: [`forceType:${force.forceType}`, `${force.personnel}人 ${force.vehicles}车`, force.liveFeed.status === 'online' ? '图传在线' : '图传离线'],
    status: force.status === '离线' ? '预警' : '监测中',
    updatedAt: '勤务',
  }
}

function approximateDistanceMeters(
  start: { lng: number; lat: number },
  end: { lng: number; lat: number },
) {
  const latMeters = (end.lat - start.lat) * 111000
  const lngMeters = (end.lng - start.lng) * 111000 * Math.cos((start.lat * Math.PI) / 180)
  return Math.sqrt(latMeters ** 2 + lngMeters ** 2)
}

function matchIncidentTime(
  incident: EmergencyIncident,
  preset: EmergencyTimePreset,
  startDate: string,
  endDate: string,
) {
  const occurred = new Date(incident.occurredAt.replace(' ', 'T')).getTime()
  const now = new Date('2026-05-18T23:59:59').getTime()

  if (preset === '自定义') {
    const start = new Date(`${startDate}T00:00:00`).getTime()
    const end = new Date(`${endDate}T23:59:59`).getTime()
    return occurred >= start && occurred <= end
  }

  const days = preset === '1月内' ? 31 : preset === '3个月内' ? 93 : 366
  return occurred >= now - days * 24 * 60 * 60 * 1000
}

function sortIncidentsByTimeDesc(incidents: EmergencyIncident[]) {
  return incidents
    .slice()
    .sort((left, right) => new Date(right.occurredAt.replace(' ', 'T')).getTime() - new Date(left.occurredAt.replace(' ', 'T')).getTime())
}

function getLatestIncident(incidents: EmergencyIncident[]) {
  return sortIncidentsByTimeDesc(incidents)[0]
}

function stringArg(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

function executed(name: string, message: string): AIToolTrace {
  return { name, status: 'executed', message }
}

function skipped(name: string, message: string): AIToolTrace {
  return { name, status: 'skipped', message }
}

function isStageTab(value: string): value is StageTab {
  return ['总览', '行政区专题', '行业专题', '应急处置', '安保模式'].includes(value)
}

function isIndustrySelection(value: string): value is IndustrySelection {
  return value === '全部行业' || industryProfiles.some((profile) => profile.industry === value)
}

function isEmergencyTimePreset(value: string): value is EmergencyTimePreset {
  return ['1月内', '3个月内', '1年内', '自定义'].includes(value)
}

function calculateCityRiskScore() {
  const averageDistrictScore = districtShapes.reduce((sum, district) => sum + district.riskScore, 0) / districtShapes.length
  const criticalWeight = riskObjects.filter((object) => object.riskLevel === 'critical').length * 2.4
  const highWeight = riskObjects.filter((object) => object.riskLevel === 'high').length * 0.9
  return Math.min(99, Math.round(averageDistrictScore + criticalWeight + highWeight))
}

export default App
