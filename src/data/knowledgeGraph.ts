import type {
  DistrictShape,
  EmergencyIncident,
  FireInspectionRecord,
  IndustryProfile,
  KnowledgeGraphEdge,
  KnowledgeGraphEdgeRelation,
  KnowledgeGraphNode,
  KnowledgeGraphSnapshot,
  LayerDefinition,
  RiskObject,
  SecurityForcePoint,
  SecurityTask,
} from '../types'

interface BuildKnowledgeGraphInput {
  districts: DistrictShape[]
  layers: LayerDefinition[]
  riskObjects: RiskObject[]
  industryUnits: RiskObject[]
  industryProfiles: IndustryProfile[]
  incidents: EmergencyIncident[]
  inspectionRecords: FireInspectionRecord[]
  securityTasks: SecurityTask[]
  securityForces: SecurityForcePoint[]
}

const moduleNodes = [
  ['module-overview', '总览', '全市风险态势与跨模块态势汇聚'],
  ['module-district', '行政区专题', '行政区、街镇与监督治理画像'],
  ['module-industry', '行业专题', '行业单位、业态指标与同类对象对比'],
  ['module-emergency', '应急处置', '实时警情、历史复现与单位检查记录'],
  ['module-security', '安保模式', '安保任务、力量布防与圈层风险'],
  ['module-kg', '知识图谱', '主数据、元数据和跨模块关系网络'],
] as const

const moduleSource = '功能模块配置'
const prototypeSources = {
  risk: '原型风险对象库',
  industry: '行业单位样本库',
  layer: '图层配置元数据',
  district: '上海行政区元数据',
  emergency: '智能接处警系统',
  inspection: '消防监督检查系统',
  security: '安保勤务模拟数据',
  iot: '物联感知平台',
}

interface ObjectFireProfileContext {
  inspections: FireInspectionRecord[]
  incidents: EmergencyIncident[]
}

