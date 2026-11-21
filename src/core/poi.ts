import * as THREE from 'three'
import { FIELD_W, FIELD_D } from './campus'

export interface PoiDefinition {
  id: string
  title: string
  desc: string
  position: [number, number, number]
  color: string
  /** 该热点覆盖的设备 id 范围（用于信息卡统计） */
  deviceFilter: (device: { zone: string; type: string }) => boolean
}

export const POIS: PoiDefinition[] = [
  {
    id: 'zone-a', title: 'A 区 · 反应釜集群', desc: '核心反应工段，重点关注温度与压力联锁',
    position: [-FIELD_W * 0.28, 3.4, -FIELD_D * 0.32], color: '#4ea1ff',
    deviceFilter: (d) => d.zone === 'A 区',
  },
  {
    id: 'zone-b', title: 'B 区 · 储罐区', desc: '原料与成品暂存，监测液位与压力趋势',
    position: [FIELD_W * 0.28, 3.4, -FIELD_D * 0.02], color: '#22d3ee',
    deviceFilter: (d) => d.zone === 'B 区',
  },
  {
    id: 'zone-c', title: 'C 区 · 冷却塔群', desc: '循环水冷却系统，关注负载与振动',
    position: [-FIELD_W * 0.28, 3.4, FIELD_D * 0.32], color: '#a78bfa',
    deviceFilter: (d) => d.zone === 'C 区',
  },
  {
    id: 'substation', title: '变配电中心', desc: '全厂配电枢纽，配电柜集中监控',
    position: [FIELD_W * 0.42, 3.4, -FIELD_D * 0.4], color: '#fbbf24',
    deviceFilter: (d) => d.type === 'cabinet',
  },
  {
    id: 'gate', title: '园区主入口', desc: '物流与人流主通道',
    position: [0, 2.8, FIELD_D * 0.58], color: '#34d399',
    deviceFilter: () => false,
  },
]

function markerTexture(color: string): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.22
  ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(64, 64, 40, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(64, 64, 14, 0, Math.PI * 2); ctx.fill()
  return new THREE.CanvasTexture(canvas)
}

export interface PoiMarkers {
  group: THREE.Group
  sprites: THREE.Sprite[]
  getDef: (sprite: THREE.Sprite) => PoiDefinition | null
  dispose: () => void
}

export function buildPoiMarkers(): PoiMarkers {
  const group = new THREE.Group()
  group.name = 'poi-markers'
  const sprites: THREE.Sprite[] = []
  const defBySprite = new Map<THREE.Sprite, PoiDefinition>()
  const textures: THREE.CanvasTexture[] = []

  for (const def of POIS) {
    const tex = markerTexture(def.color)
    textures.push(tex)
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: true,
    })
    const sprite = new THREE.Sprite(mat)
    sprite.position.set(...def.position)
    sprite.scale.set(2.6, 2.6, 1)
    sprite.renderOrder = 10
    sprite.userData.poiId = def.id
    sprites.push(sprite)
    defBySprite.set(sprite, def)
    group.add(sprite)
  }

  return {
    group,
    sprites,
    getDef: (sprite) => defBySprite.get(sprite) ?? null,
    dispose: () => {
      textures.forEach((t) => t.dispose())
      sprites.forEach((s) => (s.material as THREE.SpriteMaterial).dispose())
    },
  }
}

/** 巡检航线：一条低位环绕样条 + 一条稍高的注视点样条 */
export function buildPatrolPath(): { camera: THREE.CatmullRomCurve3; target: THREE.CatmullRomCurve3 } {
  const rx = FIELD_W * 0.62
  const rz = FIELD_D * 0.72
  const cameraPoints: THREE.Vector3[] = []
  const targetPoints: THREE.Vector3[] = []
  const N = 8
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    cameraPoints.push(new THREE.Vector3(
      Math.cos(a) * rx,
      9 + Math.sin(a * 2) * 3.5,
      Math.sin(a) * rz,
    ))
    targetPoints.push(new THREE.Vector3(
      Math.cos(a) * FIELD_W * 0.12,
      1.2,
      Math.sin(a) * FIELD_D * 0.12,
    ))
  }
  return {
    camera: new THREE.CatmullRomCurve3(cameraPoints, true, 'catmullrom', 0.5),
    target: new THREE.CatmullRomCurve3(targetPoints, true, 'catmullrom', 0.5),
  }
}
