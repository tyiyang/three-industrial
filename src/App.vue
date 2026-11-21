<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Scene3D from './components/Scene3D.vue'
import DataPanel from './components/DataPanel.vue'
import { useDeviceStore } from './composables/useDeviceStore'
import { MockDeviceSocket } from './composables/useMockWebSocket'

const { connected, applyMessage } = useDeviceStore()
let socket: MockDeviceSocket | null = null

onMounted(() => {
  socket = new MockDeviceSocket()
  socket.onopen = () => {
    connected.value = true
  }
  socket.onmessage = (msg) => applyMessage(msg)
  socket.onclose = () => {
    connected.value = false
  }
  socket.connect()
})

onBeforeUnmount(() => socket?.close())
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div>
        <h1>工业园区 · 三维可视化监控</h1>
        <span class="sub">Three.js + Vue3 + TypeScript · 实例化渲染 Demo</span>
      </div>
      <div class="right">
        <span class="badge">
          <i class="dot pulse"></i>
          {{ connected ? '数据链路已连接' : '连接中…' }}
        </span>
        <span>模拟 WebSocket · 2s / 次</span>
      </div>
    </header>
    <div class="main">
      <aside class="sidebar">
        <DataPanel />
      </aside>
      <Scene3D />
    </div>
  </div>
</template>
