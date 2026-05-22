import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { DistrictShape, IndustryScope, IndustrySelection, LayerDefinition, RiskObject, SecurityTask } from '../types'
import shanghaiGeoJson from '../data/geo/shanghai-districts.json'
import streetTownGeoJson from '../data/geo/shanghai-street-towns.json'

interface ThreeRiskMapProps {
  districts: DistrictShape[]
  layers: LayerDefinition[]
  objects: RiskObject[]
  selectedDistrict: string
  mapMode: 'overview' | 'district' | 'industry' | 'emergency' | 'security'
  selectedIndustry?: IndustrySelection
  industryScope?: IndustryScope
  selectedObjectId?: string
  selectedIndustryUnitId?: string
  selectedEmergencyObjectId?: string
  selectedSecurityForceId?: string
  securityTask?: SecurityTask
  showSecurityRings?: boolean
  onSelectDistrict: (district: string) => void
  onSelectIndustryDistrict?: (district: string) => void
  onSelectEmergencyDistrict?: (district: string) => void
  onSelectObject: (object: RiskObject) => void
}

const levelColors = {
  medium: '#39d98a',
  high: '#ff9f1c',
  critical: '#ff3b30',
}

const industryColors: Partial<Record<RiskObject['industry'], string>> = {
  高层建筑: '#66d9ff',
  厂房仓库: '#ff7a1a',
  医疗机构: '#2ee6c8',
  商业综合体: '#ffd166',
  人员密集场所: '#f4d35e',
  轨道交通: '#5d9cff',
  新能源汽车: '#bf7dff',
  燃气危化: '#ff3b30',
  施工动火: '#ff8f3d',
}

type Position = [number, number]
type LinearRing = Position[]
type PolygonCoordinates = LinearRing[]
type MultiPolygonCoordinates = PolygonCoordinates[]

interface ShanghaiGeoFeature {
  type: 'Feature'
  properties: {
    name: string
    adcode?: number
  }
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: PolygonCoordinates | MultiPolygonCoordinates
  }
}

interface ShanghaiGeoCollection {
  type: 'FeatureCollection'
  features: ShanghaiGeoFeature[]
}

interface StreetTownFeature {
  type: 'Feature'
  properties: {
    name: string
    district: string
    center?: Position
  }
  geometry: ShanghaiGeoFeature['geometry']
}

interface StreetTownGeoCollection {
  type: 'FeatureCollection'
  features: StreetTownFeature[]
}

type Projector = (lng: number, lat: number) => [number, number]
type SecurityMapScope = 'venue' | 'district' | 'city'
type ViewAngles = { azimuth: number; pitch: number }

const DEFAULT_VIEW_ANGLES: ViewAngles = {
  azimuth: 0,
  pitch: Math.atan2(12.6, 15.6),
}