export function buildKnowledgeGraphSnapshot(input: BuildKnowledgeGraphInput): KnowledgeGraphSnapshot {
  const nodes = new Map<string, KnowledgeGraphNode>()
  const edges = new Map<string, KnowledgeGraphEdge>()

  const addNode = (node: Omit<KnowledgeGraphNode, 'density'> & { density?: number }) => {
    const existing = nodes.get(node.id)
    if (existing) {
      existing.sourceSystems = unique([...existing.sourceSystems, ...node.sourceSystems])
      existing.sourceRefs = unique([...existing.sourceRefs, ...node.sourceRefs])
      existing.metadata = { ...existing.metadata, ...node.metadata }
      existing.density = Math.max(existing.density, node.density || 1)
      return existing
    }
    const next = { ...node, density: node.density || 1 }
    nodes.set(next.id, next)
    return next
  }

  const addEdge = (edge: Omit<KnowledgeGraphEdge, 'id'> & { id?: string }) => {
    const id = edge.id || `${edge.source}__${edge.relation}__${edge.target}`
    const existing = edges.get(id)
    if (existing) {
      existing.weight = Math.max(existing.weight, edge.weight)
      existing.evidenceCount += edge.evidenceCount
      existing.sourceSystems = unique([...existing.sourceSystems, ...edge.sourceSystems])
      existing.metadata = { ...existing.metadata, ...edge.metadata }
      return existing
    }
    const next = { ...edge, id }
    edges.set(id, next)
    return next
  }

  moduleNodes.forEach(([id, label, description]) => {
    addNode({
      id,
      label,
      type: 'module',
      category: '功能模块',
      sourceSystems: [moduleSource],
      sourceRefs: [id],
      metadata: { description },
    })
    addEdge({
      source: id,
      target: 'module-kg',
      relation: '支撑研判',
      weight: id === 'module-kg' ? 1 : 2,
      sourceSystems: [moduleSource],
      evidenceCount: 1,
      metadata: { description: '模块关系汇入知识图谱' },
    })
  })

  input.districts.forEach((district) => {
    addNode({
      id: districtId(district.name),
      label: district.name,
      type: 'district',
      category: '行政区',
      sourceSystems: [prototypeSources.district],
      sourceRefs: [`district:${district.name}`],
      density: district.riskScore >= 80 ? 5 : 3,
      metadata: {
        riskScore: district.riskScore,
        closedRate: district.closedRate,
        iotOnlineRate: district.iotOnlineRate,
      },
    })
    addEdge(edge('module-district', districtId(district.name), '属于模块', 2, [prototypeSources.district], 1))
  })

  input.industryProfiles.forEach((profile) => {
    addNode({
      id: industryId(profile.industry),
      label: profile.industry,
      type: 'industry',
      category: '行业',
      sourceSystems: [prototypeSources.industry],
      sourceRefs: [`industry:${profile.industry}`],
      metadata: {
        label: profile.label,
        primaryMetrics: profile.primaryMetrics,
        riskDrivers: profile.riskDrivers,
      },
    })
    addEdge(edge('module-industry', industryId(profile.industry), '属于模块', 2, [prototypeSources.industry], profile.primaryMetrics.length))
  })

  input.layers.forEach((layer) => {
    addNode({
      id: layerId(layer.id),
      label: layer.name,
      type: 'layer',
      category: '图层',
      sourceSystems: [prototypeSources.layer],
      sourceRefs: [`layer:${layer.id}`],
      density: layer.visible ? 3 : 1,
      metadata: {
        category: layer.category,
        renderMode: layer.renderMode,
        visible: layer.visible,
      },
    })
    addEdge(edge('module-overview', layerId(layer.id), '属于模块', 2, [prototypeSources.layer], 1))
    layer.filters.industries.forEach((industry) => {
      addEdge(edge(layerId(layer.id), industryId(industry), '支撑研判', 2.4, [prototypeSources.layer], 1))
    })
  })

  const inspectionsByUnit = groupBy(input.inspectionRecords, (record) => record.unitId)
  const incidentsByUnit = groupBy(input.incidents, (incident) => incident.unit.id)
  const allObjects = dedupeObjects([...input.riskObjects, ...input.industryUnits])
  allObjects.forEach((object) => {
    addRiskObject(
      addNode,
      addEdge,
      object,
      object.id.startsWith('u-') ? prototypeSources.industry : prototypeSources.risk,
      {
        inspections: inspectionsByUnit.get(object.id) || [],
        incidents: incidentsByUnit.get(object.id) || [],
      },
    )
  })

  input.incidents.forEach((incident) => {
    const nodeId = incidentId(incident.id)
    addNode({
      id: nodeId,
      label: incident.title,
      type: 'incident',
      category: '警情',
      sourceSystems: incident.sourceSystems.length ? incident.sourceSystems : [prototypeSources.emergency],
      sourceRefs: [`incident:${incident.id}`, incident.alarmNo],
      density: incident.severity === '重大风险' ? 7 : incident.severity === '较大' ? 5 : 3,
      linkedEntityId: incident.id,
      metadata: {
        alarmNo: incident.alarmNo,
        status: incident.status,
        commandLevel: incident.commandLevel,
        occurredAt: incident.occurredAt,
        unit: incident.unit.name,
      },
    })
    addEdge(edge('module-emergency', nodeId, '属于模块', 3, incident.sourceSystems, 1))
    addEdge(edge(nodeId, districtId(incident.district), '位于', 3, incident.sourceSystems, 1))
    addEdge(edge(nodeId, riskObjectId(incident.unit.id), '处置对象', 5, incident.sourceSystems, incident.timeline.length))
    addRiskObject(addNode, addEdge, incident.unit, prototypeSources.emergency, {
      inspections: inspectionsByUnit.get(incident.unit.id) || [],
      incidents: incidentsByUnit.get(incident.unit.id) || [],
    })
    incident.sourceSystems.forEach((source) => addSourceSystem(addNode, addEdge, nodeId, source))
    incident.measures.forEach((measure) => {
      const metricNodeId = metricId(measure)
      addNode({
        id: metricNodeId,
        label: measure,
        type: 'metric',
        category: '处置措施',
        sourceSystems: incident.sourceSystems,
        sourceRefs: [`incident:${incident.id}`],
        density: 2,
        metadata: { incident: incident.title },
      })
      addEdge(edge(nodeId, metricNodeId, '支撑研判', 1.8, incident.sourceSystems, 1))
    })
  })

  input.inspectionRecords.forEach((record) => {
    const nodeId = inspectionId(record.id)
    addNode({
      id: nodeId,
      label: `${record.inspectionType} ${record.result}`,
      type: 'inspection',
      category: '检查记录',
      sourceSystems: [record.sourceSystem],
      sourceRefs: [`inspection:${record.id}`, `unit:${record.unitId}`],
      density: record.result === '责令整改' || record.result === '发现隐患' ? 4 : 2,
      linkedEntityId: record.unitId,
      metadata: {
        date: record.date,
        result: record.result,
        rectified: record.rectified,
        responsibleTeam: record.responsibleTeam,
        issues: record.issues,
      },
    })
    addEdge(edge('module-emergency', nodeId, '关联隐患', 2.6, [record.sourceSystem], record.issues.length || 1))
    addEdge(edge(nodeId, riskObjectId(record.unitId), '关联隐患', 3.4, [record.sourceSystem], record.issues.length || 1))
    addSourceSystem(addNode, addEdge, nodeId, record.sourceSystem)
  })

  input.securityTasks.forEach((task) => {
    const nodeId = securityTaskId(task.id)
    addNode({
      id: nodeId,
      label: task.name,
      type: 'security-task',
      category: '安保任务',
      sourceSystems: [prototypeSources.security],
      sourceRefs: [`securityTask:${task.id}`],
      density: task.status === '执行中' ? 5 : 3,
      linkedEntityId: task.id,
      metadata: {
        taskType: task.taskType,
        status: task.status,
        dateRange: task.dateRange,
        venueName: task.venueName,
        district: task.district,
      },
    })
    addEdge(edge('module-security', nodeId, '属于模块', 3, [prototypeSources.security], 1))
    if (task.district !== '全市') addEdge(edge(nodeId, districtId(task.district), '覆盖区域', 3, [prototypeSources.security], task.rings.length || 1))
  })

  input.securityForces.forEach((force) => {
    const nodeId = securityForceId(force.id)
    addNode({
      id: nodeId,
      label: force.name,
      type: 'security-force',
      category: '安保力量',
      sourceSystems: [prototypeSources.security],
      sourceRefs: [`securityForce:${force.id}`, `task:${force.taskId}`],
      density: force.status === '驻防中' || force.status === '处置中' ? 5 : 3,
      linkedEntityId: force.id,
      metadata: {
        forceType: force.forceType,
        status: force.status,
        personnel: force.personnel,
        vehicles: force.vehicles,
        commander: force.commander,
        liveFeed: force.liveFeed.status,
      },
    })
    addEdge(edge(securityTaskId(force.taskId), nodeId, '调度力量', 4, [prototypeSources.security], force.personnel + force.vehicles))
    addEdge(edge(nodeId, districtId(force.district), '覆盖区域', 2.8, [prototypeSources.security], 1))
  })

  const signalBuckets = new Map<string, string[]>()
  allObjects.forEach((object) => {
    object.signals.forEach((signal) => {
      const list = signalBuckets.get(signal) || []
      list.push(riskObjectId(object.id))
      signalBuckets.set(signal, list)
    })
  })
  signalBuckets.forEach((objectIds, signal) => {
    if (objectIds.length < 2) return
    objectIds.slice(0, 8).forEach((objectId) => {
      addEdge(edge(signalId(signal), objectId, '共享风险信号', Math.min(5, 1.4 + objectIds.length * 0.5), [prototypeSources.iot], objectIds.length))
    })
  })

  const degree = new Map<string, number>()
  edges.forEach((item) => {
    degree.set(item.source, (degree.get(item.source) || 0) + item.weight)
    degree.set(item.target, (degree.get(item.target) || 0) + item.weight)
  })
  nodes.forEach((node) => {
    node.density = clamp(Math.round((node.density + (degree.get(node.id) || 0)) * 10) / 10, 1, 12)
  })

  const nodeList = [...nodes.values()].sort((a, b) => b.density - a.density)
  const edgeList = [...edges.values()].sort((a, b) => b.weight - a.weight)
  const sourceSystemCount = new Set(nodeList.flatMap((node) => node.sourceSystems)).size

  return {
    nodes: nodeList,
    edges: edgeList,
    stats: {
      nodeCount: nodeList.length,
      edgeCount: edgeList.length,
      sourceSystemCount,
      highDensityNodeCount: nodeList.filter((node) => node.density >= 8).length,
    },
    generatedAt: new Date().toLocaleString(),
  }
}

