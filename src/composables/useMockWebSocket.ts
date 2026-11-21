import type { DevicePatch, DeviceStatus, WsMessage } from '../types'
import { DEVICE_COUNT } from './useDeviceStore'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function statusFromTemp(temp: number, prev: DeviceStatus, offline: boolean): DeviceStatus {
  if (offline) return 'offline'
  if (prev === 'offline') return 'normal'
  if (temp >= 82) return 'error'
  if (temp >= 70) return 'warning'
  if (prev === 'error' && temp < 76) return 'warning'
  if (prev === 'warning' && temp < 66) return 'normal'
  return prev
}

/**
 * Drop-in mock of a WebSocket that pushes device telemetry every 2 seconds.
 * Replace this with a real WebSocket by swapping `useMockWebSocket()` for
 * `new WebSocket(url)` and parsing `event.data` as WsMessage.
 */
export class MockDeviceSocket {
  onopen: (() => void) | null = null
  onmessage: ((msg: WsMessage) => void) | null = null
  onclose: (() => void) | null = null

  private timer: number | null = null
  private ticks = 0
  private temps = new Float32Array(DEVICE_COUNT)
  private pressures = new Float32Array(DEVICE_COUNT)
  private loads = new Float32Array(DEVICE_COUNT)
  private statuses: DeviceStatus[] = []

  constructor() {
    for (let i = 0; i < DEVICE_COUNT; i++) {
      this.temps[i] = 38 + ((i * 17) % 40)
      this.pressures[i] = 0.8 + ((i * 13) % 30) / 10
      this.loads[i] = 30 + ((i * 29) % 60)
      const r = (i * 37 + 11) % 100
      this.statuses.push(r < 4 ? 'error' : r < 13 ? 'warning' : r < 17 ? 'offline' : 'normal')
    }
  }

  connect() {
    window.setTimeout(() => {
      const patches: DevicePatch[] = []
      for (let i = 0; i < DEVICE_COUNT; i++) {
        patches.push({
          id: i,
          status: this.statuses[i],
          temperature: Math.round(this.temps[i] * 10) / 10,
          pressure: Math.round(this.pressures[i] * 100) / 100,
          load: Math.round(this.loads[i]),
        })
      }
      this.onopen?.()
      this.onmessage?.({ type: 'init', timestamp: Date.now(), patches })
      this.timer = window.setInterval(() => this.tick(), 2000)
    }, 350)
  }

  private tick() {
    this.ticks++
    const patches: DevicePatch[] = []
    const changed = new Set<number>()

    // Push an update for ~20% of devices each tick
    const count = Math.max(8, Math.round(DEVICE_COUNT * 0.2))
    while (changed.size < count) changed.add(Math.floor(Math.random() * DEVICE_COUNT))

    for (const id of changed) {
      const offline = this.statuses[id] === 'offline'
      if (offline && Math.random() < 0.12) {
        this.statuses[id] = 'normal'
      } else if (!offline && Math.random() < 0.006) {
        this.statuses[id] = 'offline'
      } else if (!offline) {
        // Random walk; occasional spike to drive status transitions
        const spike = Math.random() < 0.05 ? (Math.random() * 14 + 6) : 0
        this.temps[id] = clamp(this.temps[id] + (Math.random() - 0.48) * 7 + spike, 25, 96)
        this.loads[id] = clamp(this.loads[id] + (Math.random() - 0.5) * 10, 5, 100)
        this.pressures[id] = clamp(this.pressures[id] + (Math.random() - 0.5) * 0.3, 0.3, 4.5)
        if (this.temps[id] < 55) this.temps[id] += 1.2
        this.statuses[id] = statusFromTemp(this.temps[id], this.statuses[id], false)
      }

      patches.push({
        id,
        status: this.statuses[id],
        temperature: this.statuses[id] === 'offline' ? 0 : Math.round(this.temps[id] * 10) / 10,
        pressure: this.statuses[id] === 'offline' ? 0 : Math.round(this.pressures[id] * 100) / 100,
        load: this.statuses[id] === 'offline' ? 0 : Math.round(this.loads[id]),
      })
    }

    this.onmessage?.({ type: 'update', timestamp: Date.now(), patches })
  }

  close() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.onclose?.()
  }
}