export function ThreeRiskMap({
  districts,
  layers,
  objects,
  selectedDistrict,
  mapMode,
  selectedIndustry = '全部行业',
  industryScope = 'city',
  selectedObjectId,
  selectedIndustryUnitId,
  selectedEmergencyObjectId,
  selectedSecurityForceId,
  securityTask,
  showSecurityRings = false,
  onSelectDistrict,
  onSelectIndustryDistrict,
  onSelectEmergencyDistrict,
  onSelectObject,
}: ThreeRiskMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
	  const callbacksRef = useRef({ onSelectDistrict, onSelectIndustryDistrict, onSelectEmergencyDistrict, onSelectObject })
	  const selectedRef = useRef(selectedDistrict)
	  const [zoomLevel, setZoomLevel] = useState(1)
	  const [viewAngles, setViewAngles] = useState<ViewAngles>(DEFAULT_VIEW_ANGLES)
	  const [securityMapScopeState, setSecurityMapScopeState] = useState<{ scope: SecurityMapScope; taskId?: string }>({ scope: 'venue' })
  const visibleLayerIds = useMemo(() => new Set(layers.filter((layer) => layer.visible).map((layer) => layer.id)), [layers])
  const defaultSecurityMapScope: SecurityMapScope = securityTask?.taskType === 'event-ring' ? 'venue' : 'city'
  const securityMapScope = securityMapScopeState.taskId === securityTask?.id ? securityMapScopeState.scope : defaultSecurityMapScope

  useEffect(() => {
    callbacksRef.current = { onSelectDistrict, onSelectIndustryDistrict, onSelectEmergencyDistrict, onSelectObject }
    selectedRef.current = selectedDistrict
  }, [onSelectDistrict, onSelectEmergencyDistrict, onSelectIndustryDistrict, onSelectObject, selectedDistrict])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2('#04172b', 0.035)

	    const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 1000)
	    const zoomFactor = Math.max(0.62, Math.min(1.85, zoomLevel))
	    const cameraControl = { azimuth: viewAngles.azimuth, pitch: viewAngles.pitch }
	    applyCameraView(camera, zoomFactor, cameraControl)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
	    renderer.setClearColor('#061b2f', 1)
	    renderer.outputColorSpace = THREE.SRGBColorSpace
	    renderer.domElement.style.touchAction = 'none'
	    container.appendChild(renderer.domElement)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const interactive: THREE.Object3D[] = []
    const isDistrictMode = mapMode === 'district' && Boolean(selectedDistrict)
    const isIndustryMode = mapMode === 'industry'
    const isEmergencyMode = mapMode === 'emergency'
    const isSecurityMode = mapMode === 'security'
    const isIndustryDistrictMode = isIndustryMode && industryScope !== 'city' && Boolean(selectedDistrict)
    const isSecurityRingMode = isSecurityMode && securityTask?.taskType === 'event-ring'
    const isSecurityVenueScope = isSecurityRingMode && securityMapScope === 'venue'
    const isSecurityDistrictScope = isSecurityRingMode && securityMapScope === 'district'
	    const districtGroup = new THREE.Group()
	    const objectGroup = new THREE.Group()
	    const gridGroup = new THREE.Group()
	    const securityRingGroup = new THREE.Group()
	    const focusMode = isDistrictMode || isIndustryDistrictMode || isSecurityVenueScope || isSecurityDistrictScope
	    districtGroup.scale.setScalar(focusMode ? 1.25 : 1.12)
	    objectGroup.scale.setScalar(focusMode ? 1.25 : 1.12)
	    securityRingGroup.scale.setScalar(focusMode ? 1.25 : 1.12)
	    districtGroup.position.y = focusMode ? 0.1 : 0.45
	    objectGroup.position.y = focusMode ? 0.1 : 0.45
	    securityRingGroup.position.y = focusMode ? 0.1 : 0.45

	    scene.add(districtGroup, objectGroup, securityRingGroup, gridGroup)

    const ambientLight = new THREE.AmbientLight('#7bbcff', 1.7)
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.6)
    keyLight.position.set(4, -7, 12)
    const redLight = new THREE.PointLight('#ff3045', 160, 22)
    redLight.position.set(1.2, -4, 5)
    const cyanLight = new THREE.PointLight('#00d8ff', 160, 24)
    cyanLight.position.set(-4, 3, 5)
    scene.add(ambientLight, keyLight, redLight, cyanLight)

    const grid = new THREE.GridHelper(18, 18, '#1678ad', '#08364f')
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.05
    gridGroup.add(grid)

    const districtMeshes = new Map<string, THREE.Mesh[]>()
    const districtEdges = new Map<string, THREE.LineSegments[]>()
    const geoCollection = shanghaiGeoJson as unknown as ShanghaiGeoCollection
    const streetTownCollection = streetTownGeoJson as unknown as StreetTownGeoCollection
    const selectedFeature = geoCollection.features.find((feature) => feature.properties.name === selectedDistrict || feature.properties.name === securityTask?.district)
    const activeFeatures = focusMode && selectedFeature ? [selectedFeature] : geoCollection.features
    const projection = createProjection(
      { ...geoCollection, features: activeFeatures },
      isSecurityVenueScope && securityTask ? securityTask.center : undefined,
    )
    const districtStats = new Map(districts.map((district) => [district.name, district]))

    activeFeatures.forEach((feature) => {
      const district = districtStats.get(feature.properties.name)
      const riskScore = district?.riskScore || 68
      const height = 0.16 + riskScore / 135
      const polygons = getPolygons(feature.geometry)
      const meshes: THREE.Mesh[] = []
      const edges: THREE.LineSegments[] = []

      polygons.forEach((polygon) => {
        const shape = polygonToShape(polygon, projection)
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: focusMode ? 0.32 : height,
          bevelEnabled: true,
          bevelSize: 0.018,
          bevelThickness: 0.035,
          bevelSegments: 1,
          curveSegments: 2,
        })
        const material = new THREE.MeshStandardMaterial({
          color: riskColor(riskScore),
          roughness: 0.42,
          metalness: 0.34,
          emissive: riskColor(riskScore),
          emissiveIntensity: riskScore > 85 ? 0.18 : 0.07,
          transparent: true,
          opacity: focusMode ? 0.34 : 0.9,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.userData = { type: 'district', name: feature.properties.name }
        districtGroup.add(mesh)
        meshes.push(mesh)
        interactive.push(mesh)

        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: '#88e8ff', transparent: true, opacity: 0.52 }),
        )
        districtGroup.add(edge)
        edges.push(edge)
      })

      const labelPosition = district?.center
        ? projection(district.center[0], district.center[1])
        : centroid(polygons.flat(2), projection)
      const label = createDistrictLabel(feature.properties.name)
      label.position.set(labelPosition[0], labelPosition[1], height + 0.22)
      districtGroup.add(label)

      if (isDistrictMode) {
        createStreetTownZones(feature.properties.name, streetTownCollection, projection, riskScore, interactive).forEach((zone) => {
          districtGroup.add(zone)
        })
      }

      districtMeshes.set(feature.properties.name, meshes)
      districtEdges.set(feature.properties.name, edges)
    })

	    if (isSecurityMode && showSecurityRings && securityTask?.rings.length) {
	      createSecurityRings(securityTask, projection).forEach((ring) => {
	        securityRingGroup.add(ring)
	      })
	    }

    objectGroup.add(
      ...createObjects(
        isDistrictMode ? objects.filter((object) => object.district === selectedDistrict) : objects,
        layers,
        visibleLayerIds,
        interactive,
        projection,
        isIndustryMode || isEmergencyMode || isSecurityMode,
        selectedSecurityForceId || selectedEmergencyObjectId || selectedIndustryUnitId || selectedObjectId,
        isEmergencyMode,
        isSecurityMode,
      ),
    )

	    const dragState = {
	      active: false,
	      pointerId: 0,
	      lastX: 0,
	      lastY: 0,
	      moved: false,
	      suppressClick: false,
	    }

	    const handlePointerDown = (event: PointerEvent) => {
	      if (event.button !== 0) return
	      dragState.active = true
	      dragState.pointerId = event.pointerId
	      dragState.lastX = event.clientX
	      dragState.lastY = event.clientY
	      dragState.moved = false
	      renderer.domElement.setPointerCapture(event.pointerId)
	      renderer.domElement.style.cursor = 'grabbing'
	    }

	    const handlePointerMove = (event: PointerEvent) => {
	      if (dragState.active && event.pointerId === dragState.pointerId) {
	        const deltaX = event.clientX - dragState.lastX
	        const deltaY = event.clientY - dragState.lastY
	        dragState.lastX = event.clientX
	        dragState.lastY = event.clientY
	        if (Math.abs(deltaX) + Math.abs(deltaY) > 2) {
	          dragState.moved = true
	          dragState.suppressClick = true
	        }
	        cameraControl.azimuth -= deltaX * 0.008
	        cameraControl.pitch = clamp(cameraControl.pitch - deltaY * 0.006, 0.38, 1.18)
	        applyCameraView(camera, zoomFactor, cameraControl)
	        event.preventDefault()
	        return
	      }
	      updatePointer(event, container, pointer)
	      const hits = raycaster.intersectObjects(interactive, false)
	      renderer.domElement.style.cursor = hits.length ? 'pointer' : 'default'
	    }

	    const handlePointerUp = (event: PointerEvent) => {
	      if (!dragState.active || event.pointerId !== dragState.pointerId) return
	      dragState.active = false
	      renderer.domElement.releasePointerCapture(event.pointerId)
	      renderer.domElement.style.cursor = dragState.moved ? 'grab' : 'default'
	      if (dragState.moved) {
	        setViewAngles({ azimuth: cameraControl.azimuth, pitch: cameraControl.pitch })
	      }
	    }

	    const handlePointerLeave = () => {
	      if (!dragState.active) {
	        renderer.domElement.style.cursor = 'grab'
	      }
	    }

	    const handleClick = (event: PointerEvent) => {
	      if (dragState.suppressClick) {
	        dragState.suppressClick = false
	        return
	      }
	      updatePointer(event, container, pointer)
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(interactive, false)
      const hit = hits[0]?.object

      if (!hit) {
        return
      }

      if (hit.userData.type === 'district') {
        if (isIndustryMode) {
          callbacksRef.current.onSelectIndustryDistrict?.(hit.userData.name)
        } else if (isEmergencyMode) {
          callbacksRef.current.onSelectEmergencyDistrict?.(hit.userData.name)
        } else {
          callbacksRef.current.onSelectDistrict(hit.userData.name)
        }
      }

      if (hit.userData.type === 'object') {
        callbacksRef.current.onSelectObject(hit.userData.object)
      }
    }

	    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
	    renderer.domElement.addEventListener('pointermove', handlePointerMove)
	    renderer.domElement.addEventListener('pointerup', handlePointerUp)
	    renderer.domElement.addEventListener('pointercancel', handlePointerUp)
	    renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
	    renderer.domElement.addEventListener('click', handleClick)

    const resizeObserver = new ResizeObserver(() => {
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    })
    resizeObserver.observe(container)

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const t = performance.now() * 0.001
      objectGroup.children.forEach((child, index) => {
        child.position.z += Math.sin(t * 2 + index) * 0.0009
        child.traverse((node) => {
          if (node.userData.pulseRing) {
            node.scale.setScalar(1 + Math.sin(t * 3 + index) * 0.08)
          }
        })
      })
      districtGroup.traverse((child) => {
        if (child.userData.pulseRing) {
          child.scale.setScalar(1 + Math.sin(t * 2.4) * 0.06)
        }
      })
      districtMeshes.forEach((meshes, name) => {
        const isSelected = selectedRef.current === name
        meshes.forEach((mesh) => {
          const material = mesh.material as THREE.MeshStandardMaterial
          material.emissiveIntensity = isSelected ? 0.46 : material.emissiveIntensity * 0.96 + 0.08 * 0.04
        })
      })
      districtEdges.forEach((edges, name) => {
        edges.forEach((edge) => {
          const material = edge.material as THREE.LineBasicMaterial
          material.opacity = selectedRef.current === name ? 0.95 : 0.45
        })
      })
      renderer.render(scene, camera)
    }

    animate()

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
	      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
	      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
	      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
	      renderer.domElement.removeEventListener('pointercancel', handlePointerUp)
	      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
	      renderer.domElement.removeEventListener('click', handleClick)
      container.removeChild(renderer.domElement)
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose())
          } else {
            child.material.dispose()
          }
        }
        if (child instanceof THREE.Sprite) {
          child.material.map?.dispose()
          child.material.dispose()
        }
      })
      renderer.dispose()
    }
	  }, [districts, industryScope, layers, mapMode, objects, securityMapScope, securityTask, selectedDistrict, selectedEmergencyObjectId, selectedIndustryUnitId, selectedObjectId, selectedSecurityForceId, showSecurityRings, viewAngles, visibleLayerIds, zoomLevel])

  const handleZoomIn = () => {
    setZoomLevel((value) => Math.min(1.85, Number((value + 0.16).toFixed(2))))
    if (mapMode === 'security' && securityTask?.taskType === 'event-ring') {
      const nextScope = securityMapScope === 'city' ? 'district' : securityMapScope === 'district' ? 'venue' : securityMapScope
      setSecurityMapScopeState({ taskId: securityTask.id, scope: nextScope })
    }
  }

  const handleZoomOut = () => {
    setZoomLevel((value) => Math.max(0.62, Number((value - 0.16).toFixed(2))))
    if (mapMode === 'security' && securityTask?.taskType === 'event-ring') {
      const nextScope = securityMapScope === 'venue' ? 'district' : securityMapScope === 'district' ? 'city' : securityMapScope
      setSecurityMapScopeState({ taskId: securityTask.id, scope: nextScope })
    }
  }

	  const handleZoomReset = () => {
	    setZoomLevel(1)
	    setSecurityMapScopeState({ taskId: securityTask?.id, scope: defaultSecurityMapScope })
	  }

	  const handleViewReset = () => {
	    setViewAngles(DEFAULT_VIEW_ANGLES)
	  }

  const toolbarText = mapMode === 'district'
    ? '行政区专题：街镇分区风险沙盘'
    : mapMode === 'industry'
      ? industryScope === 'unit'
        ? '行业专题：单位画像定位'
        : industryScope === 'district'
          ? '行业专题：行政区行业详情'
          : '行业专题：全市行业对象图层'
      : mapMode === 'emergency'
        ? '应急处置：实时警情与历史复现图层'
      : mapMode === 'security'
        ? securityTask?.taskType === 'event-ring'
          ? '安保模式：重大勤务安保圈'
          : '安保模式：全市力量撒点'
      : '上海市区级行政区 GeoJSON 三维风险沙盘'

  return (
    <div className="risk-map-shell">
      <div className="risk-map-toolbar">
        <span>{toolbarText}</span>
        <strong>{mapMode === 'industry' && industryScope === 'city' ? selectedIndustry : mapMode === 'emergency' ? '警情处置' : mapMode === 'security' ? securityTask?.venueName || '消防安保' : selectedDistrict || '全市'}</strong>
      </div>
	      <div ref={containerRef} className="risk-map-canvas" />
	      <div className="map-zoom-controls" aria-label="地图缩放控件">
	        <button type="button" onClick={handleZoomIn}>+</button>
	        <button type="button" onClick={handleZoomOut}>-</button>
	        <button type="button" onClick={handleZoomReset}>复位</button>
	        <span>{Math.round(zoomLevel * 100)}%</span>
	      </div>
	      <div className="map-view-controls" aria-label="地图视角控件">
	        <span>按住拖拽旋转</span>
	        <button type="button" onClick={handleViewReset}>视角复位</button>
	      </div>
      {mapMode === 'security' && securityTask?.taskType === 'event-ring' && (
        <div className="security-scope-controls" aria-label="安保圈视域切换">
          {([
            ['venue', '场馆'],
            ['district', '区级'],
            ['city', '全市'],
          ] as Array<[SecurityMapScope, string]>).map(([scope, label]) => (
            <button
              className={securityMapScope === scope ? 'active' : ''}
              key={scope}
              type="button"
              onClick={() => {
                setSecurityMapScopeState({ taskId: securityTask.id, scope })
                setZoomLevel(1)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="map-legend">
        <span><i className="dot medium" />中风险</span>
        <span><i className="dot high" />高风险</span>
        <span><i className="dot critical" />极高风险</span>
      </div>
    </div>
  )
}

function createObjects(
  objects: RiskObject[],
  layers: LayerDefinition[],
  visibleLayerIds: Set<string>,
  interactive: THREE.Object3D[],
  projection: Projector,
  industryMode: boolean,
  selectedObjectId?: string,
  emergencyMode = false,
  securityMode = false,
) {
  const children: THREE.Object3D[] = []
  const actualIndustryMode = industryMode && !emergencyMode && !securityMode
  const visibleIndustries = new Set(
    layers
      .filter((layer) => visibleLayerIds.has(layer.id))
      .flatMap((layer) => layer.filters.industries),
  )

  objects
    .filter((object) => industryMode || visibleIndustries.has(object.industry))
    .forEach((object, index) => {
      const selected = selectedObjectId === object.id
      const baseColor = securityMode
        ? securityObjectColor(object)
        : emergencyMode
          ? emergencyObjectColor(object)
        : industryMode
          ? industryColors[object.industry] || levelColors[object.riskLevel]
          : levelColors[object.riskLevel]
      const color = new THREE.Color(baseColor)
      const heightBase = object.riskLevel === 'critical' ? 1.4 : object.riskLevel === 'high' ? 1.0 : 0.55
      const height = securityMode ? heightBase + 0.18 : emergencyMode ? heightBase + 0.24 : selected ? heightBase + 0.45 : heightBase
      const [x, y] = projection(object.location.lng, object.location.lat)

      if (emergencyMode) {
        children.push(...createEmergencyAlarmMarker(object, x, y, height, color, selected, index, interactive))
        return
      }

      if (actualIndustryMode) {
        children.push(...createIndustryRiskMarker(object, x, y, height, color, selected, index, interactive))
        return
      }

      children.push(
        ...(securityMode
          ? createSecurityDutyMarker(object, x, y, height, color, selected, index, interactive)
          : createRiskBeaconMarker(object, x, y, height, color, selected, index, interactive)),
      )
    })

  return children
}

function createRiskBeaconMarker(
  object: RiskObject,
  x: number,
  y: number,
  height: number,
  color: THREE.Color,
  selected: boolean,
  index: number,
  interactive: THREE.Object3D[],
) {
  const children: THREE.Object3D[] = []
  const group = new THREE.Group()
  const baseZ = 0.34
  const columnHeight = height + (selected ? 0.34 : 0.04)
  const footprint = object.riskLevel === 'critical' ? 0.38 : object.riskLevel === 'high' ? 0.31 : 0.24

  group.position.set(x, y, 0)

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(footprint * 1.7, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: selected ? 0.22 : 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  halo.position.z = baseZ + 0.012
  halo.userData = { pulseRing: true }
  group.add(halo)

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(footprint * 0.84, footprint, 0.12, 6),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: selected ? 0.42 : 0.24,
      metalness: 0.42,
      roughness: 0.24,
      transparent: true,
      opacity: selected ? 0.92 : 0.78,
    }),
  )
  platform.rotation.x = Math.PI / 2
  platform.position.z = baseZ + 0.08
  platform.userData = { type: 'object', object }
  group.add(platform)
  interactive.push(platform)

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(footprint * 1.08, 0.01, 8, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: selected ? 0.78 : 0.52,
      depthWrite: false,
    }),
  )
  outerRing.position.z = baseZ + 0.16
  outerRing.userData = { pulseRing: true }
  group.add(outerRing)

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.072, columnHeight, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: object.riskLevel === 'medium' && !selected ? 0.36 : 0.56,
      depthWrite: false,
    }),
  )
  beam.rotation.x = Math.PI / 2
  beam.position.z = baseZ + columnHeight / 2 + 0.14
  beam.userData = { type: 'object', object }
  group.add(beam)
  interactive.push(beam)

  const prism = new THREE.Mesh(
    new THREE.ConeGeometry(selected ? 0.16 : 0.12, selected ? 0.36 : 0.28, 4),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: selected ? 0.86 : 0.58,
      metalness: 0.34,
      roughness: 0.2,
      transparent: true,
      opacity: selected ? 1 : 0.9,
    }),
  )
  prism.rotation.x = Math.PI / 2
  prism.rotation.z = Math.PI / 4
  prism.position.z = baseZ + columnHeight + 0.26
  prism.userData = { type: 'object', object }
  group.add(prism)
  interactive.push(prism)

  const hitTarget = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.max(0.2, footprint), Math.max(0.2, footprint), columnHeight + 0.42, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.01, depthWrite: false }),
  )
  hitTarget.rotation.x = Math.PI / 2
  hitTarget.position.z = baseZ + columnHeight / 2 + 0.16
  hitTarget.userData = { type: 'object', object }
  group.add(hitTarget)
  interactive.push(hitTarget)

  if (selected || object.riskLevel === 'critical' || (object.riskLevel === 'high' && index % 4 === 0)) {
    const label = createObjectCalloutLabel(object.name, object.riskLevel, color.getStyle())
    label.position.set(0.12, -0.22, baseZ + columnHeight + 0.58)
    group.add(label)
  }

  children.push(group)
  return children
}

