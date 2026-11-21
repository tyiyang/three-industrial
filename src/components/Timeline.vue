<script setup lang="ts">
import { computed } from 'vue'
import { useDemoStore } from '../stores/useDemoStore'

const store = useDemoStore()
const count = computed(() => store.snapshots.length)
const currentTime = computed(() => {
  const s = store.snapshots[store.playbackIndex]
  return s ? new Date(s.t).toLocaleTimeString('zh-CN', { hour12: false }) : '--:--:--'
})

function toggle() {
  store.playbackMode = !store.playbackMode
  if (store.playbackMode) store.playbackIndex = Math.max(0, count.value - 1)
}
</script>

<template>
  <div class="timeline">
    <button class="tl-toggle" :class="{ on: store.playbackMode }" @click="toggle">
      {{ store.playbackMode ? '退出回放' : '历史回放' }}
    </button>
    <span class="tl-time">{{ currentTime }}</span>
    <input type="range" :min="0" :max="Math.max(0, count - 1)" v-model.number="store.playbackIndex"
      :disabled="!store.playbackMode" />
    <span class="tl-hint">{{ count }} 帧快照 · 每 2s 一帧</span>
  </div>
</template>