function addRiskObject(
  addNode: (node: Omit<KnowledgeGraphNode, 'density'> & { density?: number }) => KnowledgeGraphNode,
  addEdge: (edge: Omit<KnowledgeGraphEdge, 'id'> & { id?: string }) => KnowledgeGraphEdge,
  object: RiskObject,
  sourceSystem: string,
  profile: ObjectFireProfileContext = { inspections: [], incidents: [] },
) {
  const objectNodeId = riskObjectId(object.id)
  addNode({
    id: objectNodeId,
    label: object.name,
    type: 'risk-object',
    category: object.id.startsWith('u-') ? '行业单位' : '风险对象',
    sourceSystems: [object.sourceNote || sourceSystem],
    sourceRefs: [`riskObject:${object.id}`, `district:${object.district}`, `industry:${object.industry}`],
    density: object.riskLevel === 'critical' ? 6 : object.riskLevel === 'high' ? 4 : 2,
    linkedEntityId: object.id,
    metadata: {
      district: object.district,
      street: object.street,
      industry: object.industry,
      objectType: object.objectType,
      riskLevel: object.riskLevel,
      status: object.status,
      updatedAt: object.updatedAt,
      signals: object.signals,
    },
  })
  addEdge(edge(objectNodeId, districtId(object.district), '位于', 3, [sourceSystem], 1))
  addEdge(edge(objectNodeId, streetId(object.district, object.street), '位于', 2.4, [sourceSystem], 1))
  addEdge(edge(objectNodeId, industryId(object.industry), '属于行业', 3, [sourceSystem], 1))
  addEdge(edge('module-overview', objectNodeId, '属于模块', 1.8, [sourceSystem], 1))
  if (object.id.startsWith('u-')) addEdge(edge('module-industry', objectNodeId, '属于模块', 3, [sourceSystem], 1))

  addNode({
    id: streetId(object.district, object.street),
    label: object.street,
    type: 'street',
    category: '街镇',
    sourceSystems: [prototypeSources.district],
    sourceRefs: [`street:${object.district}:${object.street}`],
    metadata: { district: object.district },
  })
  addEdge(edge(streetId(object.district, object.street), districtId(object.district), '位于', 2, [prototypeSources.district], 1))

  object.signals.forEach((signal) => {
    addNode({
      id: signalId(signal),
      label: signal,
      type: 'risk-signal',
      category: '风险信号',
      sourceSystems: [prototypeSources.iot],
      sourceRefs: [`signal:${signal}`],
      density: object.riskLevel === 'critical' ? 4 : 2,
      metadata: { signal },
    })
    addEdge(edge(objectNodeId, signalId(signal), '触发', object.riskLevel === 'critical' ? 4 : 2.6, [prototypeSources.iot, sourceSystem], 1))
  })

  addObjectFireProfile(addNode, addEdge, object, objectNodeId, sourceSystem, profile)
}

