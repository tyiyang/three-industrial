<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { useDeviceStore, DEVICE_COUNT } from '../composables/useDeviceStore'
import { STATUS_COLOR, STATUS_LABEL, type DeviceStatus } from '../types'

const { devices, selectedId, grid } = useDeviceStore()

const container = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const loadError = ref(false)
const fps = ref(0)
const hover = ref<{ x: number; y: number; name: string; status: DeviceStatus; temp: number } | null>(null)

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let instanced: THREE.InstancedMesh | null = null
let highlightBox: THREE.LineSegments | null = null
let highlightRing: THREE.Mesh | null = null
let animId = 0
let observer: ResizeObserver | null = null

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()
const positions: THREE.Vector3[] = []
const statusIndex: Record<DeviceStatus, number> = { normal: 0, warning: 1, error: 2, offline: 3 }
const lastStatus = new Int8Array(DEVICE_COUNT).fill(-1)
let frames = 0
let fpsTime = 0

const SPACING = 3.4

function devicePosition(index: number): THREE.Vector3 {
  const col = index % grid.cols
  const row = Math.floor(index / grid.cols)
  return new THREE.Vector3(
    (col - (grid.cols - 1) / 2) * SPACING,
    0,
    (row - (grid.rows - 1) / 2) * SPACING,
  )
}

for (let i = 0; i < DEVICE_COUNT; i++) positions.push(devicePosition(i))

function buildFallbackGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1.3, 1)
  g.translate(0, 0.65, 0)
  return g
}

function updateAllColors() {
  if (!instanced) return
  for (let i = 0; i < DEVICE_COUNT; i++) {
    const s = devices[i].status
    lastStatus[i] = statusIndex[s]
    tmpColor.setHex(STATUS_COLOR[s])
    instanced.setColorAt(i, tmpColor)
  }
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
}

function syncColors() {
  if (!instanced) return
  let dirty = false
  for (let i = 0; i < DEVICE_COUNT; i++) {
    const idx = statusIndex[devices[i].status]
    if (lastStatus[i] !== idx) {
      lastStatus[i] = idx
      tmpColor.setHex(STATUS_COLOR[devices[i].status])
      instanced.setColorAt(i, tmpColor)
      dirty = true
    }
  }
  if (dirty && instanced.instanceColor) instanced.instanceColor.needsUpdate = true
}

function updateHighlight() {
  if (!highlightBox || !highlightRing) return
  const id = selectedId.value
  if (id === null) {
    highlightBox.visible = false
    highlightRing.visible = false
    return
  }
  const p = positions[id]
  highlightBox.position.set(p.x, 0.78, p.z)
  highlightRing.position.set(p.x, 0.03, p.z)
  highlightBox.visible = true
  highlightRing.visible = true
}

function setupScene(geometry: THREE.BufferGeometry) {
  if (!container.value) return
  const el = container.value
  const width = el.clientWidth
  const height = el.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b1220)
  scene.fog = new THREE.Fog(0x0b1220, 45, 95)

  camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 300)
  camera.position.set(0, 32, 40)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = Math.PI / 2.15
  controls.minDistance = 12
  controls.maxDistance = 90
  controls.target.set(0, 0, 0)

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 1.1))
  const hemi = new THREE.HemisphereLight(0x9ccbff, 0x0b1220, 0.7)
  scene.add(hemi)
  const dir = new THREE.DirectionalLight(0xffffff, 1.4)
  dir.position.set(20, 35, 15)
  scene.add(dir)

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 80),
    new THREE.MeshStandardMaterial({ color: 0x101b30, roughness: 0.95, metalness: 0.05 }),
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)

  const gridHelper = new THREE.GridHelper(80, 40, 0x2b4a78, 0x1d3050)
  gridHelper.position.y = 0.01
  ;(gridHelper.material as THREE.Material).transparent = true
  ;(gridHelper.material as THREE.Material).opacity = 0.55
  scene.add(gridHelper)

  // Zone separators
  for (let z = 0; z < 3; z++) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(grid.cols * SPACING + 4, 0.35),
      new THREE.MeshBasicMaterial({ color: 0x1e3a5f }),
    )
    strip.rotation.x = -Math.PI / 2
    strip.position.set(0, 0.02, (z - 1) * SPACING * 3.5 + SPACING * 1.5)
    scene.add(strip)
  }

  // Instanced devices — one draw call for all 120 devices
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.3,
    emissive: 0x000000,
  })
  instanced = new THREE.InstancedMesh(geometry, material, DEVICE_COUNT)
  instanced.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  for (let i = 0; i < DEVICE_COUNT; i++) {
    dummy.position.copy(positions[i])
    dummy.rotation.set(0, 0, 0)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    instanced.setMatrixAt(i, dummy.matrix)
  }
  instanced.instanceMatrix.needsUpdate = true
  updateAllColors()
  scene.add(instanced)

  // Selection highlight
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.55, 1.62, 1.55))
  highlightBox = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x4ea1ff, transparent: true, opacity: 0.95 }),
  )
  highlightBox.visible = false
  scene.add(highlightBox)

  highlightRing = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.12, 40),
    new THREE.MeshBasicMaterial({ color: 0x4ea1ff, side: THREE.DoubleSide, transparent: true, opacity: 0.65 }),
  )
  highlightRing.rotation.x = -Math.PI / 2
  highlightRing.visible = false
  scene.add(highlightRing)
  updateHighlight()

  // Events
  renderer.domElement.addEventListener('click', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)

  observer = new ResizeObserver(() => {
    if (!container.value) return
    const w = container.value.clientWidth
    const h = container.value.clientHeight
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  })
  observer.observe(el)

  fpsTime = performance.now()
  animate()
}

