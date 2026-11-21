import { describe, expect, it } from 'vitest'
import { canTransition, inferState, transition } from '../src/core/stateMachine'
import { RingBuffer } from '../src/core/ringBuffer'
import { AlarmEngine, RULES } from '../src/core/alarmEngine'
import type { Device } from '../src/types'

describe('DeviceStateMachine', () => {
  it('允许合法迁移', () => {
    expect(canTransition('running', 'fault')).toBe(true)
    expect(transition('running', 'fault')).toBe('fault')
  })

  it('拒绝非法迁移并保持原状态', () => {
    expect(canTransition('fault', 'running')).toBe(false)
    expect(transition('fault', 'running')).toBe('fault')
  })

  it('自迁移恒为合法', () => {
    expect(transition('offline', 'offline')).toBe('offline')
  })

  it('依据阈值推导状态', () => {
    expect(inferState(92, 3, 60, 'running')).toBe('fault')
    expect(inferState(78, 3, 60, 'running')).toBe('warning')
    expect(inferState(50, 2, 60, 'warning')).toBe('running')
    expect(inferState(50, 2, 5, 'running')).toBe('standby')
  })

  it('检修/离线不被遥测自动改写', () => {
    expect(inferState(99, 9, 99, 'maintenance')).toBe('maintenance')
    expect(inferState(99, 9, 99, 'offline')).toBe('offline')
  })
})

describe('RingBuffer', () => {
  it('未满时按顺序读出', () => {
    const b = new RingBuffer<number>(3)
    b.push(1); b.push(2)
    expect(b.toArray()).toEqual([1, 2])
    expect(b.size).toBe(2)
  })

  it('满容量后覆盖最旧元素', () => {
    const b = new RingBuffer<number>(3)
    b.push(1); b.push(2); b.push(3); b.push(4)
    expect(b.toArray()).toEqual([2, 3, 4])
    expect(b.latest()).toBe(4)
    expect(b.at(0)).toBe(2)
  })

  it('越界访问返回 undefined', () => {
    const b = new RingBuffer<number>(2)
    expect(b.at(-1)).toBeUndefined()
    expect(b.at(0)).toBeUndefined()
  })

  it('clear 后重新计数', () => {
    const b = new RingBuffer<number>(2)
    b.push(1); b.clear(); b.push(9)
    expect(b.toArray()).toEqual([9])
  })
})

function mkDevice(over: Partial<Device> = {}): Device {
  return {
    id: 1, name: '测试设备', zone: 'A 区', type: 'reactor', state: 'running',
    temperature: 50, pressure: 1.2, load: 50, vibration: 2, runtime: 100,
    health: 90, updatedAt: 0, ...over,
  }
}

describe('AlarmEngine', () => {
  it('连续命中 duration 次才触发', () => {
    const e = new AlarmEngine()
    const hot = mkDevice({ temperature: 80 })
    expect(e.evaluate([hot], 1000)).toHaveLength(0)
    expect(e.evaluate([hot], 2000)).toHaveLength(1)
    expect(e.getActiveAlarms()).toHaveLength(1)
  })

  it('滞回清除：低于 clearBelow 才恢复', () => {
    const e = new AlarmEngine()
    const isCritical = (t: number, ts: number) => {
      e.evaluate([mkDevice({ temperature: t })], ts)
      return e.getActiveAlarms().some((a) => a.rule === 'temp-critical')
    }
    expect(isCritical(90, 1000)).toBe(true)
    expect(isCritical(85, 2000)).toBe(true)  // 低于阈值88 但高于清除线82：仍保持
    expect(isCritical(75, 3000)).toBe(false) // 低于清除线：恢复
  })

  it('离线设备不参与规则判定', () => {
    const e = new AlarmEngine()
    expect(e.evaluate([mkDevice({ temperature: 99, state: 'offline' })], 1000)).toHaveLength(0)
  })

  it('确认与静默', () => {
    const e = new AlarmEngine()
    e.evaluate([mkDevice({ temperature: 95 })], 1000) // temp-critical, duration=1
    const a = e.getActiveAlarms()[0]
    expect(a.level).toBe('critical')
    expect(e.acknowledge(a.id)).toBe(true)
    expect(e.silence(a.id)).toBe(true)
    expect(e.getActiveAlarms()[0].acknowledged).toBe(true)
    expect(e.getActiveAlarms()[0].silenced).toBe(true)
  })

  it('规则表包含温度与振动规则', () => {
    expect(RULES.map((r) => r.id)).toContain('temp-critical')
    expect(RULES.map((r) => r.id)).toContain('vibration-high')
  })
})