function addObjectFireProfile(
  addNode: (node: Omit<KnowledgeGraphNode, 'density'> & { density?: number }) => KnowledgeGraphNode,
  addEdge: (edge: Omit<KnowledgeGraphEdge, 'id'> & { id?: string }) => KnowledgeGraphEdge,
  object: RiskObject,
  objectNodeId: string,
  sourceSystem: string,
  profile: ObjectFireProfileContext,
) {
  const inspectionNodeId = inspectionSummaryId(object.id)
  const fireHistoryNodeId = fireHistoryId(object.id)
  const iotProfileNodeId = iotProfileId(object.id)
  const issueCount = profile.inspections.reduce((sum, record) => sum + record.issues.length, 0)
  const unrectifiedCount = profile.inspections.filter((record) => !record.rectified).length
  const latestInspection = [...profile.inspections].sort((a, b) => b.date.localeCompare(a.date))[0]
  const latestIncident = [...profile.incidents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]
  const criticalSignals = object.signals.filter((signal) => /故障|报警|告警|逾期|投诉|占用|温升|失效|风险/.test(signal))
  const iotOnlineRate = object.riskLevel === 'critical' ? 86 : object.riskLevel === 'high' ? 91 : 96

  addNode({
    id: inspectionNodeId,
    label: `${object.name}监督检查画像`,
    type: 'inspection-summary',
    category: '消防属性',
    sourceSystems: [prototypeSources.inspection],
    sourceRefs: [`unit:${object.id}`, ...profile.inspections.map((record) => `inspection:${record.id}`)],
    density: profile.inspections.length ? 4 + Math.min(4, issueCount + unrectifiedCount) : 2,
    linkedEntityId: object.id,
    metadata: {
      unit: object.name,
      inspectionCount: profile.inspections.length,
      issueCount,
      unrectifiedCount,
      latestDate: latestInspection?.date || '暂无记录',
      latestResult: latestInspection?.result || '暂无记录',
      responsibleTeam: latestInspection?.responsibleTeam || '待接入监督系统',
      sourceModule: '单位消防画像',
    },
  })
  addEdge(edge(objectNodeId, inspectionNodeId, '监督检查', issueCount || 1.6, [prototypeSources.inspection, sourceSystem], Math.max(1, profile.inspections.length)))

  addNode({
    id: fireHistoryNodeId,
    label: `${object.name}历史火灾画像`,
    type: 'fire-history',
    category: '消防属性',
    sourceSystems: [prototypeSources.emergency],
    sourceRefs: [`unit:${object.id}`, ...profile.incidents.map((incident) => `incident:${incident.id}`)],
    density: profile.incidents.length ? 5 + profile.incidents.length : 1.8,
    linkedEntityId: object.id,
    metadata: {
      unit: object.name,
      incidentCount: profile.incidents.length,
      latestIncident: latestIncident?.title || '暂无历史火灾警情',
      latestStatus: latestIncident?.status || '无',
      latestOccurredAt: latestIncident?.occurredAt || '无',
      maxSeverity: latestIncident?.severity || '无',
      sourceModule: '单位消防画像',
    },
  })
  addEdge(edge(objectNodeId, fireHistoryNodeId, '历史火灾', profile.incidents.length ? 4.4 : 1.4, [prototypeSources.emergency, sourceSystem], Math.max(1, profile.incidents.length)))

  addNode({
    id: iotProfileNodeId,
    label: `${object.name}消防物联网画像`,
    type: 'iot-profile',
    category: '消防属性',
    sourceSystems: [prototypeSources.iot],
    sourceRefs: [`unit:${object.id}`, ...object.signals.map((signal) => `signal:${signal}`)],
    density: 3 + Math.min(5, object.signals.length + criticalSignals.length),
    linkedEntityId: object.id,
    metadata: {
      unit: object.name,
      onlineRate: iotOnlineRate,
      deviceCount: estimateDeviceCount(object),
      abnormalSignalCount: criticalSignals.length,
      signalSummary: object.signals,
      sourceModule: '单位消防画像',
    },
  })
  addEdge(edge(objectNodeId, iotProfileNodeId, '消防画像', object.signals.length ? 3.6 : 1.4, [prototypeSources.iot, sourceSystem], Math.max(1, object.signals.length)))

  inferIotDevices(object).forEach((device, index) => {
    const deviceNodeId = iotDeviceId(object.id, device.name)
    addNode({
      id: deviceNodeId,
      label: device.name,
      type: 'iot-device',
      category: '消防物联网设备',
      sourceSystems: [prototypeSources.iot],
      sourceRefs: [`unit:${object.id}`, `iotDevice:${slug(device.name)}`],
      density: device.status === '异常' ? 4 : device.status === '离线' ? 3.5 : 2,
      linkedEntityId: object.id,
      metadata: {
        unit: object.name,
        deviceType: device.type,
        status: device.status,
        signal: device.signal,
        lastSeen: object.updatedAt,
        sourceModule: '单位消防画像',
      },
    })
    addEdge(edge(iotProfileNodeId, deviceNodeId, '物联设备', device.status === '异常' ? 3.8 : 2.2, [prototypeSources.iot], index + 1))
  })
}

