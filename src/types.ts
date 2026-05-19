export type RiskLevel = 'medium' | 'high' | 'critical'

export type Industry =
  | '高层建筑'
  | '厂房仓库'
  | '医疗机构'
  | '商业综合体'
  | '人员密集场所'
  | '地下空间'
  | '轨道交通'
  | '电动自行车'
  | '新能源汽车'
  | '农村自建房'
  | '燃气危化'
  | '施工动火'
  | '消防站点'
  | '消防水源'
  | '消防队伍'

export type ObjectStatus = '监测中' | '预警' | '处置中' | '已闭环'
export type IndustrySelection = Industry | '全部行业'
export type IndustryScope = 'city' | 'district' | 'unit'
export type DataConfidence = 'high' | 'medium'
export type EmergencyTimePreset = '1月内' | '3个月内' | '1年内' | '自定义'
export type EmergencyIncidentStatus = '接警' | '出动' | '到场' | '处置中' | '控制' | '已归档'
export type EmergencySeverity = '一般' | '较大' | '重大风险'
export type SecurityTaskType = 'citywide' | 'event-ring'
export type SecurityForceType = 'fire-station' | 'mobile-forward-station' | 'grid-patrol' | 'event-standby-force'
export type SecurityForceStatus = '待命' | '巡查中' | '驻防中' | '处置中' | '离线'

export interface RiskObject {
  id: string
  name: string
  district: string
  street: string
  industry: Industry
  objectType: string
  riskLevel: RiskLevel
  location: {
    lng: number
    lat: number
  }
  signals: string[]
  status: ObjectStatus
  updatedAt: string
  sourceNote?: string
  dataConfidence?: DataConfidence
}

export interface LayerDefinition {
  id: string
  name: string
  category: 'risk' | 'resource' | 'iot' | 'governance'
  color: string
  visible: boolean
  renderMode: 'extrusion' | 'point-cloud' | 'pulse' | 'coverage'
  filters: {
    industries: Industry[]
    levels?: RiskLevel[]
  }
}

export interface AIAnalysisRequest {
  selectedRegion: string
  activeLayers: string[]
  riskObjects: RiskObject[]
  timeRange: '今日' | '近7日' | '近30日'
  question: string
  inputMode: 'text' | 'voice' | 'region-click' | 'object-click'
  stage?: StageTab
  operation?: string
  selectedObject?: RiskObject | null
  uiState?: Record<string, unknown>
  availableTools?: string[]
  conversationHistory?: AIConversationMessage[]
}

export interface AIAnalysisResult {
  summary: string
  riskDrivers: string[]
  evidence: string[]
  recommendedActions: string[]
  similarCases: string[]
  confidence: number
  toolCalls?: AIToolCall[]
  toolTrace?: AIToolTrace[]
  followUpQuestions?: string[]
  moduleDecision?: string
  source?: 'ollama' | 'mock' | 'fallback'
}

export type AIToolName =
  | 'switch_stage'
  | 'select_district'
  | 'reset_overview'
  | 'select_industry'
  | 'select_industry_district'
  | 'select_industry_unit'
  | 'select_incident'
  | 'set_incident_time_preset'
  | 'select_security_task'
  | 'select_security_force'
  | 'toggle_layer'
  | 'toggle_security_layer'
  | 'open_emergency_video_dispatch'
  | 'open_security_video_dispatch'
  | 'set_question'
  | 'run_analysis'

export interface AIToolCall {
  id?: string
  name: AIToolName | string
  arguments?: Record<string, unknown>
  reason?: string
}

export interface AIToolTrace {
  name: string
  status: 'executed' | 'skipped' | 'failed'
  message: string
}

export interface AIConversationMessage {
  role: 'user' | 'assistant'
  content: string
  at: string
}

export interface DistrictShape {
  name: string
  riskScore: number
  closedRate: number
  iotOnlineRate: number
  center: [number, number]
}

export interface ModuleCard {
  id: string
  title: string
  area: 'left' | 'right' | 'bottom' | 'wide-left' | 'wide-right'
  pinned: boolean
  collapsed: boolean
}

