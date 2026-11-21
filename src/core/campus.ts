import * as THREE from 'three'
import { GRID_COLS, GRID_ROWS } from '../stores/useDemoStore'

export const SPACING = 3.4
export const FIELD_W = GRID_COLS * SPACING
export const FIELD_D = GRID_ROWS * SPACING

export interface CampusResult {
  group: THREE.Group
  ground: THREE.Mesh
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  ambient: THREE.AmbientLight
  setDayMode: (day: boolean) => void
  dispose: () => void
}

/** 构建园区静态场景：地面、道路、厂房、绿化、围墙、路灯、天空 */
export function buildCampus(): CampusResult {
  const group = new THREE.Group()
  group.name = 'campus'

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x0f1a2c, roughness: 0.95, metalness: 0.05 })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 90), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  group.add(ground)

  const grid = new THREE.GridHelper(80, 40, 0x2b4a78, 0x1b2d4a)
  grid.position.y = 0.012
  const gridMat = grid.material as THREE.Material
  gridMat.transparent = true
  gridMat.opacity = 0.5
  group.add(grid)

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x1a2638, roughness: 0.9 })
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x3a5f8f })

  // 横向主干道（分隔 A/B/C 三个区）
  for (let z = 0; z < 3; z++) {
    const y = (z - 1) * SPACING * 3.5 + SPACING * 1.5
    const road = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W + 8, 1.2), roadMat)
    road.rotation.x = -Math.PI / 2
    road.position.set(0, 0.02, y)
    road.receiveShadow = true
    group.add(road)
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W + 6, 0.06), lineMat)
    dash.rotation.x = -Math.PI / 2
    dash.position.set(0, 0.025, y)
    group.add(dash)
  }
  // 纵向道路
  for (const x of [-FIELD_W / 2 - 3, FIELD_W / 2 + 3]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(1.2, FIELD_D + 8), roadMat)
    road.rotation.x = -Math.PI / 2
    road.position.set(x, 0.02, 0)
    group.add(road)
  }

  // 厂房建筑（园区边缘）
  const buildingMat = new THREE.MeshStandardMaterial({ color: 0x1c2a40, roughness: 0.7, metalness: 0.2 })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x24405f, roughness: 0.6, metalness: 0.3 })
  const windowMat = new THREE.MeshBasicMaterial({ color: 0x4a9fe0 })
  const buildings: Array<[number, number, number, number, number]> = [
    [-28, -26, 8, 5, 9], [-16, -28, 7, 4, 7], [16, -28, 9, 5, 8], [28, -25, 7, 4, 7],
    [-29, 24, 8, 5, 8], [29, 25, 9, 5, 9],
  ]
  for (const [x, z, w, h, d] of buildings) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat)
    b.position.set(x, h / 2, z)
    group.add(b)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.25, d + 0.5), roofMat)
    roof.position.set(x, h + 0.12, z)
    group.add(roof)
    for (let k = 0; k < 3; k++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.5), windowMat)
      win.position.set(x, 1.2 + k * 1.1, z + d / 2 + 0.01)
      group.add(win)
    }
  }

  // 绿化带（实例化树）
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6)
  const crownGeo = new THREE.ConeGeometry(0.65, 1.6, 7)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 })
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x1e6b44, roughness: 1 })
  const treeCount = 28
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount)
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < treeCount; i++) {
    const side = i % 2 ? 1 : -1
    const x = side * (FIELD_W / 2 + 5 + (i % 3) * 1.8)
    const z = -32 + (i / treeCount) * 64
    dummy.position.set(x, 0.4, z); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix)
    dummy.position.set(x, 1.6, z); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix)
  }
  // 绿化不投影：减少 shadow map 绘制批次
  group.add(trunks, crowns)

  // 围墙
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x2a3d58, roughness: 0.8 })
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 74), fenceMat)
    f.position.set(sx * (FIELD_W / 2 + 8), 0.7, 0)
    group.add(f)
  }
  for (const sz of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W + 16, 1.4, 0.25), fenceMat)
    f.position.set(0, 0.7, sz * 36)
    group.add(f)
  }

  // 路灯
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x44546a, metalness: 0.6, roughness: 0.4 })
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 })
  const lamps: THREE.Mesh[] = []
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = sx * (FIELD_W / 2 + 3.5)
      const z = -24 + i * 12
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.5, 6), poleMat)
      pole.position.set(x, 2.25, z)
      group.add(pole)
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lampMat.clone())
      lamp.position.set(x, 4.5, z)
      group.add(lamp)
      lamps.push(lamp)
    }
  }

  // 灯光
  const ambient = new THREE.AmbientLight(0xffffff, 0.85)
  const hemi = new THREE.HemisphereLight(0x9ccbff, 0x0b1220, 0.6)
  const sun = new THREE.DirectionalLight(0xffffff, 1.35)
  sun.position.set(22, 38, 18)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -45
  sun.shadow.camera.right = 45
  sun.shadow.camera.top = 45
  sun.shadow.camera.bottom = -45
  sun.shadow.bias = -0.0005
  group.add(ambient, hemi, sun)

  function setDayMode(day: boolean) {
    ambient.intensity = day ? 0.85 : 0.28
    hemi.intensity = day ? 0.6 : 0.22
    sun.intensity = day ? 1.35 : 0.35
    sun.color.setHex(day ? 0xffffff : 0x7b9fd6)
    groundMat.color.setHex(day ? 0x0f1a2c : 0x080e18)
    for (const lamp of lamps) (lamp.material as THREE.MeshBasicMaterial).color.setHex(day ? 0x6b6450 : 0xffe9b0)
  }
  setDayMode(true)

  function dispose() {
    group.traverse((obj) => {
      const m = obj as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      if (m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        mats.forEach((x) => x.dispose())
      }
    })
  }

  return { group, ground, sun, hemi, ambient, setDayMode, dispose }
}