function createSecurityDutyMarker(
  object: RiskObject,
  x: number,
  y: number,
  height: number,
  color: THREE.Color,
  selected: boolean,
  index: number,
  interactive: THREE.Object3D[],
) {
  if (object.id.startsWith('security-risk-')) {
    return createRiskBeaconMarker(object, x, y, height * 0.78, color, selected, index, interactive)
  }

  const children: THREE.Object3D[] = []
  const group = new THREE.Group()
  const baseZ = 0.36
  const columnHeight = height + (selected ? 0.36 : 0.12)
  const footprint = selected ? 0.42 : 0.34
  const isEventForce = object.objectType.includes('活动') || object.signals.some((signal) => signal.includes('event-standby-force'))

  group.position.set(x, y, 0)

  const field = new THREE.Mesh(
    new THREE.CircleGeometry(footprint * 1.75, 56),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: selected || isEventForce ? 0.22 : 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  field.position.z = baseZ + 0.012
  field.userData = { pulseRing: true }
  group.add(field)

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(footprint * 0.86, footprint, 0.16, 8),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: selected ? 0.52 : 0.34,
      metalness: 0.48,
      roughness: 0.2,
      transparent: true,
      opacity: 0.9,
    }),
  )
  base.rotation.x = Math.PI / 2
  base.position.z = baseZ + 0.09
  base.userData = { type: 'object', object }
  group.add(base)
  interactive.push(base)

  const rings = [footprint * 1.05, footprint * 1.32]
  rings.forEach((radius, ringIndex) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, ringIndex === 0 ? 0.014 : 0.008, 8, 56),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: ringIndex === 0 ? 0.68 : 0.36,
        depthWrite: false,
      }),
    )
    ring.position.z = baseZ + 0.18 + ringIndex * 0.02
    ring.userData = { pulseRing: true }
    group.add(ring)
  })

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.12, columnHeight, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: selected ? 0.72 : 0.48,
      depthWrite: false,
    }),
  )
  beam.rotation.x = Math.PI / 2
  beam.position.z = baseZ + columnHeight / 2 + 0.16
  beam.userData = { type: 'object', object }
  group.add(beam)
  interactive.push(beam)

  const commandCore = new THREE.Mesh(
    isEventForce ? new THREE.OctahedronGeometry(selected ? 0.2 : 0.16, 0) : new THREE.BoxGeometry(selected ? 0.24 : 0.18, selected ? 0.24 : 0.18, selected ? 0.24 : 0.18),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: selected ? 0.95 : 0.68,
      metalness: 0.36,
      roughness: 0.16,
      transparent: true,
      opacity: 0.96,
    }),
  )
  commandCore.position.z = baseZ + columnHeight + 0.24
  commandCore.userData = { type: 'object', object }
  group.add(commandCore)
  interactive.push(commandCore)

  const hitTarget = new THREE.Mesh(
    new THREE.CylinderGeometry(footprint * 1.1, footprint * 1.1, columnHeight + 0.54, 14),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.01, depthWrite: false }),
  )
  hitTarget.rotation.x = Math.PI / 2
  hitTarget.position.z = baseZ + columnHeight / 2 + 0.16
  hitTarget.userData = { type: 'object', object }
  group.add(hitTarget)
  interactive.push(hitTarget)

  if (selected || isEventForce || index % 5 === 0) {
    const label = createSecurityCalloutLabel(object.name, object.objectType, color.getStyle())
    label.position.set(0.16, -0.26, baseZ + columnHeight + 0.58)
    group.add(label)
  }

  children.push(group)
  return children
}

