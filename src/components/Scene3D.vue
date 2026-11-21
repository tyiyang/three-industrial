<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Group as TweenGroup, Tween, Easing } from '@tweenjs/tween.js'
import { buildCampus, SPACING, type CampusResult } from '../core/campus'
import { ParticleSystems } from '../core/particles'
import { buildPoiMarkers, buildPatrolPath, type PoiMarkers } from '../core/poi'
import { useDemoStore, GRID_COLS, GRID_ROWS } from '../stores/useDemoStore'
import {
  DEVICE_TYPES, STATE_COLOR, STATE_LABEL, TYPE_MODEL,
  type DeviceState, type DeviceType,
} from '../types'

const store = useDemoStore()

const container = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const loadError = ref(false)
const hoverTip = ref<{ x: number; y: number; name: string; state: DeviceState; temp: number } | null>(null)
const boxRect = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const measureInfo = ref('')
const poiCard = ref<{ x: number; y: number; title: string; desc: string; stats: string } | null>(null)

let renderer: THREE.WebGLRenderer
let labelRenderer: CSS2DRenderer
let composer: EffectComposer
let bloomPass: UnrealBloomPass
let outlinePass: OutlinePass
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let campus: CampusResult
let animId = 0
let observer: ResizeObserver | null = null
const tweenGroup = new TweenGroup()

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()

type MeshSet = { high: THREE.InstancedMesh; low: THREE.InstancedMesh; deviceIds: number[] }
const meshSets = new Map<DeviceType, MeshSet>()
let deviceSlots = new Map<number, { type: DeviceType; index: number }>()
const devicePositions: THREE.Vector3[] = []

let highlightGroup: THREE.Group
let hoverRing: THREE.Mesh
const labelObjects: CSS2DObject[] = []
let measureLine: THREE.Line | null = null
let measurePoints: THREE.Vector3[] = []

let particles: ParticleSystems
let poi: PoiMarkers
let patrolPath: ReturnType<typeof buildPatrolPath>
let patrolT = 0
let lastFrameTime = 0

let fpsFrames = 0
let fpsTime = 0
let lowFpsStreak = 0
let qualityReduced = false
const FIELD_HALF = (GRID_COLS * SPACING) / 2

function devicePosition(index: number): THREE.Vector3 {
  const col = index % GRID_COLS
  const row = Math.floor(index / GRID_COLS)
  return new THREE.Vector3((col - (GRID_COLS - 1) / 2) * SPACING, 0, (row - (GRID_ROWS - 1) / 2) * SPACING)
}
for (let i = 0; i < store.devices.length; i++) devicePositions.push(devicePosition(i))

function fallbackGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.9, 1.3, 0.9)
  g.translate(0, 0.65, 0)
  applyUniformVertexColor(g, 0.85)
  return g
}

/** 把 glTF 多材质、多部件合并为单个带顶点色的几何体：保留细节配色，同时维持 1 DrawCall/类型 */
function applyUniformVertexColor(geo: THREE.BufferGeometry, shade: number) {
  const count = geo.getAttribute('position').count
  const colors = new Float32Array(count * 3).fill(shade)
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

function extractGeometry(gltf: { scene: THREE.Group }): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = []
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const g = mesh.geometry.clone()
    g.applyMatrix4(mesh.matrixWorld)
    // 材质基础色烘焙进顶点色；明暗层次保留，状态色仍通过 instanceColor 相乘
    const mat = mesh.material as THREE.MeshStandardMaterial
    const c = mat?.color ?? new THREE.Color(0xffffff)
    applyUniformVertexColor(g, 1)
    const attr = g.getAttribute('color')
    for (let i = 0; i < attr.count; i++) attr.setXYZ(i, c.r, c.g, c.b)
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    parts.push(g)
  })
  if (!parts.length) return null
  try {
    const merged = mergeGeometries(parts, false)
    parts.forEach((p) => p.dispose())
    return merged
  } catch {
    return parts[0]
  }
}

