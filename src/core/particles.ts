import * as THREE from 'three'
import type { Device } from '../types'

export type ParticleKind = 'spark' | 'smoke' | 'steam'

type Preset = {
  capacity: number
  color: THREE.Color
  blending: THREE.Blending
  life: [number, number]
  speed: [number, number]
  spread: number
  gravity: number
  drag: number
  size: [number, number]
  growth: number
}

const PRESETS: Record<ParticleKind, Preset> = {
  spark: {
    capacity: 160, color: new THREE.Color('#ff8a3d'), blending: THREE.AdditiveBlending,
    life: [0.5, 1.0], speed: [2.6, 5.2], spread: 2.2, gravity: -9.4, drag: 0.02,
    size: [3.5, 6.5], growth: -1.5,
  },
  smoke: {
    capacity: 220, color: new THREE.Color('#8a93a6'), blending: THREE.NormalBlending,
    life: [1.6, 2.8], speed: [0.5, 1.2], spread: 0.5, gravity: 0.35, drag: 0.06,
    size: [7, 12], growth: 9,
  },
  steam: {
    capacity: 120, color: new THREE.Color('#cfe6f2'), blending: THREE.NormalBlending,
    life: [1.2, 2.0], speed: [0.4, 0.9], spread: 0.35, gravity: 0.2, drag: 0.08,
    size: [5, 9], growth: 6,
  },
}

const VERT = `
attribute vec3 color;
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = color;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (320.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`

const FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.08, d);
  gl_FragColor = vec4(vColor, vAlpha * soft);
}`

type Particle = {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  age: number; life: number; size: number; growth: number
  active: boolean
}

/** 单个粒子场：固定容量、环形复用槽位、一次 DrawCall。 */
class ParticleField {
  readonly points: THREE.Points
  private preset: Preset
  private pool: Particle[]
  private cursor = 0
  private posAttr: THREE.BufferAttribute
  private colAttr: THREE.BufferAttribute
  private sizeAttr: THREE.BufferAttribute
  private alphaAttr: THREE.BufferAttribute
  private material: THREE.ShaderMaterial

  constructor(kind: ParticleKind) {
    const p = PRESETS[kind]
    this.preset = p
    this.pool = Array.from({ length: p.capacity }, () => ({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      age: 0, life: 1, size: 1, growth: 0, active: false,
    }))
    const positions = new Float32Array(p.capacity * 3)
    const colors = new Float32Array(p.capacity * 3)
    const sizes = new Float32Array(p.capacity)
    const alphas = new Float32Array(p.capacity)
    for (let i = 0; i < p.capacity; i++) {
      colors[i * 3] = p.color.r
      colors[i * 3 + 1] = p.color.g
      colors[i * 3 + 2] = p.color.b
    }
    const geo = new THREE.BufferGeometry()
    this.posAttr = new THREE.BufferAttribute(positions, 3)
    this.colAttr = new THREE.BufferAttribute(colors, 3)
    this.sizeAttr = new THREE.BufferAttribute(sizes, 1)
    this.alphaAttr = new THREE.BufferAttribute(alphas, 1)
    this.posAttr.setUsage(THREE.DynamicDrawUsage)
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage)
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', this.posAttr)
    geo.setAttribute('color', this.colAttr)
    geo.setAttribute('aSize', this.sizeAttr)
    geo.setAttribute('aAlpha', this.alphaAttr)
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200)

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: p.blending,
    })
    this.points = new THREE.Points(geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 3
  }

  emit(x: number, y: number, z: number) {
    const p = this.preset
    const slot = this.cursor++ % p.capacity
    const q = this.pool[slot]
    const angle = Math.random() * Math.PI * 2
    const speed = p.speed[0] + Math.random() * (p.speed[1] - p.speed[0])
    q.x = x + (Math.random() - 0.5) * p.spread * 0.3
    q.y = y
    q.z = z + (Math.random() - 0.5) * p.spread * 0.3
    q.vx = Math.cos(angle) * speed * 0.25 * p.spread * 0.35
    q.vz = Math.sin(angle) * speed * 0.25 * p.spread * 0.35
    q.vy = speed
    q.age = 0
    q.life = p.life[0] + Math.random() * (p.life[1] - p.life[0])
    q.size = p.size[0] + Math.random() * (p.size[1] - p.size[0])
    q.growth = p.growth
    q.active = true
  }

  update(dt: number) {
    const p = this.preset
    const dragFactor = Math.max(0, 1 - p.drag * dt * 60)
    for (let i = 0; i < this.pool.length; i++) {
      const q = this.pool[i]
      if (!q.active) continue
      q.age += dt
      if (q.age >= q.life) {
        q.active = false
        this.alphaAttr.setX(i, 0)
        this.sizeAttr.setX(i, 0)
        continue
      }
      q.vx *= dragFactor
      q.vz *= dragFactor
      q.vy = q.vy * dragFactor + p.gravity * dt
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.z += q.vz * dt
      const t = q.age / q.life
      this.posAttr.setXYZ(i, q.x, q.y, q.z)
      this.sizeAttr.setX(i, Math.max(0.5, q.size + q.growth * t))
      this.alphaAttr.setX(i, (1 - t) * (t < 0.12 ? t / 0.12 : 1) * 0.85)
    }
    this.posAttr.needsUpdate = true
    this.sizeAttr.needsUpdate = true
    this.alphaAttr.needsUpdate = true
  }

  get activeCount() {
    return this.pool.reduce((n, q) => n + (q.active ? 1 : 0), 0)
  }

  dispose() {
    this.points.geometry.dispose()
    this.material.dispose()
  }
}

/**
 * 设备状态驱动的三类特效：故障=火花+浓烟，告警=烟，运行=轻微蒸汽。
 * 内部按设备维度节流，避免每帧为 120 台设备全量发射。
 */
export class ParticleSystems {
  readonly group = new THREE.Group()
  private fields: Record<ParticleKind, ParticleField>
  private nextEmit = new Map<number, number>()
  private elapsed = 0
  private enabled = true

  constructor() {
    this.fields = {
      spark: new ParticleField('spark'),
      smoke: new ParticleField('smoke'),
      steam: new ParticleField('steam'),
    }
    this.group.add(this.fields.spark.points, this.fields.smoke.points, this.fields.steam.points)
  }

  setEnabled(v: boolean) {
    this.enabled = v
    this.group.visible = v
  }

  sync(
    devices: Device[],
    positions: THREE.Vector3[],
    dt: number,
    replayStates?: Array<{ id: number; s: string }>,
  ) {
    if (!this.enabled) return
    this.elapsed += dt
    for (const f of Object.values(this.fields)) f.update(dt)
    if (this.elapsed < 0.1) return

    for (let i = 0; i < devices.length; i++) {
      const d = devices[i]
      const pos = positions[i]
      if (!pos) continue
      const replay = replayStates?.find((s) => s.id === d.id)
      const state = replay ? replay.s : d.state
      const due = this.nextEmit.get(d.id) ?? 0
      if (this.elapsed < due) continue

      const topY = 1.7
      if (state === 'fault') {
        this.fields.spark.emit(pos.x, topY, pos.z)
        this.fields.smoke.emit(pos.x, topY, pos.z)
        this.nextEmit.set(d.id, this.elapsed + 0.12 + Math.random() * 0.18)
      } else if (state === 'warning') {
        this.fields.smoke.emit(pos.x, topY, pos.z)
        this.nextEmit.set(d.id, this.elapsed + 0.35 + Math.random() * 0.3)
      } else if (state === 'running' && d.temperature > 58 && Math.random() < 0.03) {
        this.fields.steam.emit(pos.x, topY, pos.z)
        this.nextEmit.set(d.id, this.elapsed + 0.5)
      }
    }
  }

  get activeCount() {
    return Object.values(this.fields).reduce((n, f) => n + f.activeCount, 0)
  }

  dispose() {
    Object.values(this.fields).forEach((f) => f.dispose())
  }
}