function createEmergencyAlarmMarker(
  object: RiskObject,
  x: number,
  y: number,
  height: number,
  color: THREE.Color,
  selected: boolean,
  index: number,
  interactive: THREE.Object3D[],
) {
  const children: THREE.Object3D[] = []
  const group = new THREE.Group()
  const baseZ = 0.38
  const columnHeight = height + 0.62
  const alarmColor = object.riskLevel === 'critical' ? new THREE.Color('#ff4da6') : color
  const cyan = new THREE.Color('#7df9ff')

  group.position.set(x, y, 0)

  const heatDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 36, 14),
    new THREE.MeshStandardMaterial({
      color: alarmColor,
      emissive: alarmColor,
      emissiveIntensity: 0.34,
      roughness: 0.45,
      metalness: 0.06,
      transparent: true,
      opacity: object.riskLevel === 'critical' ? 0.42 : 0.34,
      depthWrite: false,
    }),
  )
  heatDome.scale.set(1.55, 1.08, 0.24)
  heatDome.position.z = baseZ + 0.05
  group.add(heatDome)

  const rings = [
    { radius: 0.36, tube: 0.016, opacity: 0.92, color: cyan },
    { radius: 0.52, tube: 0.012, opacity: 0.58, color: alarmColor },
    { radius: 0.72, tube: 0.01, opacity: 0.34, color: cyan },
  ]

  rings.forEach((ringConfig) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringConfig.radius, ringConfig.tube, 8, 64),
      new THREE.MeshBasicMaterial({
        color: ringConfig.color,
        transparent: true,
        opacity: ringConfig.opacity,
        depthWrite: false,
      }),
    )
    ring.position.z = baseZ + 0.045
    ring.userData = { pulseRing: true }
    group.add(ring)
  })

  const verticalBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.16, columnHeight, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: cyan,
      transparent: true,
      opacity: selected ? 0.8 : 0.68,
      depthWrite: false,
    }),
  )
  verticalBeam.rotation.x = Math.PI / 2
  verticalBeam.position.z = baseZ + columnHeight / 2
  verticalBeam.userData = { type: 'object', object }
  group.add(verticalBeam)
  interactive.push(verticalBeam)

  const alarmCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 24, 12),
    new THREE.MeshStandardMaterial({
      color: '#eafaff',
      emissive: cyan,
      emissiveIntensity: 1.2,
      metalness: 0.22,
      roughness: 0.12,
      transparent: true,
      opacity: 0.96,
    }),
  )
  alarmCore.position.z = baseZ + 0.14
  alarmCore.userData = { type: 'object', object }
  group.add(alarmCore)
  interactive.push(alarmCore)

  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(selected ? 0.24 : 0.2, 0),
    new THREE.MeshStandardMaterial({
      color: alarmColor,
      emissive: alarmColor,
      emissiveIntensity: 0.98,
      metalness: 0.3,
      roughness: 0.18,
      transparent: true,
      opacity: 0.94,
    }),
  )
  diamond.position.z = baseZ + columnHeight + 0.16
  diamond.userData = { type: 'object', object }
  group.add(diamond)
  interactive.push(diamond)

  const hitTarget = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, columnHeight + 0.58, 16),
    new THREE.MeshBasicMaterial({
      color: alarmColor,
      transparent: true,
      opacity: 0.01,
      depthWrite: false,
    }),
  )
  hitTarget.rotation.x = Math.PI / 2
  hitTarget.position.z = baseZ + columnHeight / 2
  hitTarget.userData = { type: 'object', object }
  group.add(hitTarget)
  interactive.push(hitTarget)

  const label = createAlarmCalloutLabel(`告警点#${index + 1}`, object.name, object.riskLevel, alarmColor.getStyle())
  label.position.set(0.2, -0.42, baseZ + columnHeight + 0.52)
  group.add(label)

  children.push(group)
  return children
}

