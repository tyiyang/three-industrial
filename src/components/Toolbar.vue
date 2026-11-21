<script setup lang="ts">
import { ref } from 'vue'
import { useDemoStore } from '../stores/useDemoStore'

const store = useDemoStore()
const emit = defineEmits<{
  (e: 'preset', value: 'overview' | 'top' | 'aisle'): void
  (e: 'locate', id: number): void
}>()

const query = ref('')

function search() {
  const d = store.findDevice(query.value)
  if (d) {
    store.select(d.id)
    emit('locate', d.id)
  }
}
</script>

<template>
  <div class="toolbar">
    <div class="tool-group">
      <span class="tool-label">视角</span>
      <button v-for="p in ([['overview','总览'],['top','俯视'],['aisle','巡检']] as const)" :key="p[0]"
        :class="{ on: store.cameraPreset === p[0] }" @click="emit('preset', p[0])">{{ p[1] }}</button>
    </div>
    <div class="tool-group">
      <button :class="{ on: store.selectMode }" @click="store.selectMode = !store.selectMode">框选</button>
      <button :class="{ on: store.measureMode }" @click="store.measureMode = !store.measureMode">测距</button>
      <button :class="{ on: !store.dayMode }" @click="store.dayMode = !store.dayMode">
        {{ store.dayMode ? '夜景' : '日景' }}
      </button>
      <button :class="{ on: store.lodEnabled }" @click="store.lodEnabled = !store.lodEnabled">LOD</button>
      <button :class="{ on: store.poiEnabled }" @click="store.poiEnabled = !store.poiEnabled">热点</button>
    </div>
    <div class="tool-group">
      <span class="tool-label">巡检</span>
      <button :class="{ on: store.patrolMode }" @click="store.patrolMode = !store.patrolMode">
        {{ store.patrolMode ? '停止' : '巡游' }}
      </button>
      <button :disabled="!store.patrolMode" @click="store.patrolSpeed = store.patrolSpeed >= 2 ? 0.5 : store.patrolSpeed + 0.5">
        {{ store.patrolSpeed }}x
      </button>
    </div>
    <div class="tool-group search-group">
      <input v-model="query" placeholder="搜索设备名 / 编号 / 区域" @keyup.enter="search" />
      <button class="primary" @click="search">定位</button>
    </div>
  </div>
</template>
