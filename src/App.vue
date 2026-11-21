<script setup lang="ts">
import { ref } from 'vue'
import Scene3D from './components/Scene3D.vue'
import DataPanel from './components/DataPanel.vue'
import AlarmCenter from './components/AlarmCenter.vue'
import Toolbar from './components/Toolbar.vue'
import PerfHUD from './components/PerfHUD.vue'
import Timeline from './components/Timeline.vue'
import { useDemoStore } from './stores/useDemoStore'
import { useSimulation } from './composables/useSimulation'

const store = useDemoStore()
useSimulation()
const sceneRef = ref<InstanceType<typeof Scene3D> | null>(null)

function locate(id: number) {
  sceneRef.value?.flyToDevice(id)
}
function preset(p: 'overview' | 'top' | 'aisle') {
  sceneRef.value?.applyPreset(p)
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div>
        <h1>工业园区 · 三维可视化监控平台</h1>
        <span class="sub">Three.js + Vue3 + Pinia + TypeScript · 多模型实例化 · 状态机 · 实时告警</span>
      </div>
      <div class="right">
        <span class="badge"><i class="dot pulse"></i>{{ store.connected ? '数据链路已连接' : '连接中…' }}</span>
        <span>Worker 仿真 · {{ store.intervalMs / 1000 }}s / 次</span>
        <span>推送 {{ store.tickCount }} 批</span>
      </div>
    </header>
    <div class="main">
      <aside class="sidebar left">
        <DataPanel @locate="locate" />
      </aside>
      <section class="stage">
        <Toolbar @preset="preset" @locate="locate" />
        <Scene3D ref="sceneRef" />
        <PerfHUD />
        <Timeline />
      </section>
      <aside class="sidebar right">
        <AlarmCenter @locate="locate" />
      </aside>
    </div>
  </div>
</template>