export type StageTab = '总览' | '行政区专题' | '行业专题' | '应急处置' | '安保模式' | '知识图谱'

export type KnowledgeGraphNodeType =
  | 'module'
  | 'source-system'
  | 'district'
  | 'street'
  | 'industry'
  | 'risk-object'
  | 'incident'
  | 'inspection'
  | 'inspection-summary'
  | 'fire-history'
  | 'iot-profile'
  | 'iot-device'
  | 'security-task'
  | 'security-force'
  | 'layer'
  | 'risk-signal'
  | 'metric'

export type KnowledgeGraphEdgeRelation =
  | '属于模块'
  | '位于'
  | '属于行业'
  | '来源于'
  | '触发'
  | '关联隐患'
  | '监督检查'
  | '历史火灾'
  | '消防画像'
  | '物联设备'
  | '处置对象'
  | '调度力量'
  | '覆盖区域'
  | '共享风险信号'
  | '支撑研判'

export interface KnowledgeGraphNode {
  id: string
  label: string
  type: KnowledgeGraphNodeType
  category: string
  sourceSystems: string[]
  sourceRefs: string[]
  density: number
  metadata: Record<string, string | number | boolean | string[] | undefined>
  linkedEntityId?: string
}

export interface KnowledgeGraphEdge {
  id: string
  source: string
  target: string
  relation: KnowledgeGraphEdgeRelation
  weight: number
  sourceSystems: string[]
  evidenceCount: number
  metadata: Record<string, string | number | boolean | string[] | undefined>
}

export interface KnowledgeGraphSnapshot {
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  stats: {
    nodeCount: number
    edgeCount: number
    sourceSystemCount: number
    highDensityNodeCount: number
  }
  generatedAt: string
}

export interface IndustryProfile {
  industry: Industry
  label: string
  color: string
  objectTypes: string[]
  primaryMetrics: string[]
  riskDrivers: string[]
  recommendedActions: string[]
}

export interface EmergencyIncident {
  id: string
  alarmNo: string
  title: string
  incidentType: string
  severity: EmergencySeverity
  status: EmergencyIncidentStatus
  occurredAt: string
  closedAt?: string
  district: string
  street: string
  location: {
    lng: number
    lat: number
  }
  unit: RiskObject
  sourceSystems: string[]
  commandLevel: string
  commander: string
  trapped: number
  casualties: number
  waterPressure: string
  smokeSpread: string
  responseMinutes: number
  forces: {
    stations: number
    vehicles: number
    firefighters: number
    rescueTeams: string[]
  }
  progress: number
  measures: string[]
  timeline: Array<{
    time: string
    text: string
  }>
}

export interface FireInspectionRecord {
  id: string
  unitId: string
  date: string
  sourceSystem: string
  inspectionType: string
  result: '合格' | '发现隐患' | '责令整改' | '复查通过'
  issues: string[]
  rectified: boolean
  responsibleTeam: string
}

export interface SecurityTask {
  id: string
  name: string
  taskType: SecurityTaskType
  status: '筹备中' | '执行中' | '已结束'
  dateRange: string
  center: {
    lng: number
    lat: number
  }
  venueName: string
  district: string
  rings: number[]
  description: string
}

export interface SecurityForcePoint {
  id: string
  taskId: string
  name: string
  forceType: SecurityForceType
  district: string
  address: string
  location: {
    lng: number
    lat: number
  }
  status: SecurityForceStatus
  editable: boolean
  personnel: number
  vehicles: number
  equipment: string[]
  commander: string
  contactChannel: string
  coverageRadius: number
  liveFeed: {
    status: 'online' | 'offline'
    title: string
    snapshotTone: 'red' | 'blue' | 'cyan' | 'gold'
  }
}

export interface SecurityLayerState {
  fireStations: boolean
  mobileStations: boolean
  gridPatrols: boolean
  eventForces: boolean
  riskObjects: boolean
  securityRings: boolean
}
