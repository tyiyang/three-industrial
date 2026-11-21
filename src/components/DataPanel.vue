<script setup lang="ts">
import { computed } from 'vue'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'
import { useDemoStore } from '../stores/useDemoStore'
import {
  DEVICE_STATES, DEVICE_TYPES, DEVICE_TYPE_LABEL, STATE_HEX, STATE_LABEL,
} from '../types'

const store = useDemoStore()
const emit = defineEmits<{ (e: 'locate', id: number): void }>()

const axis = '#8ba0c4'
const split = '#24365a'

const kpi = computed(() => {
  const c = store.stateCounts
  const total = store.devices.length
  const online = total - c.offline
  const avgHealth = Math.round(store.devices.reduce((s, d) => s + d.health, 0) / total)
  const avgTemp = (store.devices.filter((d) => d.state !== 'offline').reduce((s, d) => s + d.temperature, 0) / Math.max(1, online)).toFixed(1)
  return { online, rate: ((online / total) * 100).toFixed(1), health: avgHealth, temp: avgTemp }
})

const statePie = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item', formatter: '{b}: {c} 台 ({d}%)' },
  series: [{
    type: 'pie', radius: ['46%', '70%'], center: ['50%', '52%'],
    itemStyle: { borderColor: '#18243b', borderWidth: 2, borderRadius: 3 },
    label: { color: axis, fontSize: 10, formatter: '{b}\n{c}' },
    data: DEVICE_STATES.map((s) => ({ name: STATE_LABEL[s], value: store.stateCounts[s], itemStyle: { color: STATE_HEX[s] } })),
  }],
}))

const zoneHeatmap = computed<EChartsOption>(() => {
  const zones = ['A 区', 'B 区', 'C 区']
  const types = DEVICE_TYPES.map((t) => DEVICE_TYPE_LABEL[t])
  const data: Array<[number, number, number]> = []
  const matrix = Array.from({ length: types.length }, () => [0, 0, 0])
  for (const d of store.devices) {
    const zi = zones.indexOf(d.zone)
    const ti = DEVICE_TYPES.indexOf(d.type)
    if (zi < 0 || ti < 0) continue
    const alarmed = store.alarmList.some((a) => a.deviceId === d.id)
    matrix[ti][zi] += alarmed ? 3 : d.state === 'fault' ? 2 : d.state === 'warning' ? 1 : 0
  }
  matrix.forEach((row, ti) => row.forEach((v, zi) => data.push([zi, ti, v])))
  return {
    backgroundColor: 'transparent',
    tooltip: { position: 'top' },
    grid: { left: 52, right: 12, top: 10, bottom: 28 },
    xAxis: { type: 'category', data: zones, axisLabel: { color: axis, fontSize: 10 }, axisLine: { lineStyle: { color: split } } },
    yAxis: { type: 'category', data: types, axisLabel: { color: axis, fontSize: 10 }, axisLine: { lineStyle: { color: split } } },
    visualMap: { min: 0, max: 8, show: false, inRange: { color: ['#16243a', '#1d5f8f', '#f59e0b', '#ef4444'] } },
    series: [{ type: 'heatmap', data, label: { show: true, color: '#e6edf7', fontSize: 9 }, itemStyle: { borderColor: '#18243b', borderWidth: 2 } }],
  }
})