function createIndustryRiskMarker(
  object: RiskObject,
  x: number,
  y: number,
  height: number,
  color: THREE.Color,
  selected: boolean,
  index: number,
  interactive: THREE.Object3D[],
) {
  const children: THREE.Object3D[] = []
  const group = new THREE.Group()
  const baseZ = 0.36
  const opacity = selected ? 1 : 0.88
  const footprint = object.riskLevel === 'critical' ? 0.46 : object.riskLevel === 'high' ? 0.38 : 0.3
  const columnHeight = height + (selected ? 0.35 : 0.1)
  const beamRadius = selected ? 0.062 : object.riskLevel === 'critical' ? 0.052 : 0.04

  group.position.set(x, y, 0)

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(footprint * 1.4, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: selected ? 0.26 : 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  halo.position.z = baseZ + 0.01
  halo.userData = { pulseRing: true }
  group.add(halo)

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(footprint, 0.012, 8, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: selected ? 0.86 : 0.62,
      depthWrite: false,
    }),
  )
  outerRing.position.z = baseZ + 0.035
  outerRing.userData = { pulseRing: true }
  group.add(outerRing)

  const heatDome = new THREE.Mesh(
    new THREE.SphereGeometry(footprint * 0.82, 28, 12),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: selected ? 0.52 : 0.28,
      roughness: 0.5,
      metalness: 0.08,
      transparent: true,
      opacity: object.riskLevel === 'medium' ? 0.24 : 0.36,
      depthWrite: false,
    }),
  )
  heatDome.scale.set(1, 1, 0.22)
  heatDome.position.z = baseZ + 0.05
  group.add(heatDome)

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(beamRadius, beamRadius * 1.7, columnHeight, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: selected ? 0.74 : 0.5,
      depthWrite: false,
    }),
  )
  beam.rotation.x = Math.PI / 2
  beam.position.z = baseZ + columnHeight / 2
  beam.userData = { type: 'object', object }
  group.add(beam)
  interactive.push(beam)

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(beamRadius * 0.36, beamRadius * 0.58, columnHeight * 0.96, 10),
    new THREE.MeshStandardMaterial({
      color: '#eafaff',
      emissive: color,
      emissiveIntensity: selected ? 1.05 : 0.8,
      metalness: 0.18,
      roughness: 0.18,
      transparent: true,
      opacity,
    }),
  )
  core.rotation.x = Math.PI / 2
  core.position.z = baseZ + columnHeight / 2
  core.userData = { type: 'object', object }
  group.add(core)
  interactive.push(core)

  const cap = new THREE.Mesh(
    new THREE.OctahedronGeometry(selected ? 0.16 : 0.12, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: selected ? 0.92 : 0.66,
      metalness: 0.34,
      roughness: 0.2,
      transparent: true,
      opacity,
    }),
  )
  cap.position.z = baseZ + columnHeight + 0.16
  cap.userData = { type: 'object', object }
  group.add(cap)
  interactive.push(cap)

  const hitTarget = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.max(0.18, footprint * 0.58), Math.max(0.18, footprint * 0.58), columnHeight + 0.46, 12),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.015,
      depthWrite: false,
    }),
  )
  hitTarget.rotation.x = Math.PI / 2
  hitTarget.position.z = baseZ + columnHeight / 2
  hitTarget.userData = { type: 'object', object }
  group.add(hitTarget)
  interactive.push(hitTarget)

  if (selected || object.riskLevel === 'critical' || index % 19 === 0) {
    const label = createObjectCalloutLabel(object.name, object.riskLevel, color.getStyle())
    label.position.set(0, -0.22, baseZ + columnHeight + 0.46)
    group.add(label)
  }

  children.push(group)
  return children
}