function addSourceSystem(
  addNode: (node: Omit<KnowledgeGraphNode, 'density'> & { density?: number }) => KnowledgeGraphNode,
  addEdge: (edge: Omit<KnowledgeGraphEdge, 'id'> & { id?: string }) => KnowledgeGraphEdge,
  targetNodeId: string,
  sourceSystem: string,
) {
  const nodeId = sourceId(sourceSystem)
  addNode({
    id: nodeId,
    label: sourceSystem,
    type: 'source-system',
    category: '来源系统',
    sourceSystems: [sourceSystem],
    sourceRefs: [`source:${sourceSystem}`],
    density: 4,
    metadata: { sourceSystem },
  })
  addEdge(edge(targetNodeId, nodeId, '来源于', 3.2, [sourceSystem], 1))
}

function edge(
  source: string,
  target: string,
  relation: KnowledgeGraphEdgeRelation,
  weight: number,
  sourceSystems: string[],
  evidenceCount: number,
) {
  return {
    source,
    target,
    relation,
    weight,
    sourceSystems: sourceSystems.length ? unique(sourceSystems) : ['原型数据'],
    evidenceCount,
    metadata: {},
  }
}

function dedupeObjects(objects: RiskObject[]) {
  const seen = new Map<string, RiskObject>()
  objects.forEach((object) => seen.set(object.id, object))
  return [...seen.values()]
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const grouped = new Map<string, T[]>()
  items.forEach((item) => {
    const key = getKey(item)
    grouped.set(key, [...(grouped.get(key) || []), item])
  })
  return grouped
}