const healthRank = computed<EChartsOption>(() => {
  const top = [...store.devices].sort((a, b) => a.health - b.health).slice(0, 8).reverse()
  return {
    backgroundColor: 'transparent',
    grid: { left: 58, right: 24, top: 8, bottom: 20 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', max: 100, axisLabel: { color: axis, fontSize: 9 }, splitLine: { lineStyle: { color: split, type: 'dashed' } } },
    yAxis: { type: 'category', data: top.map((d) => d.name.replace('设备 ', '#')), axisLabel: { color: axis, fontSize: 9 } },
    series: [{
      type: 'bar',
      data: top.map((d) => ({ value: d.health, itemStyle: { color: d.health < 50 ? '#ef4444' : d.health < 75 ? '#f59e0b' : '#22c55e' } })),
      barWidth: '55%', label: { show: true, position: 'right', color: '#e6edf7', fontSize: 9 },
    }],
  }
})

const trend = computed<EChartsOption>(() => {
  const h = store.selectedHistory
  return {
    backgroundColor: 'transparent',
    animationDuration: 250,
    tooltip: { trigger: 'axis' },
    legend: { data: ['温度', '负载', '振动'], top: 0, textStyle: { color: axis, fontSize: 10 }, itemWidth: 12, itemHeight: 8 },
    grid: { left: 36, right: 34, top: 24, bottom: 20 },
    xAxis: { type: 'category', boundaryGap: false, data: h.map((p) => p.time), axisLabel: { color: axis, fontSize: 9, interval: 7 }, axisLine: { lineStyle: { color: split } } },
    yAxis: [
      { type: 'value', min: 0, max: 100, name: '°C/%', nameTextStyle: { color: axis, fontSize: 9 }, axisLabel: { color: axis, fontSize: 9 }, splitLine: { lineStyle: { color: split, type: 'dashed' } } },
      { type: 'value', min: 0, max: 12, axisLabel: { color: axis, fontSize: 9 }, splitLine: { show: false } },
    ],
    series: [
      { name: '温度', type: 'line', smooth: true, showSymbol: false, data: h.map((p) => p.temperature), lineStyle: { color: '#4ea1ff', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(78,161,255,.3)' }, { offset: 1, color: 'rgba(78,161,255,0)' }]) } },
      { name: '负载', type: 'line', smooth: true, showSymbol: false, data: h.map((p) => p.load), lineStyle: { color: '#a78bfa', width: 1.5 } },
      { name: '振动', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false, data: h.map((p) => p.vibration), lineStyle: { color: '#f59e0b', width: 1.5 } },
    ],
  }
})

const filtered = computed(() => store.filteredDevices.slice(0, 60))
</script>

<template>
  <div class="card">
    <h2>园区 KPI</h2>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">在线率</div><div class="kpi-value">{{ kpi.rate }}<small>%</small></div></div>
      <div class="kpi"><div class="kpi-label">平均健康度</div><div class="kpi-value">{{ kpi.health }}<small>/100</small></div></div>
      <div class="kpi"><div class="kpi-label">平均温度</div><div class="kpi-value">{{ kpi.temp }}<small>°C</small></div></div>
      <div class="kpi"><div class="kpi-label">活动告警</div><div class="kpi-value" :style="{ color: store.activeAlarmCount ? '#ef4444' : '#22c55e' }">{{ store.activeAlarmCount }}<small>条</small></div></div>
    </div>
  </div>

  <div class="card">
    <h2>设备状态分布</h2>
    <EChart :option="statePie" height="150px" />
  </div>

  <div class="card">
    <h2>区域 × 类型 告警热力</h2>
    <EChart :option="zoneHeatmap" height="150px" />
  </div>

  <div class="card">
    <h2>健康度最差 Top 8</h2>
    <EChart :option="healthRank" height="170px" />
  </div>

  <div class="card">
    <h2>选中设备 · {{ store.primarySelected?.name ?? '未选中' }}</h2>
    <template v-if="store.primarySelected">
      <div class="dev-detail">
        <span>编号 <b>#{{ store.primarySelected.id }}</b></span>
        <span>类型 {{ DEVICE_TYPE_LABEL[store.primarySelected.type] }}</span>
        <span>区域 {{ store.primarySelected.zone }}</span>
        <span>状态 <b :style="{ color: STATE_HEX[store.primarySelected.state] }">{{ STATE_LABEL[store.primarySelected.state] }}</b></span>
        <span>压力 {{ store.primarySelected.pressure.toFixed(2) }} MPa</span>
        <span>振动 {{ store.primarySelected.vibration.toFixed(2) }} mm/s</span>
        <span>运行 {{ Math.round(store.primarySelected.runtime) }} h</span>
        <span>健康度 {{ store.primarySelected.health }}</span>
      </div>
      <EChart :option="trend" height="160px" />
    </template>
    <div v-else class="empty">点击三维场景中的设备查看实时曲线</div>
  </div>

  <div class="card">
    <h2>设备列表 <small>{{ filtered.length }} / {{ store.devices.length }}</small></h2>
    <div class="filter-row">
      <select v-model="store.filterState">
        <option value="all">全部状态</option>
        <option v-for="s in DEVICE_STATES" :key="s" :value="s">{{ STATE_LABEL[s] }}</option>
      </select>
      <select v-model="store.filterType">
        <option value="all">全部类型</option>
        <option v-for="t in DEVICE_TYPES" :key="t" :value="t">{{ DEVICE_TYPE_LABEL[t] }}</option>
      </select>
    </div>
    <div class="device-list">
      <div v-for="d in filtered" :key="d.id" class="device-row" :class="{ active: store.selectedIds.has(d.id) }" @click="store.select(d.id); emit('locate', d.id)">
        <span class="sid">#{{ d.id }}</span>
        <i class="dot" :style="{ background: STATE_HEX[d.state] }"></i>
        <span class="sname">{{ d.name }}</span>
        <span class="stype">{{ DEVICE_TYPE_LABEL[d.type] }}</span>
        <span class="sval">{{ d.temperature.toFixed(0) }}°</span>
      </div>
    </div>
  </div>
</template>