function buildInstanced(geometries: Map<DeviceType, THREE.BufferGeometry>) {
  const members = new Map<DeviceType, number[]>()
  for (const t of DEVICE_TYPES) members.set(t, [])
  for (const d of store.devices) members.get(d.type)!.push(d.id)

  deviceSlots = new Map()
  for (const [type, ids] of members) {
    const geo = geometries.get(type) ?? fallbackGeometry()
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.48, metalness: 0.32,
    })
    const high = new THREE.InstancedMesh(geo, mat, ids.length)
    high.name = `devices-${type}`
    high.castShadow = true
    high.receiveShadow = true
    high.userData.deviceIds = ids

    const lowGeo = new THREE.BoxGeometry(0.85, 1.25, 0.85)
    lowGeo.translate(0, 0.62, 0)
    const lowMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
    const low = new THREE.InstancedMesh(lowGeo, lowMat, ids.length)
    low.name = `devices-${type}-lod`
    low.userData.deviceIds = ids
    low.visible = false

    ids.forEach((id, index) => {
      deviceSlots.set(id, { type, index })
      dummy.position.copy(devicePositions[id])
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      high.setMatrixAt(index, dummy.matrix)
      low.setMatrixAt(index, dummy.matrix)
    })
    high.instanceMatrix.needsUpdate = true
    low.instanceMatrix.needsUpdate = true
    high.computeBoundingSphere()
    low.computeBoundingSphere()

    meshSets.set(type, { high, low, deviceIds: ids })
    scene.add(high, low)
  }
  syncAllColors()
}

function colorOf(id: number): THREE.Color {
  const snap = store.replaySnapshot
  const state = snap ? snap.states[id]?.s ?? store.devices[id].state : store.devices[id].state
  const c = new THREE.Color()
  return c.setHex(STATE_COLOR[state])
}

function syncAllColors() {
  for (const set of meshSets.values()) {
    set.deviceIds.forEach((id, index) => {
      const c = colorOf(id)
      set.high.setColorAt(index, c)
      set.low.setColorAt(index, c)
    })
    if (set.high.instanceColor) set.high.instanceColor.needsUpdate = true
    if (set.low.instanceColor) set.low.instanceColor.needsUpdate = true
  }
}

function syncHighlight() {
  const ids = Array.from(store.selectedIds)
  while (highlightGroup.children.length < ids.length) {
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, 1.65, 1.5)),
      new THREE.LineBasicMaterial({ color: 0x7dd3fc }),
    )
    highlightGroup.add(box)
  }
  highlightGroup.children.forEach((child, i) => {
    child.visible = i < ids.length
    if (i < ids.length) child.position.copy(devicePositions[ids[i]]).setY(0.82)
  })
  outlinePass.selectedObjects = highlightGroup.children.filter((c) => c.visible)
}

function syncLabels() {
  const ids = new Set<number>(store.selectedIds)
  for (const a of store.alarmList.slice(0, 8)) ids.add(a.deviceId)
  const target = Array.from(ids).slice(0, 12)

  while (labelObjects.length < target.length) {
    const el = document.createElement('div')
    el.className = 'scene-label'
    const obj = new CSS2DObject(el)
    scene.add(obj)
    labelObjects.push(obj)
  }
  labelObjects.forEach((obj, i) => {
    if (i >= target.length) { obj.visible = false; return }
    const id = target[i]
    const d = store.devices[id]
    obj.visible = true
    obj.position.copy(devicePositions[id]).setY(2.1)
    const el = obj.element as HTMLElement
    const isAlarm = store.alarmList.some((a) => a.deviceId === id)
    el.textContent = `${d.name} · ${STATE_LABEL[d.state]}`
    el.style.borderColor = isAlarm ? '#ef4444' : '#4ea1ff'
    el.style.color = isAlarm ? '#fecaca' : '#e6edf7'
  })
}

