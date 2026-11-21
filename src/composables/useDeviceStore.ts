import { computed, reactive, ref } from 'vue'
import type { Device, DeviceStatus, HistoryPoint, WsMessage } from '../types'

const COLS = 12
const ROWS = 10
export const DEVICE_COUNT = COLS * ROWS

function initialStatus(i: number): DeviceStatus {
  const r = (i * 37 + 11) % 100
  if (r < 4) return 'error'
  if (r < 13) return 'warning'
  if (r < 17) return 'offline'
  return 'normal'
}

function createDevices(): Device[] {
  const list: Device[] = []
  for (let i = 0; i < DEVICE_COUNT; i++) {
    const row = Math.floor(i / COLS)
    const col = i % COLS
    const status = initialStatus(i)
    list.push({
      id: i,
      name: `设备 ${String(i + 1).padStart(3, '0')}`,
      zone: `${String.fromCharCode(65 + Math.floor(row / 3))} 区`,
      status,
      temperature: status === 'offline' ? 0 : 38 + ((i * 17) % 40),
      pressure: status === 'offline' ? 0 : 0.8 + ((i * 13) % 30) / 10,
      load: status === 'offline' ? 0 : 30 + ((i * 29) % 60),
      updatedAt: Date.now(),
    })
  }
  return list
}

// Module-level singleton state
const devices = reactive<Device[]>(createDevices())
const histories = reactive<Record<number, HistoryPoint[]>>({})
const selectedId = ref<number | null>(null)
const connected = ref(false)
const lastUpdate = ref<number>(Date.now())
const messageCount = ref(0)

// Seed a little history for every device
for (const d of devices) {
  const arr: HistoryPoint[] = []
  for (let k = 23; k >= 0; k--) {
    const t = new Date(Date.now() - k * 2000)
    arr.push({
      time: t.toLocaleTimeString('zh-CN', { hour12: false }),
      temperature: d.temperature + Math.sin(k / 3 + d.id) * 3,
      load: d.load + Math.cos(k / 4 + d.id) * 5,
    })
  }
  histories[d.id] = arr
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function applyMessage(msg: WsMessage) {
  lastUpdate.value = msg.timestamp
  messageCount.value++
  for (const patch of msg.patches) {
    const d = devices[patch.id]
    if (!d) continue
    if (patch.status !== undefined) d.status = patch.status
    if (patch.temperature !== undefined) d.temperature = patch.temperature
    if (patch.pressure !== undefined) d.pressure = patch.pressure
    if (patch.load !== undefined) d.load = patch.load
    d.updatedAt = msg.timestamp

    const h = histories[d.id]
    if (h) {
      h.push({
        time: formatTime(msg.timestamp),
        temperature: Math.round(d.temperature * 10) / 10,
        load: Math.round(d.load),
      })
      if (h.length > 24) h.shift()
    }
  }
}

const statusCounts = computed(() => {
  const counts: Record<DeviceStatus, number> = { normal: 0, warning: 0, error: 0, offline: 0 }
  for (const d of devices) counts[d.status]++
  return counts
})

const selectedDevice = computed(() => (selectedId.value === null ? null : devices[selectedId.value]))
const selectedHistory = computed(() =>
  selectedId.value === null ? [] : histories[selectedId.value] ?? [],
)

export function useDeviceStore() {
  return {
    devices,
    histories,
    selectedId,
    selectedDevice,
    selectedHistory,
    statusCounts,
    connected,
    lastUpdate,
    messageCount,
    applyMessage,
    grid: { cols: COLS, rows: ROWS },
  }
}