function estimateDeviceCount(object: RiskObject) {
  const industryBase: Partial<Record<RiskObject['industry'], number>> = {
    高层建筑: 128,
    商业综合体: 118,
    医疗机构: 96,
    厂房仓库: 82,
    轨道交通: 104,
    地下空间: 76,
    人员密集场所: 88,
    新能源汽车: 54,
    电动自行车: 38,
    燃气危化: 72,
    施工动火: 24,
  }
  const base = industryBase[object.industry] || 42
  return base + object.signals.length * 6 + (object.riskLevel === 'critical' ? 18 : object.riskLevel === 'high' ? 10 : 4)
}

function inferIotDevices(object: RiskObject) {
  const defaults = [
    { name: `${object.name}火灾自动报警主机`, type: '火灾自动报警', signal: object.signals[0] || '运行正常' },
    { name: `${object.name}消防水系统压力监测`, type: '消防给水', signal: object.signals[1] || '压力稳定' },
    { name: `${object.name}疏散通道视频巡检`, type: '视频 AI 巡检', signal: object.signals[2] || '通道正常' },
  ]
  const industryDevices: Partial<Record<RiskObject['industry'], Array<{ name: string; type: string; signal: string }>>> = {
    高层建筑: [{ name: `${object.name}防排烟联动监测`, type: '防排烟系统', signal: object.signals.find((item) => item.includes('排烟')) || '联动状态待复核' }],
    商业综合体: [{ name: `${object.name}客流热力感知`, type: '客流监测', signal: object.signals.find((item) => item.includes('客流')) || '客流平稳' }],
    医疗机构: [{ name: `${object.name}医用气体区域监测`, type: '重点部位监测', signal: object.signals.find((item) => item.includes('气体')) || '重点区域在线' }],
    厂房仓库: [{ name: `${object.name}电气火灾监测`, type: '电气火灾监控', signal: object.signals.find((item) => item.includes('充电') || item.includes('温升')) || '电气回路正常' }],
    轨道交通: [{ name: `${object.name}站厅客流密度监测`, type: '客流监测', signal: object.signals.find((item) => item.includes('客流')) || '客流平稳' }],
    地下空间: [{ name: `${object.name}排烟风机状态监测`, type: '防排烟系统', signal: object.signals.find((item) => item.includes('排烟')) || '排烟状态在线' }],
    新能源汽车: [{ name: `${object.name}充电设施温度监测`, type: '充换电设施监测', signal: object.signals.find((item) => item.includes('温升') || item.includes('充电')) || '温度正常' }],
    电动自行车: [{ name: `${object.name}集中充电棚烟温监测`, type: '烟温复合探测', signal: object.signals.find((item) => item.includes('充电') || item.includes('报警')) || '探测器在线' }],
    燃气危化: [{ name: `${object.name}可燃气体探测器`, type: '燃气危化监测', signal: object.signals.find((item) => item.includes('危险') || item.includes('环境')) || '气体浓度正常' }],
  }
  return uniqueDevices([...defaults, ...(industryDevices[object.industry] || [])]).slice(0, 4).map((device) => ({
    ...device,
    status: device.signal.match(/故障|报警|告警|逾期|投诉|占用|温升|失败|离线|异常/) ? '异常' : device.signal.includes('离线') ? '离线' : '在线',
  }))
}