function createStreetTownZones(
  districtName: string,
  collection: StreetTownGeoCollection,
  projection: Projector,
  districtRiskScore: number,
  interactive: THREE.Object3D[],
) {
  const children: THREE.Object3D[] = []
  const features = collection.features.filter((feature) => feature.properties.district === districtName)

  features.forEach((feature, index) => {
    getPolygons(feature.geometry).forEach((polygon) => {
      const shape = polygonToShape(polygon, projection)
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.2 + ((districtRiskScore + index * 3) % 26) / 125,
        bevelEnabled: true,
        bevelSize: 0.008,
        bevelThickness: 0.014,
        bevelSegments: 1,
        curveSegments: 1,
      })
      const hueColor = streetZoneColor(index, districtRiskScore)
      const material = new THREE.MeshStandardMaterial({
        color: hueColor,
        emissive: hueColor,
        emissiveIntensity: 0.14,
        metalness: 0.28,
        roughness: 0.48,
        transparent: true,
        opacity: 0.88,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData = { type: 'streetTown', name: feature.properties.name, district: districtName }
      children.push(mesh)
      interactive.push(mesh)

      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: '#bbf3ff', transparent: true, opacity: 0.36 }),
      )
      children.push(edge)
    })

    const labelPoint = feature.properties.center || polygonCentroid(getPolygons(feature.geometry)[0][0])
    const [labelX, labelY] = projection(labelPoint[0], labelPoint[1])
    const label = createDistrictLabel(feature.properties.name, 'street')
    label.position.set(labelX, labelY, 0.78)
    children.push(label)
  })

  return children
}

