import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts'
import type { KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeGraphSnapshot } from '../types'

interface KnowledgeGraphFilters {
  nodeTypes: string[]
  relations: string[]
  minDensity: number
}

interface KnowledgeGraphViewProps {
  snapshot: KnowledgeGraphSnapshot
  filters: KnowledgeGraphFilters
  search: string
  selectedNodeId: string
  selectedEdgeId: string
  onSelectNode: (node: KnowledgeGraphNode) => void
  onSelectEdge: (edge: KnowledgeGraphEdge) => void
}

const nodeColors: Record<string, string> = {
  module: '#66d9ff',
  'source-system': '#b48cff',
  district: '#2ff8e6',
  street: '#7bdcff',
  industry: '#ffd166',
  'risk-object': '#ff4d5d',
  incident: '#ff8f3d',
  inspection: '#39d98a',
  'inspection-summary': '#69f0ae',
  'fire-history': '#ff6b35',
  'iot-profile': '#00e5ff',
  'iot-device': '#5cf2ff',
  'security-task': '#5d9cff',
  'security-force': '#00f0ff',
  layer: '#a6e22e',
  'risk-signal': '#ff3b30',
  metric: '#f2fbff',
}

export function KnowledgeGraphView({
  snapshot,
  filters,
  search,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
}: KnowledgeGraphViewProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const filtered = useMemo(() => filterGraph(snapshot, filters, search, selectedNodeId), [filters, search, selectedNodeId, snapshot])

  useEffect(() => {
    if (!ref.current) return

    const chart = echarts.init(ref.current)
    const nodeById = new Map(filtered.nodes.map((node) => [node.id, node]))
    const edgeById = new Map(filtered.edges.map((edge) => [edge.id, edge]))

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: 'rgba(4, 22, 39, 0.94)',
        borderColor: '#1f9bd1',
        textStyle: { color: '#e9f7ff' },
        formatter: (params: { dataType?: string; data?: Record<string, unknown> }) => {
          if (params.dataType === 'edge') {
            const edge = edgeById.get(String(params.data?.id))
            if (!edge) return ''
            return `${edge.relation}<br/>权重 ${edge.weight.toFixed(1)} · 证据 ${edge.evidenceCount}<br/>来源 ${edge.sourceSystems.join('、')}`
          }
          const node = nodeById.get(String(params.data?.id))
          if (!node) return ''
          return `${node.label}<br/>${node.category} · 密度 ${node.density.toFixed(1)}<br/>来源 ${node.sourceSystems.slice(0, 3).join('、')}`
        },
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          draggable: true,
          focusNodeAdjacency: true,
          animationDurationUpdate: 450,
          force: {
            repulsion: 190,
            gravity: 0.08,
            edgeLength: [64, 180],
            friction: 0.36,
          },
          label: {
            show: true,
            color: '#dff7ff',
            fontSize: 10,
            position: 'right',
            formatter: (params: { data?: { name?: string } }) => params.data?.name || '',
          },
          edgeLabel: {
            show: false,
          },
          lineStyle: {
            curveness: 0.18,
            opacity: 0.44,
          },
          emphasis: {
            scale: true,
            label: { show: true, fontSize: 12 },
            lineStyle: { opacity: 0.95 },
          },
          data: filtered.nodes.map((node) => ({
            id: node.id,
            name: node.label,
            value: node.density,
            symbolSize: Math.max(18, Math.min(62, 16 + node.density * 3.2)),
            category: node.category,
            itemStyle: {
              color: nodeColors[node.type] || '#66d9ff',
              borderColor: selectedNodeId === node.id ? '#ffffff' : 'rgba(180, 240, 255, 0.7)',
              borderWidth: selectedNodeId === node.id ? 3 : 1,
              shadowBlur: selectedNodeId === node.id ? 24 : 12,
              shadowColor: nodeColors[node.type] || '#66d9ff',
            },
          })),
          links: filtered.edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            value: edge.weight,
            lineStyle: {
              color: selectedEdgeId === edge.id ? '#ff4d5d' : 'rgba(102, 217, 255, 0.52)',
              width: Math.max(1, Math.min(6, edge.weight)),
              opacity: selectedEdgeId === edge.id ? 0.95 : 0.42,
            },
          })),
        },
      ],
    })

    chart.on('click', (params) => {
      if (params.dataType === 'edge') {
        const edge = edgeById.get(String((params.data as { id?: string })?.id))
        if (edge) onSelectEdge(edge)
        return
      }
      const node = nodeById.get(String((params.data as { id?: string })?.id))
      if (node) onSelectNode(node)
    })

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)

    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [filtered, onSelectEdge, onSelectNode, selectedEdgeId, selectedNodeId])

  return (
    <div className="knowledge-graph-shell">
      <div className="knowledge-graph-toolbar">
        <span>{filtered.focusLabel ? `节点详情：${filtered.focusLabel}` : '上海消防风险监测预警知识图谱'}</span>
        <strong>{filtered.nodes.length} 节点 / {filtered.edges.length} 关系</strong>
        {filtered.focusLabel && <em>一跳关系视图</em>}
      </div>
      <div className="knowledge-graph-canvas" ref={ref} />
      <div className="knowledge-graph-legend">
        {['module', 'district', 'industry', 'risk-object', 'inspection-summary', 'fire-history', 'iot-profile', 'iot-device', 'incident', 'security-force', 'source-system'].map((type) => (
          <span key={type}><i style={{ background: nodeColors[type] }} />{typeLabel(type)}</span>
        ))}
      </div>
    </div>
  )
}

