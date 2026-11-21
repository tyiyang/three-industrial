import type { Alarm, AlarmLevel, AlarmRuleId, Device } from '../types'

export interface AlarmRule {
  id: AlarmRuleId
  level: AlarmLevel
  label: string
  field: 'temperature' | 'vibration' | 'pressure' | 'load'
  op: 'gt' | 'lt'
  threshold: number
  /** 连续命中多少个 tick 才真正触发（抑制抖动）*/
  duration: number
  clearBelow: number
}

export const RULES: AlarmRule[] = [
  { id: 'temp-high', level: 'warning', label: '温度偏高', field: 'temperature', op: 'gt', threshold: 74, duration: 2, clearBelow: 68 },
  { id: 'temp-critical', level: 'critical', label: '温度超限', field: 'temperature', op: 'gt', threshold: 88, duration: 1, clearBelow: 82 },
  { id: 'vibration-high', level: 'warning', label: '振动异常', field: 'vibration', op: 'gt', threshold: 6.5, duration: 3, clearBelow: 5 },
  { id: 'pressure-low', level: 'info', label: '压力偏低', field: 'pressure', op: 'lt', threshold: 0.6, duration: 3, clearBelow: 0.8 },
  { id: 'load-high', level: 'info', label: '负载较高', field: 'load', op: 'gt', threshold: 95, duration: 4, clearBelow: 88 },
]

interface RuleState {
  streak: number
  active: boolean
  alarmId: string | null
}

/** 告警规则引擎：连续命中 + 滞回清除，避免告警抖动 */
export class AlarmEngine {
  private state = new Map<string, RuleState>() // key = deviceId:ruleId
  private alarms = new Map<string, Alarm>()
  private seq = 0

  private hit(rule: AlarmRule, value: number): boolean {
    return rule.op === 'gt' ? value > rule.threshold : value < rule.threshold
  }

  private cleared(rule: AlarmRule, value: number): boolean {
    return rule.op === 'gt' ? value < rule.clearBelow : value > rule.clearBelow
  }

  /** 处理一批设备，返回本次"新增或更新"的告警（用于推送到 UI）*/
  evaluate(devices: Device[], t: number): Alarm[] {
    const changed: Alarm[] = []
    const liveIds = new Set<string>()

    for (const d of devices) {
      if (d.state === 'offline') continue
      for (const rule of RULES) {
        const key = `${d.id}:${rule.id}`
        liveIds.add(key)
        let rs = this.state.get(key)
        if (!rs) {
          rs = { streak: 0, active: false, alarmId: null }
          this.state.set(key, rs)
        }
        const value = d[rule.field]
        const isHit = this.hit(rule, value)

        if (isHit) {
          rs.streak++
          if (!rs.active && rs.streak >= rule.duration) {
            const id = `alarm-${++this.seq}`
            const alarm: Alarm = {
              id,
              deviceId: d.id,
              deviceName: d.name,
              rule: rule.id,
              level: rule.level,
              message: `${rule.label}：${value.toFixed(1)}${rule.field === 'pressure' ? 'MPa' : rule.field === 'load' ? '%' : rule.field === 'vibration' ? 'mm/s' : '°C'}`,
              value,
              threshold: rule.threshold,
              startedAt: t,
              lastSeenAt: t,
              count: 1,
              acknowledged: false,
              silenced: false,
            }
            this.alarms.set(id, alarm)
            rs.active = true
            rs.alarmId = id
            changed.push(alarm)
          } else if (rs.active && rs.alarmId) {
            const alarm = this.alarms.get(rs.alarmId)
            if (alarm) {
              alarm.value = value
              alarm.lastSeenAt = t
              alarm.count++
              changed.push({ ...alarm })
            }
          }
        } else {
          rs.streak = 0
          if (rs.active && this.cleared(rule, value) && rs.alarmId) {
            this.alarms.delete(rs.alarmId)
            rs.active = false
            rs.alarmId = null
          }
        }
      }
    }

    // 清理已恢复设备残留的告警
    for (const [key, rs] of this.state) {
      if (!liveIds.has(key) && rs.alarmId) {
        this.alarms.delete(rs.alarmId)
        rs.active = false
        rs.alarmId = null
        rs.streak = 0
      }
    }
    return changed
  }

  getActiveAlarms(): Alarm[] {
    return Array.from(this.alarms.values())
  }

  acknowledge(id: string): boolean {
    const a = this.alarms.get(id)
    if (!a) return false
    a.acknowledged = true
    return true
  }

  silence(id: string): boolean {
    const a = this.alarms.get(id)
    if (!a) return false
    a.silenced = true
    return true
  }

  acknowledgeAll(): number {
    let n = 0
    for (const a of this.alarms.values()) {
      if (!a.acknowledged) { a.acknowledged = true; n++ }
    }
    return n
  }

  reset(): void {
    this.state.clear()
    this.alarms.clear()
    this.seq = 0
  }
}
