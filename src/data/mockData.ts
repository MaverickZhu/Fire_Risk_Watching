import type { DistrictShape, LayerDefinition, ModuleCard, RiskObject } from '../types'

export const districtShapes: DistrictShape[] = [
  { name: '崇明区', riskScore: 58, closedRate: 92, iotOnlineRate: 88, center: [121.52, 31.62] },
  { name: '宝山区', riskScore: 74, closedRate: 86, iotOnlineRate: 91, center: [121.49, 31.41] },
  { name: '嘉定区', riskScore: 69, closedRate: 89, iotOnlineRate: 84, center: [121.27, 31.38] },
  { name: '青浦区', riskScore: 63, closedRate: 91, iotOnlineRate: 82, center: [121.12, 31.15] },
  { name: '松江区', riskScore: 72, closedRate: 87, iotOnlineRate: 89, center: [121.23, 31.03] },
  { name: '金山区', riskScore: 61, closedRate: 94, iotOnlineRate: 85, center: [121.34, 30.74] },
  { name: '闵行区', riskScore: 80, closedRate: 83, iotOnlineRate: 92, center: [121.38, 31.12] },
  { name: '奉贤区', riskScore: 67, closedRate: 88, iotOnlineRate: 86, center: [121.47, 30.92] },
  { name: '浦东新区', riskScore: 92, closedRate: 79, iotOnlineRate: 94, center: [121.76, 31.05] },
  { name: '黄浦区', riskScore: 82, closedRate: 84, iotOnlineRate: 93, center: [121.48, 31.23] },
  { name: '徐汇区', riskScore: 78, closedRate: 86, iotOnlineRate: 90, center: [121.44, 31.18] },
  { name: '长宁区', riskScore: 65, closedRate: 91, iotOnlineRate: 88, center: [121.42, 31.22] },
  { name: '静安区', riskScore: 76, closedRate: 87, iotOnlineRate: 91, center: [121.45, 31.25] },
  { name: '普陀区', riskScore: 70, closedRate: 89, iotOnlineRate: 86, center: [121.39, 31.25] },
  { name: '虹口区', riskScore: 73, closedRate: 88, iotOnlineRate: 92, center: [121.49, 31.27] },
  { name: '杨浦区', riskScore: 77, closedRate: 85, iotOnlineRate: 90, center: [121.54, 31.28] },
]

export const layerDefinitions: LayerDefinition[] = [
  { id: 'highrise', name: '高层建筑', category: 'risk', color: '#66d9ff', visible: true, renderMode: 'extrusion', filters: { industries: ['高层建筑'], levels: ['high', 'critical'] } },
  { id: 'factory', name: '厂库房', category: 'risk', color: '#ff7a1a', visible: true, renderMode: 'extrusion', filters: { industries: ['厂房仓库'], levels: ['medium', 'high', 'critical'] } },
  { id: 'medical', name: '医疗机构', category: 'risk', color: '#2ee6c8', visible: true, renderMode: 'pulse', filters: { industries: ['医疗机构'], levels: ['high', 'critical'] } },
  { id: 'commerce', name: '商综/密集', category: 'risk', color: '#ffd166', visible: true, renderMode: 'point-cloud', filters: { industries: ['商业综合体', '人员密集场所'], levels: ['medium', 'high', 'critical'] } },
  { id: 'new-energy', name: '新能源/电动', category: 'iot', color: '#bf7dff', visible: true, renderMode: 'pulse', filters: { industries: ['新能源汽车', '电动自行车'], levels: ['medium', 'high', 'critical'] } },
  { id: 'underground-rail', name: '地下/轨交', category: 'governance', color: '#5d9cff', visible: false, renderMode: 'coverage', filters: { industries: ['地下空间', '轨道交通'], levels: ['medium', 'high', 'critical'] } },
  { id: 'hazmat-hotwork', name: '危化/动火', category: 'risk', color: '#ff3b30', visible: true, renderMode: 'pulse', filters: { industries: ['燃气危化', '施工动火'], levels: ['high', 'critical'] } },
  { id: 'resources', name: '站点/水源/队伍', category: 'resource', color: '#00f0ff', visible: true, renderMode: 'coverage', filters: { industries: ['消防站点', '消防水源', '消防队伍'] } },
]

