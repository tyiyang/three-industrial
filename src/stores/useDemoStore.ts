import { computed, reactive, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type {
  Alarm, AlarmLevel, Device, DevicePatch, DeviceState, DeviceType, HistoryPoint, Snapshot,
} from '../types'
import { DEVICE_TYPES, DEVICE_STATES } from '../types'
import { RingBuffer } from '../core/ringBuffer'

export const GRID_COLS = 12
export const GRID_ROWS = 10
export const DEVICE_COUNT = GRID_COLS * GRID_ROWS

const TYPE_SEQUENCE: DeviceType[] = ['reactor', 'tank', 'cabinet', 'cooler']

function initialState(i: number): DeviceState {
  const r = (i * 37 + 11) % 100
  if (r < 4) return 'fault'
  if (r < 12) return 'warning'
  if (r < 16) return 'maintenance'
  if (r < 20) return 'offline'
  if (r < 30) return 'standby'
  return 'running'
}

function createDevices(): Device[] {
  const list: Device[] = []
  for (let i = 0; i < DEVICE_COUNT; i++) {
    const row = Math.floor(i / GRID_COLS)
    const col = i % GRID_COLS
    const state = initialState(i)
    const offline = state === 'offline'
    list.push({
      id: i,
      name: `设备 ${String(i + 1).padStart(3, '0')}`,
      zone: `${String.fromCharCode(65 + Math.floor(row / 3))} 区`,
      type: TYPE_SEQUENCE[(row + col) % TYPE_SEQUENCE.length],
      state,
      temperature: offline ? 0 : 38 + ((i * 17) % 40),
      pressure: offline ? 0 : +(0.8 + ((i * 13) % 30) / 10).toFixed(2),
      load: offline ? 0 : 30 + ((i * 29) % 60),
      vibration: offline ? 0 : +(1 + ((i * 23) % 45) / 10).toFixed(2),
      runtime: 1200 + (i * 137) % 8000,
      health: offline ? 0 : 70 + ((i * 11) % 30),
      updatedAt: Date.now(),
    })
  }
  return list
}

function timeStr(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

export const useDemoStore = defineStore('demo', () => {
  const devices = reactive<Device[]>(createDevices())
  const alarms = reactive<Map<string, Alarm>>(new Map())
  const histories = reactive<Record<number, HistoryPoint[]>>({})
  const snapshots = shallowRef<Snapshot[]>([])
  const snapshotRing = new RingBuffer<Snapshot>(120)

  const selectedIds = ref<Set<number>>(new Set())
  const hoveredId = ref<number | null>(null)
  const connected = ref(false)
  const tickCount = ref(0)
  const lastUpdate = ref(Date.now())
  const paused = ref(false)
  const intervalMs = ref(2000)

  // 视图与交互状态
  const dayMode = ref(true)
  const lodEnabled = ref(true)
  const selectMode = ref(false)
  const measureMode = ref(false)
  const cameraPreset = ref<'overview' | 'top' | 'aisle' | null>(null)
  const searchQuery = ref('')
  const filterState = ref<DeviceState | 'all'>('all')
  const filterType = ref<DeviceType | 'all'>('all')
  const alarmFilter = ref<AlarmLevel | 'all'>('all')

  // 回放
  const playbackMode = ref(false)
  const playbackIndex = ref(0)

  // 性能
  const perf = reactive({ fps: 0, calls: 0, triangles: 0, points: 0, lines: 0 })

  // 初始化历史曲线
  for (const d of devices) {
    const arr: HistoryPoint[] = []
    for (let k = 29; k >= 0; k--) {
      const t = Date.now() - k * 2000
      arr.push({
        time: timeStr(t),
        temperature: +(d.temperature + Math.sin(k / 3 + d.id) * 3).toFixed(1),
        load: +(d.load + Math.cos(k / 4 + d.id) * 5).toFixed(0),
        vibration: +(d.vibration + Math.sin(k / 5 + d.id) * 0.4).toFixed(2),
      })
    }
    histories[d.id] = arr
  }

  const stateCounts = computed(() => {
    const c = Object.fromEntries(DEVICE_STATES.map((s) => [s, 0])) as Record<DeviceState, number>
    for (const d of devices) c[d.state]++
    return c
  })

  const typeCounts = computed(() => {
    const c = Object.fromEntries(DEVICE_TYPES.map((t) => [t, 0])) as Record<DeviceType, number>
    for (const d of devices) c[d.type]++
    return c
  })

  const alarmList = computed(() =>
    Array.from(alarms.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt),
  )

  const activeAlarmCount = computed(() => alarms.size)
  const unackCount = computed(() => Array.from(alarms.values()).filter((a) => !a.acknowledged).length)

  const primarySelectedId = computed(() => {
    const ids = Array.from(selectedIds.value)
    return ids.length ? ids[ids.length - 1] : null
  })
  const primarySelected = computed(() =>
    primarySelectedId.value === null ? null : devices[primarySelectedId.value],
  )
  const selectedHistory = computed(() =>
    primarySelectedId.value === null ? [] : histories[primarySelectedId.value] ?? [],
  )

  const filteredDevices = computed(() =>
    devices.filter((d) =>
      (filterState.value === 'all' || d.state === filterState.value) &&
      (filterType.value === 'all' || d.type === filterType.value),
    ),
  )

  const replaySnapshot = computed(() =>
    playbackMode.value ? snapshots.value[playbackIndex.value] ?? null : null,
  )

  function select(id: number, additive = false) {
    if (!additive) {
      selectedIds.value = new Set([id])
      return
    }
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  function selectMany(ids: number[], additive = false) {
    selectedIds.value = additive ? new Set([...selectedIds.value, ...ids]) : new Set(ids)
  }

  function clearSelection() {
    selectedIds.value = new Set()
  }

  function applyTick(t: number, patches: DevicePatch[], newAlarms: Alarm[], snap: Snapshot) {
    lastUpdate.value = t
    tickCount.value++
    for (const p of patches) {
      const d = devices[p.id]
      if (!d) continue
      if (p.state !== undefined) d.state = p.state
      if (p.temperature !== undefined) d.temperature = p.temperature
      if (p.pressure !== undefined) d.pressure = p.pressure
      if (p.load !== undefined) d.load = p.load
      if (p.vibration !== undefined) d.vibration = p.vibration
      if (p.health !== undefined) d.health = p.health
      if (p.runtime !== undefined) d.runtime = p.runtime
      d.updatedAt = t
      const h = histories[d.id]
      if (h) {
        h.push({ time: timeStr(t), temperature: d.temperature, load: d.load, vibration: d.vibration })
        if (h.length > 30) h.shift()
      }
    }
    for (const a of newAlarms) alarms.set(a.id, reactive(a))
    snapshotRing.push(snap)
    snapshots.value = snapshotRing.toArray()
    if (playbackMode.value) playbackIndex.value = snapshots.value.length - 1
  }

  function removeAlarm(id: string) {
    alarms.delete(id)
  }

  function ackAlarm(id: string) {
    const a = alarms.get(id)
    if (a) a.acknowledged = true
  }

  function silenceAlarm(id: string) {
    const a = alarms.get(id)
    if (a) a.silenced = true
  }

  function ackAll() {
    for (const a of alarms.values()) a.acknowledged = true
  }

  function findDevice(query: string): Device | undefined {
    const q = query.trim().toLowerCase()
    if (!q) return undefined
    return devices.find((d) =>
      d.name.toLowerCase().includes(q) || String(d.id) === q || d.zone.toLowerCase().includes(q),
    )
  }

  return {
    devices, alarms, histories, snapshots, selectedIds, hoveredId,
    connected, tickCount, lastUpdate, paused, intervalMs,
    dayMode, lodEnabled, selectMode, measureMode, cameraPreset,
    searchQuery, filterState, filterType, alarmFilter,
    playbackMode, playbackIndex, perf,
    stateCounts, typeCounts, alarmList, activeAlarmCount, unackCount,
    primarySelectedId, primarySelected, selectedHistory, filteredDevices, replaySnapshot,
    select, selectMany, clearSelection, applyTick, removeAlarm, ackAlarm, silenceAlarm, ackAll, findDevice,
  }
})