function setupScene(geometries: Map<DeviceType, THREE.BufferGeometry>) {
  if (!container.value) return
  const el = container.value
  const width = el.clientWidth || 800
  const height = el.clientHeight || 600

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b1220)
  scene.fog = new THREE.Fog(0x0b1220, 55, 120)

  camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 400)
  camera.position.set(0, 34, 44)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  el.appendChild(renderer.domElement)

  labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(width, height)
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.inset = '0'
  labelRenderer.domElement.style.pointerEvents = 'none'
  el.appendChild(labelRenderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = Math.PI / 2.1
  controls.minDistance = 10
  controls.maxDistance = 110
  controls.target.set(0, 0, 0)

  campus = buildCampus()
  scene.add(campus.group)

  buildInstanced(geometries)

  particles = new ParticleSystems()
  scene.add(particles.group)

  poi = buildPoiMarkers()
  scene.add(poi.group)
  patrolPath = buildPatrolPath()

  highlightGroup = new THREE.Group()
  scene.add(highlightGroup)

  hoverRing = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.0, 32),
    new THREE.MeshBasicMaterial({ color: 0x7dd3fc, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }),
  )
  hoverRing.rotation.x = -Math.PI / 2
  hoverRing.visible = false
  scene.add(hoverRing)

  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  bloomPass = new UnrealBloomPass(new THREE.Vector2(width * 0.5, height * 0.5), 0.4, 0.5, 0.85)
  composer.addPass(bloomPass)
  outlinePass = new OutlinePass(new THREE.Vector2(width, height), scene, camera)
  outlinePass.edgeStrength = 4
  outlinePass.edgeGlow = 0.6
  outlinePass.visibleEdgeColor.set('#7dd3fc')
  outlinePass.hiddenEdgeColor.set('#1e4a6b')
  composer.addPass(outlinePass)
  composer.addPass(new OutputPass())

  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)
  renderer.domElement.addEventListener('dblclick', onDoubleClick)

  observer = new ResizeObserver(() => {
    if (!container.value) return
    const w = container.value.clientWidth
    const h = container.value.clientHeight
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    labelRenderer.setSize(w, h)
    composer.setSize(w, h)
  })
  observer.observe(el)

  syncHighlight()
  syncLabels()
  fpsTime = performance.now()
  animate()
}

function setRayFromClient(clientX: number, clientY: number) {
  const rect = container.value!.getBoundingClientRect()
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  return rect
}

function pickPoi(clientX: number, clientY: number) {
  if (!poi || !store.poiEnabled) return null
  setRayFromClient(clientX, clientY)
  const hits = raycaster.intersectObjects(poi.sprites, false)
  return hits.length ? poi.getDef(hits[0].object as THREE.Sprite) : null
}

function openPoiCard(id: string, clientX: number, clientY: number) {
  const def = poi.sprites.map((s) => poi.getDef(s)).find((d) => d?.id === id)
  if (!def) return
  const devices = store.devices.filter((d) => def.deviceFilter(d))
  const alarms = store.alarmList.filter((a) => devices.some((d) => d.id === a.deviceId)).length
  const avgTemp = devices.length
    ? (devices.reduce((s, d) => s + d.temperature, 0) / devices.length).toFixed(1)
    : '--'
  const rect = container.value!.getBoundingClientRect()
  poiCard.value = {
    x: clientX - rect.left, y: clientY - rect.top,
    title: def.title, desc: def.desc,
    stats: `${devices.length} 台设备 · ${alarms} 条告警 · 均温 ${avgTemp}°C`,
  }
  store.activePoi = id
}

function pickDevice(clientX: number, clientY: number): number | null {
  if (!container.value) return null
  setRayFromClient(clientX, clientY)
  const objects: THREE.Object3D[] = []
  for (const set of meshSets.values()) objects.push(set.high.visible ? set.high : set.low)
  const hits = raycaster.intersectObjects(objects, false)
  if (!hits.length || hits[0].instanceId === undefined) return null
  const ids = hits[0].object.userData.deviceIds as number[]
  return ids[hits[0].instanceId] ?? null
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  if (store.selectMode || store.measureMode) {
    const rect = container.value!.getBoundingClientRect()
    boxRect.value = { x: e.clientX - rect.left, y: e.clientY - rect.top, w: 0, h: 0 }
  }
}

