<script setup lang="ts">
import { computed, ref } from 'vue'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'
import { useDeviceStore, DEVICE_COUNT } from '../composables/useDeviceStore'
import {
  STATUS_HEX,
  STATUS_LABEL,
  type DeviceStatus,
} from '../types'

const {
  devices,
  selectedId,
  selectedDevice,
  selectedHistory,
  statusCounts,
  connected,
  lastUpdate,
  messageCount,
} = useDeviceStore()

const axisColor = '#8ba0c4'
const splitColor = '#24365a'
const statuses: DeviceStatus[] = ['normal', 'warning', 'error', 'offline']

const lastUpdateText = computed(() =>
  new Date(lastUpdate.value).toLocaleTimeString('zh-CN', { hour12: false }),
)

const onlineCount = computed(() => DEVICE_COUNT - statusCounts.value.offline)

const pieOption = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item', formatter: '{b}: {c} 台 ({d}%)' },
  legend: { show: false },
  series: [
    {
      type: 'pie',
      radius: ['48%', '72%'],
      center: ['50%', '52%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#18243b', borderWidth: 2, borderRadius: 3 },
      label: { color: axisColor, fontSize: 10, formatter: '{b}\n{c}' },
      labelLine: { lineStyle: { color: splitColor } },
      data: statuses.map((s) => ({
        name: STATUS_LABEL[s],
        value: statusCounts.value[s],
        itemStyle: { color: STATUS_HEX[s] },
      })),
    },
  ],
}))

const gaugeOption = computed<EChartsOption>(() => {
  const temp = selectedDevice.value?.temperature ?? 0
  return {
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        min: 0,
        max: 100,
        startAngle: 210,
        endAngle: -30,
        radius: '92%',
        center: ['50%', '58%'],
        progress: { show: true, width: 9, roundCap: true },
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: 9,
            color: [[0.7, '#22c55e'], [0.85, '#f59e0b'], [1, '#ef4444']],
          },
        },
        pointer: { width: 4, length: '60%', itemStyle: { color: '#e6edf7' } },
        anchor: { show: true, size: 8, itemStyle: { color: '#4ea1ff' } },
        axisTick: { show: false },
        splitLine: { distance: -12, length: 6, lineStyle: { color: splitColor, width: 1 } },
        axisLabel: { distance: -2, color: axisColor, fontSize: 9 },
        title: { show: false },
        detail: {
          valueAnimation: true,
          formatter: '{value} °C',
          color: '#e6edf7',
          fontSize: 18,
          fontWeight: 600,
          offsetCenter: [0, '38%'],
        },
        data: [{ value: Math.round(temp * 10) / 10 }],
      },
    ],
  }
})

const lineOption = computed<EChartsOption>(() => {
  const h = selectedHistory.value
  return {
    backgroundColor: 'transparent',
    animationDuration: 300,
    tooltip: { trigger: 'axis', backgroundColor: '#0b1220', borderColor: '#24365a', textStyle: { color: '#e6edf7', fontSize: 11 } },
    legend: {
      data: ['温度', '负载'],
      top: 0,
      textStyle: { color: axisColor, fontSize: 10 },
      itemWidth: 12,
      itemHeight: 8,
    },
    grid: { left: 34, right: 36, top: 26, bottom: 22 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: h.map((p) => p.time),
      axisLine: { lineStyle: { color: splitColor } },
      axisTick: { show: false },
      axisLabel: { color: axisColor, fontSize: 9, interval: 5 },
    },
    yAxis: [
      {
        type: 'value',
        min: 0,
        max: 100,
        name: '°C',
        nameTextStyle: { color: axisColor, fontSize: 9 },
        axisLabel: { color: axisColor, fontSize: 9 },
        splitLine: { lineStyle: { color: splitColor, type: 'dashed' } },
      },
      {
        type: 'value',
        min: 0,
        max: 100,
        name: '%',
        nameTextStyle: { color: axisColor, fontSize: 9 },
        axisLabel: { color: axisColor, fontSize: 9 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: h.map((p) => p.temperature),
        lineStyle: { color: '#4ea1ff', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(78,161,255,0.35)' },
            { offset: 1, color: 'rgba(78,161,255,0)' },
          ]),
        },
      },
      {
        name: '负载',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        data: h.map((p) => p.load),
        lineStyle: { color: '#a78bfa', width: 2 },
      },
    ],
  }
})