function pick(event: MouseEvent): number | null {
  if (!instanced || !container.value) return null
  const rect = container.value.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObject(instanced, false)
  return hits.length && hits[0].instanceId !== undefined ? hits[0].instanceId : null
}

function onPointerDown(event: MouseEvent) {
  const id = pick(event)
  if (id !== null) selectedId.value = id
}

function onPointerMove(event: PointerEvent) {
  const id = pick(event)
  if (id === null) {
    hover.value = null
    return
  }
  const d = devices[id]
  const rect = container.value!.getBoundingClientRect()
  hover.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    name: d.name,
    status: d.status,
    temp: d.temperature,
  }
}

function onPointerLeave() {
  hover.value = null
}

function animate() {
  animId = requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
  frames++
  const now = performance.now()
  if (now - fpsTime >= 1000) {
    fps.value = Math.round((frames * 1000) / (now - fpsTime))
    frames = 0
    fpsTime = now
  }
}

onMounted(() => {
  const loader = new GLTFLoader()
  loader.load(
    `${import.meta.env.BASE_URL}models/device.gltf`,
    (gltf) => {
      let geometry: THREE.BufferGeometry | null = null
      gltf.scene.traverse((obj) => {
        if (!geometry && (obj as THREE.Mesh).isMesh) {
          geometry = (obj as THREE.Mesh).geometry.clone()
        }
      })
      setupScene(geometry ?? buildFallbackGeometry())
      loading.value = false
    },
    undefined,
    () => {
      // Fallback if the glTF is missing so the demo still runs
      setupScene(buildFallbackGeometry())
      loadError.value = true
      loading.value = false
    },
  )
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animId)
  observer?.disconnect()
  if (renderer) {
    renderer.domElement.removeEventListener('click', onPointerDown)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
    controls?.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
  scene?.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((m) => m.dispose())
    }
  })
})

watch(
  () => devices.map((d) => d.status).join(','),
  () => syncColors(),
)
watch(() => selectedId.value, () => updateHighlight())
</script>

<template>
  <div ref="container" class="scene-wrap">
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <div>正在加载 glTF 模型并初始化场景…</div>
    </div>
    <div class="fps"><b>{{ fps }}</b> FPS · {{ DEVICE_COUNT }} 实例 · 1 Draw Call</div>
    <div v-if="loadError" class="scene-hint" style="color: #f59e0b">glTF 加载失败，已使用内置几何体降级</div>
    <div v-if="hover" class="tooltip" :style="{ left: hover.x + 'px', top: hover.y + 'px' }">
      <div class="tname">{{ hover.name }}</div>
      <div>状态：{{ STATUS_LABEL[hover.status] }} · 温度：{{ hover.temp.toFixed(1) }}°C</div>
    </div>
    <div class="scene-hint">左键旋转 · 滚轮缩放 · 右键平移 · 点击设备选中</div>
  </div>
</template>