function onPointerUp(e: PointerEvent) {
  // POI 热点优先于设备拾取（测距/框选模式除外）
  if (!store.selectMode && !store.measureMode) {
    const def = pickPoi(e.clientX, e.clientY)
    if (def) {
      openPoiCard(def.id, e.clientX, e.clientY)
      return
    }
    poiCard.value = null
    store.activePoi = null
  }
  if (store.measureMode) {
    handleMeasureClick(e)
    boxRect.value = null
    return
  }
  if (store.selectMode && boxRect.value) {
    const rect = container.value!.getBoundingClientRect()
    const x1 = Math.min(boxRect.value.x, e.clientX - rect.left)
    const x2 = Math.max(boxRect.value.x, e.clientX - rect.left)
    const y1 = Math.min(boxRect.value.y, e.clientY - rect.top)
    const y2 = Math.max(boxRect.value.y, e.clientY - rect.top)
    if (x2 - x1 > 6 && y2 - y1 > 6) {
      const picked: number[] = []
      devicePositions.forEach((pos, id) => {
        const v = pos.clone().setY(0.8).project(camera)
        const sx = (v.x * 0.5 + 0.5) * rect.width
        const sy = (-v.y * 0.5 + 0.5) * rect.height
        if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) picked.push(id)
      })
      store.selectMany(picked, e.shiftKey)
    } else {
      const id = pickDevice(e.clientX, e.clientY)
      if (id !== null) store.select(id, e.shiftKey)
    }
    boxRect.value = null
    return
  }
  const id = pickDevice(e.clientX, e.clientY)
  if (id !== null) store.select(id, e.shiftKey)
}

function onPointerMove(e: PointerEvent) {
  // 触摸拖拽交给 OrbitControls 处理，不触发 hover tooltip / 框选
  if (e.pointerType === 'touch') return
  if (boxRect.value && container.value) {
    const rect = container.value.getBoundingClientRect()
    boxRect.value.w = e.clientX - rect.left - boxRect.value.x
    boxRect.value.h = e.clientY - rect.top - boxRect.value.y
    return
  }
  const id = pickDevice(e.clientX, e.clientY)
  if (id === null) {
    hoverTip.value = null
    hoverRing.visible = false
    return
  }
  const d = store.devices[id]
  const rect = container.value!.getBoundingClientRect()
  hoverTip.value = { x: e.clientX - rect.left, y: e.clientY - rect.top, name: d.name, state: d.state, temp: d.temperature }
  hoverRing.position.copy(devicePositions[id]).setY(0.03)
  hoverRing.visible = true
}

function onPointerLeave() {
  hoverTip.value = null
  hoverRing.visible = false
  boxRect.value = null
}

function onDoubleClick(e: MouseEvent) {
  const id = pickDevice(e.clientX, e.clientY)
  if (id !== null) flyToDevice(id)
}

function flyToDevice(id: number) {
  const p = devicePositions[id]
  const from = { x: camera.position.x, y: camera.position.y, z: camera.position.z,
    tx: controls.target.x, ty: controls.target.y, tz: controls.target.z }
  const to = { x: p.x + 8, y: 11, z: p.z + 12, tx: p.x, ty: 0.7, tz: p.z }
  new Tween(from, tweenGroup)
    .to(to, 800)
    .easing(Easing.Cubic.InOut)
    .onUpdate(() => {
      camera.position.set(from.x, from.y, from.z)
      controls.target.set(from.tx, from.ty, from.tz)
    })
    .start()
}

