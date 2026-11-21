export type DeviceStatus = 'normal' | 'warning' | 'error' | 'offline'

export const STATUS_COLOR: Record<DeviceStatus, number> = {
  normal: 0x22c55e,
  warning: 0xf59e0b,
  error: 0xef4444,
  offline: 0x64748b,
}

export const STATUS_HEX: Record<DeviceStatus, string> = {
  normal: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  offline: '#64748b',
}

export const STATUS_LABEL: Record<DeviceStatus, string> = {
  normal: '正常',
  warning: '告警',
  error: '故障',
  offline: '离线',
}

export interface Device {
  id: number
  name: string
  zone: string
  status: DeviceStatus
  temperature: number
  pressure: number
  load: number
  updatedAt: number
}

export interface DevicePatch {
  id: number
  status?: DeviceStatus
  temperature?: number
  pressure?: number
  load?: number
}

export interface WsMessage {
  type: 'init' | 'update'
  timestamp: number
  patches: DevicePatch[]
}

export interface HistoryPoint {
  time: string
  temperature: number
  load: number
}
