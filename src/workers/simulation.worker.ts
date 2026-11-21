/// <reference lib="webworker" />
import type { Alarm, Device, DevicePatch, DeviceState, Snapshot, WorkerIn, WorkerOut } from '../types'
import { AlarmEngine } from '../core/alarmEngine'
import { RingBuffer } from '../core/ringBuffer'
import { inferState, transition } from '../core/stateMachine'

let devices: Device[] = []
let devicesById = new Map<number, Device>()
let engine = new AlarmEngine()
let tickMs = 2000
let timer: ReturnType<typeof setInterval> | null = null
let paused = false
let tickCount = 0
const history = new RingBuffer<Snapshot>(120)
/** 每台设备的温度基准值，遥测向它回归，避免随机游走单调漂移 */
let baselines = new Map<number, number>()

function post(msg: WorkerOut) {
  self.postMessage(msg)
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function init(list: Device[]) {
  devices = list.map((d) => ({ ...d }))
  devicesById = new Map(devices.map((d) => [d.id, d]))
  // 基准温度限定在安全区间 42~59°C（低于告警清除线 68），
  // 保证尖峰触发的告警能随均值回归自然恢复，不会无限累积
  baselines = new Map(devices.map((d) => [d.id, 42 + ((d.id * 7) % 18)]))
  engine = new AlarmEngine()
  history.clear()
  tickCount = 0
  post({ type: 'ready' })
}

function randomWalk(v: number, step: number, lo: number, hi: number) {
  return clamp(v + (Math.random() - 0.5) * step, lo, hi)
}

function tick() {
  if (paused || devices.length === 0) return
  tickCount++
  const now = Date.now()
  const patches: DevicePatch[] = []
  const changed = new Set<number>()

  // 每 tick 更新约 30% 设备（模拟真实遥测抽样）
  const count = Math.max(12, Math.round(devices.length * 0.3))
  while (changed.size < count) changed.add(Math.floor(Math.random() * devices.length))

  for (const id of changed) {
    const d = devicesById.get(id)
    if (!d) continue

    if (d.state === 'offline') {
      if (Math.random() < 0.08) {
        d.state = transition('offline', 'running')
        d.temperature = 42
        d.pressure = 1.2
        patches.push({ id, state: d.state, temperature: d.temperature, pressure: d.pressure })
      }
      continue
    }

    // 均值回归 + 偶发尖峰：尖峰会随时间衰减，避免告警无限累积
    const base = baselines.get(id) ?? 50
    const spike = Math.random() < 0.035 ? Math.random() * 16 + 7 : 0
    const revert = (base - d.temperature) * 0.22
    d.temperature = randomWalk(d.temperature + revert + spike, 5, 28, 96)
    d.vibration = randomWalk(d.vibration + (1.8 - d.vibration) * 0.25 + (spike ? spike / 4 : 0), 0.9, 0.5, 9.8)
    d.pressure = randomWalk(d.pressure + (1.3 - d.pressure) * 0.2, 0.22, 0.2, 4.2)
    d.load = randomWalk(d.load + (55 - d.load) * 0.18, 10, 2, 100)
    if (d.state !== 'maintenance') {
      const inferred = inferState(d.temperature, d.vibration, d.load, d.state)
      d.state = transition(d.state, inferred)
    }
    d.runtime += tickMs / 3_600_000
    d.health = clamp(
      100 - Math.max(0, d.temperature - 60) * 1.1 - Math.max(0, d.vibration - 4) * 3 - (d.state === 'fault' ? 20 : 0),
      5, 100,
    )
    d.updatedAt = now

    patches.push({
      id,
      state: d.state,
      temperature: +d.temperature.toFixed(1),
      pressure: +d.pressure.toFixed(2),
      load: +d.load.toFixed(0),
      vibration: +d.vibration.toFixed(2),
      health: +d.health.toFixed(0),
      runtime: +d.runtime.toFixed(2),
    })
  }

  const alarmChanges: Alarm[] = engine.evaluate(devices, now)
  const active = engine.getActiveAlarms()

  const stats: Snapshot['stats'] = {
    running: 0, standby: 0, warning: 0, fault: 0, maintenance: 0, offline: 0, alarms: active.length,
  }
  const states: Snapshot['states'] = []
  for (const d of devices) {
    stats[d.state]++
    states.push({ id: d.id, s: d.state, temp: +d.temperature.toFixed(1), load: +d.load.toFixed(0) })
  }
  const snapshot: Snapshot = { t: now, states, stats }
  history.push(snapshot)

  post({ type: 'tick', t: now, patches, alarms: alarmChanges, snapshot })
}

function setInterval_(ms: number) {
  if (timer) clearInterval(timer)
  tickMs = ms
  timer = setInterval(tick, ms)
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data
  switch (msg.type) {
    case 'init': init(msg.devices); break
    case 'interval': setInterval_(msg.ms); break
    case 'pause': paused = msg.paused; break
    case 'inject': {
      const d = devicesById.get(msg.id)
      if (d) {
        d.state = transition(d.state, msg.state)
        post({ type: 'tick', t: Date.now(), patches: [{ id: d.id, state: d.state }], alarms: [], snapshot: {
          t: Date.now(),
          states: devices.map((x) => ({ id: x.id, s: x.state, temp: +x.temperature.toFixed(1), load: +x.load.toFixed(0) })),
          stats: devices.reduce((acc, x) => { acc[x.state]++; return acc }, { running: 0, standby: 0, warning: 0, fault: 0, maintenance: 0, offline: 0, alarms: 0 } as Snapshot['stats']),
        } })
      }
      break
    }
  }
}

export {}