function createProjection(geoCollection: ShanghaiGeoCollection, focusCenter?: { lng: number; lat: number }): Projector {
  const positions = geoCollection.features.flatMap((feature) => getPolygons(feature.geometry).flat(2))
  const lngs = positions.map(([lng]) => lng)
  const lats = positions.map(([, lat]) => lat)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const centerLng = focusCenter?.lng || (minLng + maxLng) / 2
  const centerLat = focusCenter?.lat || (minLat + maxLat) / 2
  const cosLat = Math.cos((centerLat * Math.PI) / 180)
  const width = (maxLng - minLng) * cosLat
  const height = maxLat - minLat
  const scale = focusCenter ? 760 : Math.min(14 / width, 9.4 / height)

  return (lng: number, lat: number) => [
    (lng - centerLng) * cosLat * scale,
    (lat - centerLat) * scale,
  ]
}

function createSecurityRings(task: SecurityTask, projection: Projector) {
  const children: THREE.Object3D[] = []
  const center = task.center
  const ringColors = ['#ff4d5d', '#ffd166']
  const [centerX, centerY] = projection(center.lng, center.lat)

  task.rings.forEach((meters, index) => {
    const positions: number[] = []
    for (let segment = 0; segment <= 128; segment += 1) {
      const angle = (segment / 128) * Math.PI * 2
      const lng = center.lng + (Math.cos(angle) * meters) / (111000 * Math.cos((center.lat * Math.PI) / 180))
      const lat = center.lat + (Math.sin(angle) * meters) / 111000
      const [x, y] = projection(lng, lat)
      positions.push(x, y, 1.18 + index * 0.08)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const material = new THREE.LineBasicMaterial({
      color: ringColors[index % ringColors.length],
      transparent: true,
      opacity: index === 0 ? 0.88 : 0.62,
      depthTest: false,
      depthWrite: false,
    })
    const ring = new THREE.Line(geometry, material)
    ring.renderOrder = 20
    children.push(ring)

    const ringFill = new THREE.Mesh(
      new THREE.RingGeometry(
        Math.max(0.02, distance2d([centerX, centerY], projection(
          center.lng + ((meters * 0.94) / (111000 * Math.cos((center.lat * Math.PI) / 180))),
          center.lat,
        ))),
        Math.max(0.04, distance2d([centerX, centerY], projection(
          center.lng + ((meters * 1.02) / (111000 * Math.cos((center.lat * Math.PI) / 180))),
          center.lat,
        ))),
        160,
      ),
      new THREE.MeshBasicMaterial({
        color: ringColors[index % ringColors.length],
        transparent: true,
        opacity: index === 0 ? 0.12 : 0.08,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    )
    ringFill.position.set(centerX, centerY, 1.12 + index * 0.07)
    ringFill.renderOrder = 18
    children.push(ringFill)

    const [labelX, labelY] = projection(center.lng, center.lat + (meters / 111000))
    const label = createDistrictLabel(`${meters}米安保圈`, 'street')
    label.position.set(labelX, labelY, 1.48 + index * 0.12)
    label.renderOrder = 22
    label.material.depthTest = false
    children.push(label)
  })

  const venueGeometry = new THREE.CylinderGeometry(0.12, 0.26, 1.18, 8)
  const venueMaterial = new THREE.MeshStandardMaterial({
    color: '#ffd166',
    emissive: '#ffd166',
    emissiveIntensity: 0.92,
    metalness: 0.38,
    roughness: 0.22,
    transparent: true,
    opacity: 0.96,
  })
  const venue = new THREE.Mesh(venueGeometry, venueMaterial)
  venue.rotation.x = Math.PI / 2
  venue.position.set(centerX, centerY, 1.34)
  venue.renderOrder = 21
  children.push(venue)

  const venueHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.016, 8, 64),
    new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.72, depthWrite: false }),
  )
  venueHalo.position.set(centerX, centerY, 1.1)
  venueHalo.userData = { pulseRing: true }
  venueHalo.renderOrder = 19
  children.push(venueHalo)

  return children
}

function getPolygons(geometry: ShanghaiGeoFeature['geometry']): MultiPolygonCoordinates {
  return geometry.type === 'Polygon'
    ? [geometry.coordinates as PolygonCoordinates]
    : geometry.coordinates as MultiPolygonCoordinates
}

function polygonToShape(polygon: PolygonCoordinates, projection: Projector) {
  const [outerRing, ...holeRings] = polygon
  const shape = ringToPath(outerRing, projection, true) as THREE.Shape
  shape.holes = holeRings
    .filter((ring) => ring.length > 3)
    .map((ring) => ringToPath(ring, projection, false))

  return shape
}

function ringToPath(ring: LinearRing, projection: Projector, asShape: boolean) {
  const path = asShape ? new THREE.Shape() : new THREE.Path()
  ring.forEach(([lng, lat], index) => {
    const [x, y] = projection(lng, lat)
    if (index === 0) {
      path.moveTo(x, y)
    } else {
      path.lineTo(x, y)
    }
  })
  path.closePath()
  return path
}

function centroid(points: Position[], projection: Projector): [number, number] {
  const total = points.reduce<[number, number]>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
  return projection(total[0] / points.length, total[1] / points.length)
}

function createDistrictLabel(name: string, variant: 'district' | 'street' = 'district') {
  const canvas = document.createElement('canvas')
  canvas.width = variant === 'district' ? 192 : 256
  canvas.height = 64
  const context = canvas.getContext('2d')

  if (context) {
    context.fillStyle = variant === 'district' ? 'rgba(4, 21, 38, 0.72)' : 'rgba(2, 31, 48, 0.66)'
    context.strokeStyle = variant === 'district' ? 'rgba(136, 232, 255, 0.62)' : 'rgba(80, 221, 255, 0.42)'
    context.lineWidth = 2
    const boxWidth = variant === 'district' ? 160 : 224
    context.fillRect(16, 10, boxWidth, 40)
    context.strokeRect(16, 10, boxWidth, 40)
    context.fillStyle = '#eafaff'
    context.font = variant === 'district' ? '600 22px Microsoft YaHei, sans-serif' : '500 18px Microsoft YaHei, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(name, canvas.width / 2, 31)
  }

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(variant === 'district' ? 1.05 : 0.96, variant === 'district' ? 0.35 : 0.24, 1)
  return sprite
}