function uniqueDevices<T extends { name: string }>(devices: T[]) {
  const seen = new Map<string, T>()
  devices.forEach((device) => seen.set(device.name, device))
  return [...seen.values()]
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function slug(value: string) {
  return value.replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '').toLowerCase()
}

function districtId(name: string) {
  return `district:${name}`
}

function streetId(district: string, street: string) {
  return `street:${district}:${street}`
}

function industryId(name: string) {
  return `industry:${name}`
}

function layerId(id: string) {
  return `layer:${id}`
}

function riskObjectId(id: string) {
  return `risk:${id}`
}

function incidentId(id: string) {
  return `incident:${id}`
}

function inspectionId(id: string) {
  return `inspection:${id}`
}

function securityTaskId(id: string) {
  return `security-task:${id}`
}

function securityForceId(id: string) {
  return `security-force:${id}`
}

function signalId(signal: string) {
  return `signal:${slug(signal)}`
}

function sourceId(source: string) {
  return `source:${slug(source)}`
}

function metricId(metric: string) {
  return `metric:${slug(metric).slice(0, 36)}`
}

function inspectionSummaryId(id: string) {
  return `inspection-summary:${id}`
}

function fireHistoryId(id: string) {
  return `fire-history:${id}`
}

function iotProfileId(id: string) {
  return `iot-profile:${id}`
}

function iotDeviceId(objectId: string, deviceName: string) {
  return `iot-device:${objectId}:${slug(deviceName).slice(0, 42)}`
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
