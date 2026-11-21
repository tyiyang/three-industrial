import type { DeviceState } from '../types'

/** 状态机合法迁移表：key=当前状态，value=允许迁移到的状态集合 */
export const TRANSITIONS: Record<DeviceState, DeviceState[]> = {
  running: ['standby', 'warning', 'fault', 'maintenance', 'offline'],
  standby: ['running', 'warning', 'maintenance', 'offline'],
  warning: ['running', 'fault', 'maintenance', 'offline'],
  fault: ['maintenance', 'warning', 'offline'],
  maintenance: ['running', 'standby', 'offline'],
  offline: ['running', 'standby'],
}

export function canTransition(from: DeviceState, to: DeviceState): boolean {
  if (from === to) return true
  return TRANSITIONS[from].includes(to)
}

/** 尝试迁移，非法迁移返回原状态（便于单测与审计）*/
export function transition(from: DeviceState, to: DeviceState): DeviceState {
  return canTransition(from, to) ? to : from
}

/** 依据遥测数值推导"自然"状态（不含人工干预的检修/离线）*/
export function inferState(temperature: number, vibration: number, load: number, prev: DeviceState): DeviceState {
  if (prev === 'offline' || prev === 'maintenance') return prev
  if (temperature >= 88 || vibration >= 8.5) return 'fault'
  if (temperature >= 74 || vibration >= 6.5 || load >= 95) return 'warning'
  if (prev === 'fault' && temperature < 78 && vibration < 6) return 'running'
  if (prev === 'warning' && temperature < 68 && vibration < 5 && load < 88) return 'running'
  if (prev === 'running' && load < 12) return 'standby'
  if (prev === 'standby' && load >= 20) return 'running'
  return prev
}
