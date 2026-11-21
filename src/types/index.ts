/** 设备类型（对应四种 glTF 模型）*/
export type DeviceType = 'reactor' | 'tank' | 'cabinet' | 'cooler'

export const DEVICE_TYPES: DeviceType[] = ['reactor', 'tank', 'cabinet', 'cooler']

export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  reactor: '反应釜',
  tank: '储罐',
  cabinet: '配电柜',
  cooler: '冷却塔',
}

export const TYPE_MODEL: Record<DeviceType, string> = {
  reactor: 'reactor.gltf',
  tank: 'tank.gltf',
  cabinet: 'cabinet.gltf',
  cooler: 'cooler.gltf',
}

/** 设备运行状态（状态机约束）*/
export type DeviceState = 'running' | 'standby' | 'warning' | 'fault' | 'maintenance' | 'offline'

export const DEVICE_STATES: DeviceState[] = [
  'running', 'standby', 'warning', 'fault', 'maintenance', 'offline',
]

export const STATE_LABEL: Record<DeviceState, string> = {
  running: '运行',
  standby: '待机',
  warning: '告警',
  fault: '故障',
  maintenance: '检修',
  offline: '离线',
}

export const STATE_COLOR: Record<DeviceState, number> = {
  running: 0x22c55e,
  standby: 0x38bdf8,
  warning: 0xf59e0b,
  fault: 0xef4444,
  maintenance: 0xa855f7,
  offline: 0x64748b,
}

export const STATE_HEX: Record<DeviceState, string> = {
  running: '#22c55e',
  standby: '#38bdf8',
  warning: '#f59e0b',
  fault: '#ef4444',
  maintenance: '#a855f7',
  offline: '#64748b',
}

/** 告警等级 */
export type AlarmLevel = 'info' | 'warning' | 'critical'

export const LEVEL_LABEL: Record<AlarmLevel, string> = {
  info: '提示',
  warning: '告警',
  critical: '严重',
}

export const LEVEL_HEX: Record<AlarmLevel, string> = {
  info: '#38bdf8',
  warning: '#f59e0b',
  critical: '#ef4444',
}

export interface Device {
  id: number
  name: string
  zone: string
  type: DeviceType
  state: DeviceState
  temperature: number
  pressure: number
  load: number
  vibration: number
  runtime: number
  health: number
  updatedAt: number
}

export interface DevicePatch {
  id: number
  state?: DeviceState
  temperature?: number
  pressure?: number
  load?: number
  vibration?: number
  health?: number
  runtime?: number
}

export type AlarmRuleId = 'temp-high' | 'temp-critical' | 'vibration-high' | 'pressure-low' | 'load-high'

export interface Alarm {
  id: string
  deviceId: number
  deviceName: string
  rule: AlarmRuleId
  level: AlarmLevel
  message: string
  value: number
  threshold: number
  startedAt: number
  lastSeenAt: number
  count: number
  acknowledged: boolean
  silenced: boolean
}

/** 实时历史快照（用于回放）*/
export interface Snapshot {
  t: number
  states: Array<{ id: number; s: DeviceState; temp: number; load: number }>
  stats: Record<DeviceState, number> & { alarms: number }
}

/** Worker -> 主线程消息 */
export type WorkerOut =
  | { type: 'ready' }
  | { type: 'tick'; t: number; patches: DevicePatch[]; alarms: Alarm[]; snapshot: Snapshot }

/** 主线程 -> Worker 消息 */
export type WorkerIn =
  | { type: 'init'; devices: Device[] }
  | { type: 'interval'; ms: number }
  | { type: 'pause'; paused: boolean }
  | { type: 'inject'; id: number; state: DeviceState }

export interface HistoryPoint {
  time: string
  temperature: number
  load: number
  vibration: number
}