function applyPreset(preset: 'overview' | 'top' | 'aisle') {
  const from = { x: camera.position.x, y: camera.position.y, z: camera.position.z,
    tx: controls.target.x, ty: controls.target.y, tz: controls.target.z }
  const presets = {
    overview: { x: 0, y: 34, z: 44, tx: 0, ty: 0, tz: 0 },
    top: { x: 0, y: 62, z: 0.1, tx: 0, ty: 0, tz: 0 },
    aisle: { x: -FIELD_HALF - 6, y: 8, z: 0, tx: 0, ty: 1, tz: 0 },
  }
  new Tween(from, tweenGroup)
    .to(presets[preset], 900)
    .easing(Easing.Cubic.InOut)
    .onUpdate(() => {
      camera.position.set(from.x, from.y, from.z)
      controls.target.set(from.tx, from.ty, from.tz)
    })
    .start()
  store.cameraPreset = preset
}

function handleMeasureClick(e: PointerEvent) {
  if (!container.value) return
  const rect = container.value.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObject(campus.ground, false)[0]
  if (!hit) return
  measurePoints.push(hit.point.clone())
  if (measurePoints.length === 2) {
    const a = measurePoints[0], b = measurePoints[1]
    measureInfo.value = `距离 ${a.distanceTo(b).toFixed(2)} m`
    if (measureLine) { scene.remove(measureLine); measureLine.geometry.dispose() }
    measureLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a.clone().setY(0.1), b.clone().setY(0.1)]),
      new THREE.LineDashedMaterial({ color: 0xfbbf24, dashSize: 0.4, gapSize: 0.2 }),
    )
    measureLine.computeLineDistances()
    scene.add(measureLine)
    measurePoints = []
  } else {
    measureInfo.value = '请选择第二个点…'
  }
}

function clearMeasure() {
  if (measureLine) { scene.remove(measureLine); measureLine.geometry.dispose(); measureLine = null }
  measurePoints = []
  measureInfo.value = ''
}

function animate() {
  animId = requestAnimationFrame(animate)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000) || 0.016
  lastFrameTime = now
  tweenGroup.update(now)
  if (store.patrolMode && patrolPath) {
    patrolT = (patrolT + dt * 0.018 * store.patrolSpeed) % 1
    const cp = patrolPath.camera.getPointAt(patrolT)
    const tp = patrolPath.target.getPointAt(patrolT)
    camera.position.copy(cp)
    controls.target.copy(tp)
  }
  controls.update()
  particles?.sync(
    store.devices, devicePositions, dt,
    store.replaySnapshot ? store.replaySnapshot.states : undefined,
  )
  // 无选中对象时跳过描边通道：省一次全场景深度渲染
  outlinePass.enabled = outlinePass.selectedObjects.length > 0
  composer.render()
  labelRenderer.render(scene, camera)

  fpsFrames++
  if (now - fpsTime >= 500) {
    const fps = Math.round((fpsFrames * 1000) / (now - fpsTime))
    store.perf.fps = fps
    store.perf.calls = renderer.info.render.calls
    store.perf.triangles = renderer.info.render.triangles
    store.perf.points = renderer.info.render.points
    store.perf.lines = renderer.info.render.lines
    // 自适应画质：连续 3 次低于 50fps 则关闭辉光与阴影，保障流畅度
    if (fps < 50) lowFpsStreak++
    else lowFpsStreak = 0
    if (lowFpsStreak >= 3 && !qualityReduced) {
      qualityReduced = true
      bloomPass.enabled = false
      renderer.shadowMap.enabled = false
      particles?.setEnabled(false)
    }
    fpsFrames = 0
    fpsTime = now
  }
}