function createObjectCalloutLabel(name: string, riskLevel: RiskObject['riskLevel'], accent: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 96
  const context = canvas.getContext('2d')
  const title = name.length > 11 ? `${name.slice(0, 10)}…` : name
  const riskText = riskLevel === 'critical' ? '极高风险' : riskLevel === 'high' ? '高风险' : '监测点'

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.shadowColor = accent
    context.shadowBlur = 18
    context.fillStyle = riskLevel === 'critical' ? 'rgba(118, 16, 48, 0.82)' : 'rgba(5, 43, 68, 0.82)'
    context.strokeStyle = accent
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(30, 18)
    context.lineTo(284, 18)
    context.lineTo(300, 42)
    context.lineTo(284, 66)
    context.lineTo(30, 66)
    context.lineTo(18, 42)
    context.closePath()
    context.fill()
    context.stroke()

    context.shadowBlur = 0
    context.fillStyle = '#eafaff'
    context.font = '600 24px Microsoft YaHei, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(title, 160, 36)

    context.fillStyle = accent
    context.font = '500 15px Microsoft YaHei, sans-serif'
    context.fillText(riskText, 160, 58)
  }

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.94,
    depthTest: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(1.05, 0.32, 1)
  return sprite
}

function createAlarmCalloutLabel(title: string, unitName: string, riskLevel: RiskObject['riskLevel'], accent: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 104
  const context = canvas.getContext('2d')
  const shortName = unitName.length > 12 ? `${unitName.slice(0, 11)}…` : unitName

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.shadowColor = accent
    context.shadowBlur = 22
    context.fillStyle = riskLevel === 'critical' ? 'rgba(92, 12, 54, 0.86)' : 'rgba(4, 54, 61, 0.84)'
    context.strokeStyle = accent
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(32, 16)
    context.lineTo(302, 16)
    context.lineTo(330, 40)
    context.lineTo(302, 72)
    context.lineTo(32, 72)
    context.lineTo(18, 44)
    context.closePath()
    context.fill()
    context.stroke()

    context.shadowBlur = 0
    context.fillStyle = '#fff7ff'
    context.font = '700 27px Microsoft YaHei, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(title, 174, 37)

    context.fillStyle = '#bffaff'
    context.font = '500 16px Microsoft YaHei, sans-serif'
    context.fillText(shortName, 174, 60)
  }

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(1.14, 0.34, 1)
  return sprite
}

function createSecurityCalloutLabel(name: string, forceType: string, accent: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 340
  canvas.height = 96
  const context = canvas.getContext('2d')
  const title = name.length > 11 ? `${name.slice(0, 10)}…` : name
  const subtitle = forceType.length > 10 ? `${forceType.slice(0, 9)}…` : forceType

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.shadowColor = accent
    context.shadowBlur = 18
    context.fillStyle = 'rgba(3, 34, 56, 0.84)'
    context.strokeStyle = accent
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(28, 18)
    context.lineTo(284, 18)
    context.lineTo(310, 42)
    context.lineTo(284, 68)
    context.lineTo(28, 68)
    context.lineTo(16, 42)
    context.closePath()
    context.fill()
    context.stroke()

    context.shadowBlur = 0
    context.fillStyle = '#eafaff'
    context.font = '650 23px Microsoft YaHei, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(title, 164, 36)

    context.fillStyle = accent
    context.font = '500 15px Microsoft YaHei, sans-serif'
    context.fillText(subtitle, 164, 58)
  }

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.94,
    depthTest: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(1.08, 0.3, 1)
  return sprite
}

function normalizeRing(ring: LinearRing) {
  const normalized = ring.slice()
  const first = normalized[0]
  const last = normalized[normalized.length - 1]
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    normalized.pop()
  }
  return normalized
}

function polygonCentroid(ring: LinearRing): Position {
  const points = normalizeRing(ring)
  let areaTwice = 0
  let lngSum = 0
  let latSum = 0

  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]
    const cross = point[0] * next[1] - next[0] * point[1]
    areaTwice += cross
    lngSum += (point[0] + next[0]) * cross
    latSum += (point[1] + next[1]) * cross
  })

  if (Math.abs(areaTwice) < 0.000001) {
    const total = points.reduce<Position>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
    return [total[0] / points.length, total[1] / points.length]
  }

  return [lngSum / (3 * areaTwice), latSum / (3 * areaTwice)]
}

function streetZoneColor(index: number, districtRiskScore: number) {
  const palette = ['#1678ad', '#1397c7', '#2aa6a1', '#c27624', '#a5493e', '#8d3b5f']
  if (districtRiskScore >= 85 && index % 5 === 0) return '#c9283d'
  if (districtRiskScore >= 75 && index % 4 === 0) return '#ad5d16'
  return palette[index % palette.length]
}

function updatePointer(event: PointerEvent, container: HTMLElement, pointer: THREE.Vector2) {
  const rect = container.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

function applyCameraView(camera: THREE.PerspectiveCamera, zoomFactor: number, view: ViewAngles) {
  const distance = 20 / zoomFactor
  const horizontalDistance = Math.cos(view.pitch) * distance
  camera.position.set(
    Math.sin(view.azimuth) * horizontalDistance,
    -Math.cos(view.azimuth) * horizontalDistance,
    Math.sin(view.pitch) * distance,
  )
  camera.lookAt(0, 0.2, 0)
}

function distance2d(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function riskColor(score: number) {
  if (score >= 85) return '#c9283d'
  if (score >= 75) return '#ad5d16'
  if (score >= 68) return '#1b6b9e'
  return '#155a74'
}

function emergencyObjectColor(object: RiskObject) {
  if (object.status === '处置中') {
    return object.riskLevel === 'critical' ? '#ff3045' : '#ff8f3d'
  }

  if (object.status === '已闭环') {
    return '#5d9cff'
  }

  return '#ffd166'
}

function securityObjectColor(object: RiskObject) {
  if (object.id.startsWith('security-risk-')) {
    return levelColors[object.riskLevel]
  }

  const forceTypeSignal = object.signals.find((signal) => signal.startsWith('forceType:')) || ''
  if (forceTypeSignal.includes('fire-station')) return '#5d9cff'
  if (forceTypeSignal.includes('mobile-forward-station')) return '#ff4d5d'
  if (forceTypeSignal.includes('grid-patrol')) return '#2ff8e6'
  if (forceTypeSignal.includes('event-standby-force')) return '#ffd166'
  return '#66d9ff'
}