export const riskObjects: RiskObject[] = [
  { id: 'r-001', name: '陆家嘴超高层综合体', district: '浦东新区', street: '陆家嘴街道', industry: '高层建筑', objectType: '超高层建筑群', riskLevel: 'critical', location: { lng: 121.507, lat: 31.239 }, signals: ['防排烟联动失败', '夜间报警集中', '消防电梯故障'], status: '处置中', updatedAt: '09:48' },
  { id: 'r-002', name: '张江新能源充电站群', district: '浦东新区', street: '张江镇', industry: '新能源汽车', objectType: '充换电设施', riskLevel: 'high', location: { lng: 121.598, lat: 31.204 }, signals: ['充电桩离线', '配电回路温升', '电子围栏告警'], status: '预警', updatedAt: '09:44' },
  { id: 'r-003', name: '虹桥医疗中心', district: '闵行区', street: '新虹街道', industry: '医疗机构', objectType: '三级医疗机构', riskLevel: 'high', location: { lng: 121.318, lat: 31.196 }, signals: ['夜间巡查下降', '医用气体区域用电负荷高', '患者转运预案待复核'], status: '监测中', updatedAt: '09:39' },
  { id: 'r-004', name: '宝山仓储物流园', district: '宝山区', street: '月浦镇', industry: '厂房仓库', objectType: '厂库房群落', riskLevel: 'critical', location: { lng: 121.407, lat: 31.414 }, signals: ['同片区多点告警', '叉车充电集中', '整改逾期'], status: '处置中', updatedAt: '09:36' },
  { id: 'r-005', name: '南京东路商圈', district: '黄浦区', street: '南京东路街道', industry: '人员密集场所', objectType: '商圈街区', riskLevel: 'high', location: { lng: 121.481, lat: 31.238 }, signals: ['客流密度升高', '通道占用投诉', '临时活动备案'], status: '预警', updatedAt: '09:33' },
  { id: 'r-006', name: '松江工业区动火作业面', district: '松江区', street: '中山街道', industry: '施工动火', objectType: '检维修作业', riskLevel: 'high', location: { lng: 121.25, lat: 31.02 }, signals: ['夜间施工', '外包人员资质待核', '可燃物清理未闭环'], status: '监测中', updatedAt: '09:25' },
  { id: 'r-007', name: '嘉定微型消防站联勤点', district: '嘉定区', street: '安亭镇', industry: '消防队伍', objectType: '基层响应力量', riskLevel: 'medium', location: { lng: 121.164, lat: 31.294 }, signals: ['装备适配良好', '联动演练完成', '响应圈覆盖'], status: '已闭环', updatedAt: '09:20' },
  { id: 'r-008', name: '徐汇老旧小区电动自行车点', district: '徐汇区', street: '湖南路街道', industry: '电动自行车', objectType: '小区集中停放点', riskLevel: 'critical', location: { lng: 121.439, lat: 31.208 }, signals: ['入户充电投诉集中', '夜间报警', '楼道堆物复发'], status: '处置中', updatedAt: '09:18' },
  { id: 'r-009', name: '临港危化仓储单元', district: '浦东新区', street: '南汇新城镇', industry: '燃气危化', objectType: '危化仓储', riskLevel: 'critical', location: { lng: 121.91, lat: 30.895 }, signals: ['危险品接触风险', '水源保障需复核', '环境监测联动'], status: '预警', updatedAt: '09:10' },
  { id: 'r-010', name: '五角场地下空间', district: '杨浦区', street: '五角场街道', industry: '地下空间', objectType: '地下商业空间', riskLevel: 'high', location: { lng: 121.514, lat: 31.303 }, signals: ['疏散路径复杂', '排烟系统故障', '人员聚集'], status: '预警', updatedAt: '09:06' },
  { id: 'r-011', name: '金山消防水源监测点', district: '金山区', street: '山阳镇', industry: '消防水源', objectType: '市政消火栓', riskLevel: 'medium', location: { lng: 121.344, lat: 30.742 }, signals: ['压力稳定', '巡检完成', '远程监测在线'], status: '已闭环', updatedAt: '08:59' },
  { id: 'r-012', name: '奉贤厂库房片区', district: '奉贤区', street: '奉城镇', industry: '厂房仓库', objectType: '产业园区', riskLevel: 'high', location: { lng: 121.65, lat: 30.91 }, signals: ['包装材料负荷高', '夜间值守薄弱', '外包外租边界不清'], status: '监测中', updatedAt: '08:53' },
]

export const moduleCards: ModuleCard[] = [
  { id: 'overview', title: '全市风险态势', area: 'left', pinned: true, collapsed: false },
  { id: 'districts', title: '行政区风险排行', area: 'left', pinned: false, collapsed: false },
  { id: 'layers', title: '图层编排', area: 'left', pinned: false, collapsed: false },
  { id: 'ai', title: 'AI 综合研判', area: 'right', pinned: true, collapsed: false },
  { id: 'actions', title: '处置建议', area: 'right', pinned: false, collapsed: false },
  { id: 'events', title: '告警闭环时间轴', area: 'bottom', pinned: true, collapsed: false },
  { id: 'industry', title: '行业专题矩阵', area: 'wide-left', pinned: false, collapsed: false },
  { id: 'resources', title: '应急资源覆盖', area: 'wide-right', pinned: false, collapsed: false },
]

export const knowledgeSnippets = [
  '动态预警应综合趋势变化、阈值越限、重复告警、长时间离线、同一区域多点异常和整改逾期。',
  '高层建筑应结合建筑高度、人员密度、业态混合、联动设备可用率和外部救援展开条件修正风险。',
  '厂库房群落需要把单体隐患、园区道路、水源保障、相邻建筑防火间距和共性问题一并研判。',
  '医疗机构风险等级需考虑夜间留宿、患者行动能力、医用气体、连续医疗服务和患者转运预案。',
]