onMounted(async () => {
  const loader = new GLTFLoader()
  const types = [...DEVICE_TYPES]
  const results = await Promise.allSettled(
    types.map((t) => loader.loadAsync(`${import.meta.env.BASE_URL}models/${TYPE_MODEL[t]}`)),
  )
  const geometries = new Map<DeviceType, THREE.BufferGeometry>()
  let failed = 0
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const g = extractGeometry(r.value)
      if (g) geometries.set(types[i], g)
      else failed++
    } else failed++
  })
  if (failed) {
    loadError.value = true
    for (const t of types) if (!geometries.has(t)) geometries.set(t, fallbackGeometry())
  }
  setupScene(geometries)
  loading.value = false
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animId)
  observer?.disconnect()
  if (!renderer) return
  renderer.domElement.removeEventListener('pointerdown', onPointerDown)
  renderer.domElement.removeEventListener('pointermove', onPointerMove)
  renderer.domElement.removeEventListener('pointerup', onPointerUp)
  renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
  renderer.domElement.removeEventListener('dblclick', onDoubleClick)
  controls?.dispose()
  campus?.dispose()
  particles?.dispose()
  poi?.dispose()
  composer?.dispose()
  renderer.dispose()
  renderer.domElement.remove()
  labelRenderer?.domElement.remove()
})

watch(() => store.tickCount, () => { syncAllColors(); syncLabels() })
watch(() => store.playbackMode, () => syncAllColors())
watch(() => store.playbackIndex, () => syncAllColors())
watch(() => Array.from(store.selectedIds).join(','), () => { syncHighlight(); syncLabels() })
watch(() => store.dayMode, (v) => campus?.setDayMode(v))
watch(() => store.lodEnabled, (v) => {
  const far = camera?.position.distanceTo(controls?.target ?? new THREE.Vector3()) > 55
  const useLow = v && far
  for (const set of meshSets.values()) { set.high.visible = !useLow; set.low.visible = useLow }
})
watch(() => store.cameraPreset, (p) => { if (p) applyPreset(p) })
watch(() => store.measureMode, (v) => { if (!v) clearMeasure() })
watch(() => store.poiEnabled, (v) => { if (poi) poi.group.visible = v; if (!v) { poiCard.value = null; store.activePoi = null } })
// 巡检时用户主动旋转/缩放则自动退出，避免抢占相机
watch(() => store.patrolMode, (v) => {
  if (!v) return
  const stop = () => {
    if (store.patrolMode) store.patrolMode = false
    controls.removeEventListener('start', stop)
  }
  controls.addEventListener('start', stop)
})

defineExpose({ flyToDevice, applyPreset })
</script>

<template>
  <div ref="container" class="scene-wrap">
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <div>正在加载四种 glTF 模型并初始化园区…</div>
    </div>
    <div v-if="hoverTip" class="tooltip" :style="{ left: hoverTip.x + 'px', top: hoverTip.y + 'px' }">
      <div class="tname">{{ hoverTip.name }}</div>
      <div>状态：{{ STATE_LABEL[hoverTip.state] }} · 温度：{{ hoverTip.temp.toFixed(1) }}°C</div>
    </div>
    <div v-if="boxRect" class="box-select" :style="{
      left: Math.min(boxRect.x, boxRect.x + boxRect.w) + 'px',
      top: Math.min(boxRect.y, boxRect.y + boxRect.h) + 'px',
      width: Math.abs(boxRect.w) + 'px', height: Math.abs(boxRect.h) + 'px',
    }"></div>
    <div v-if="loadError" class="scene-hint" style="color: #f59e0b">部分 glTF 加载失败，已用内置几何体降级</div>
    <div v-if="measureInfo" class="measure-tip">{{ measureInfo }}</div>
    <div v-if="poiCard" class="poi-card" :style="{ left: poiCard.x + 'px', top: poiCard.y + 'px' }">
      <div class="poi-title">{{ poiCard.title }}</div>
      <div class="poi-desc">{{ poiCard.desc }}</div>
      <div class="poi-stats">{{ poiCard.stats }}</div>
      <button class="poi-close" @click="poiCard = null; store.activePoi = null">×</button>
    </div>
    <div class="scene-hint">
      {{ store.selectMode ? '框选模式：拖拽框选' : store.measureMode ? '测距模式：点击地面两点' : '左键旋转 · 滚轮缩放 · 点击选中 · 双击聚焦' }}
    </div>
  </div>
</template>