function filterGraph(snapshot: KnowledgeGraphSnapshot, filters: KnowledgeGraphFilters, search: string, selectedNodeId: string) {
  const normalized = search.trim().toLowerCase()
  const nodeTypeSet = new Set(filters.nodeTypes)
  const relationSet = new Set(filters.relations)
  const selectedNode = snapshot.nodes.find((node) => node.id === selectedNodeId)
  const relationMatched = (relation: string) => !relationSet.size || relationSet.has(relation)

  if (selectedNode) {
    const focusedEdges = snapshot.edges
      .filter((edge) => relationMatched(edge.relation) && (edge.source === selectedNodeId || edge.target === selectedNodeId))
      .sort((a, b) => b.weight - a.weight || b.evidenceCount - a.evidenceCount)
      .slice(0, 48)
    const focusedIds = new Set([selectedNodeId, ...focusedEdges.flatMap((edge) => [edge.source, edge.target])])
    return {
      nodes: snapshot.nodes.filter((node) => focusedIds.has(node.id)),
      edges: focusedEdges,
      focusLabel: selectedNode.label,
    }
  }

  const nodes = snapshot.nodes.filter((node) => {
    const typeMatched = !nodeTypeSet.size || nodeTypeSet.has(node.type)
    const densityMatched = node.density >= filters.minDensity
    const searchMatched = normalized
      ? `${node.label}${node.category}${node.sourceSystems.join('')}${Object.values(node.metadata).join('')}`.toLowerCase().includes(normalized)
      : true
    return typeMatched && densityMatched && searchMatched
  })
  const visibleIds = new Set(nodes.map((node) => node.id))
  const edges = snapshot.edges.filter((edge) => {
    return relationMatched(edge.relation) && visibleIds.has(edge.source) && visibleIds.has(edge.target)
  })
  const connectedIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]))
  return {
    nodes: normalized ? nodes : nodes.filter((node) => connectedIds.has(node.id) || node.type === 'module').slice(0, 180),
    edges: edges.slice(0, 260),
    focusLabel: '',
  }
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    module: '模块',
    district: '行政区',
    industry: '行业',
    'risk-object': '对象',
    incident: '警情',
    'inspection-summary': '检查画像',
    'fire-history': '火灾历史',
    'iot-profile': '物联画像',
    'iot-device': '物联设备',
    'security-force': '力量',
    'source-system': '来源',
  }
  return labels[type] || type
}
