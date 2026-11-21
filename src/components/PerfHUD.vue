<script setup lang="ts">
import { computed } from 'vue'
import { useDemoStore } from '../stores/useDemoStore'

const store = useDemoStore()
const fpsColor = computed(() => store.perf.fps >= 50 ? '#22c55e' : store.perf.fps >= 30 ? '#f59e0b' : '#ef4444')
</script>

<template>
  <div class="perf-hud">
    <div class="perf-row"><span>FPS</span><b :style="{ color: fpsColor }">{{ store.perf.fps }}</b></div>
    <div class="perf-row"><span>Draw calls</span><b>{{ store.perf.calls }}</b></div>
    <div class="perf-row"><span>三角面</span><b>{{ store.perf.triangles.toLocaleString() }}</b></div>
    <div class="perf-row"><span>设备实例</span><b>{{ store.devices.length }}</b></div>
    <div class="perf-row"><span>类型数</span><b>4</b></div>
    <div class="perf-row"><span>自适应画质</span><b :style="{ color: store.perf.fps < 55 ? '#f59e0b' : '#22c55e' }">{{ store.perf.fps < 55 ? '已降级' : '完整' }}</b></div>
  </div>
</template>