const filter = ref<DeviceStatus | 'all'>('all')
const filteredDevices = computed(() =>
  filter.value === 'all' ? devices : devices.filter((d) => d.status === filter.value),
)

function select(id: number) {
  selectedId.value = id
}
</script>

<template>
  <div class="card">
    <h2>园区概览</h2>
    <div class="stat-grid">
      <div class="stat">
        <div class="label">设备总数</div>
        <div class="value">{{ DEVICE_COUNT }}<small>台</small></div>
      </div>
      <div class="stat">
        <div class="label">在线设备</div>
        <div class="value" style="color: #22c55e">{{ onlineCount }}<small>台</small></div>
      </div>
      <div class="stat">
        <div class="label">推送批次</div>
        <div class="value">{{ messageCount }}<small>次</small></div>
      </div>
      <div class="stat">
        <div class="label">最后更新</div>
        <div class="value" style="font-size: 15px">{{ lastUpdateText }}</div>
      </div>
    </div>
    <div class="legend">
      <span v-for="s in statuses" :key="s">
        <i :style="{ background: STATUS_HEX[s] }"></i>{{ STATUS_LABEL[s] }} {{ statusCounts[s] }}
      </span>
    </div>
  </div>

  <div class="card">
    <h2>设备状态分布</h2>
    <EChart :option="pieOption" height="160px" />
  </div>

  <div class="card">
    <h2>选中设备 · {{ selectedDevice?.name ?? '未选中' }}</h2>
    <template v-if="selectedDevice">
      <div style="display: flex; gap: 12px; align-items: center">
        <div style="flex: 0 0 48%; height: 130px">
          <EChart :option="gaugeOption" height="130px" />
        </div>
        <div style="flex: 1; font-size: 12px; line-height: 2">
          <div>编号：<b>#{{ selectedDevice.id }}</b></div>
          <div>区域：{{ selectedDevice.zone }}</div>
          <div>状态：
            <span class="badge-status" :style="{ background: STATUS_HEX[selectedDevice.status] + '33', color: STATUS_HEX[selectedDevice.status] }">
              {{ STATUS_LABEL[selectedDevice.status] }}
            </span>
          </div>
          <div>压力：<b>{{ selectedDevice.pressure.toFixed(2) }}</b> MPa</div>
          <div>负载：<b>{{ selectedDevice.load }}</b>%</div>
        </div>
      </div>
      <EChart :option="lineOption" height="150px" />
    </template>
    <div v-else style="color: #8ba0c4; font-size: 12px; padding: 24px 0; text-align: center">
      在三维场景中点击任意设备查看实时曲线
    </div>
  </div>

  <div class="card">
    <h2>设备列表</h2>
    <div style="display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap">
      <button
        v-for="f in (['all', ...statuses] as const)"
        :key="f"
        class="filter-btn"
        :class="{ active: filter === f }"
        @click="filter = f"
      >{{ f === 'all' ? '全部' : STATUS_LABEL[f] }}</button>
    </div>
    <div class="device-list">
      <div
        v-for="d in filteredDevices"
        :key="d.id"
        class="device-row"
        :class="{ active: selectedId === d.id }"
        @click="select(d.id)"
      >
        <span class="sid">#{{ d.id }}</span>
        <i style="width: 8px; height: 8px; border-radius: 50%; flex: 0 0 8px" :style="{ background: STATUS_HEX[d.status] }"></i>
        <span class="sname">{{ d.name }}</span>
        <span class="sval">{{ d.temperature.toFixed(0) }}°</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-btn {
  background: rgba(255, 255, 255, .04);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 5px;
  padding: 3px 9px;
  font-size: 11px;
  cursor: pointer;
}
.filter-btn.active { background: rgba(78, 161, 255, .18); color: #9ccbff; border-color: rgba(78, 161, 255, .5); }
</style>
