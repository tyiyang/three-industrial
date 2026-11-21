<script setup lang="ts">
import { computed } from 'vue'
import { useDemoStore } from '../stores/useDemoStore'
import { LEVEL_HEX, LEVEL_LABEL, STATE_LABEL } from '../types'

const store = useDemoStore()
const emit = defineEmits<{ (e: 'locate', id: number): void }>()

const list = computed(() => store.alarmList.filter((a) =>
  store.alarmFilter === 'all' || a.level === store.alarmFilter,
))

function time(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}
</script>

<template>
  <div class="card">
    <h2>告警中心 <span class="count" v-if="store.unackCount">{{ store.unackCount }} 未确认</span></h2>
    <div class="alarm-filters">
      <button v-for="f in (['all','critical','warning','info'] as const)" :key="f"
        :class="{ on: store.alarmFilter === f }" @click="store.alarmFilter = f">
        {{ f === 'all' ? '全部' : LEVEL_LABEL[f] }}
      </button>
      <button class="ack-all" @click="store.ackAll()">全部确认</button>
    </div>
    <div class="alarm-list">
      <div v-if="!list.length" class="empty">暂无活动告警</div>
      <div v-for="a in list" :key="a.id" class="alarm-item" :class="{ ack: a.acknowledged }">
        <div class="alarm-bar" :style="{ background: LEVEL_HEX[a.level] }"></div>
        <div class="alarm-body" @click="emit('locate', a.deviceId)">
          <div class="alarm-head">
            <span class="level" :style="{ color: LEVEL_HEX[a.level] }">{{ LEVEL_LABEL[a.level] }}</span>
            <span class="dev">{{ a.deviceName }}</span>
            <span class="time">{{ time(a.lastSeenAt) }}</span>
          </div>
          <div class="msg">{{ a.message }}</div>
          <div class="meta">触发 {{ a.count }} 次 · 持续 {{ ((a.lastSeenAt - a.startedAt) / 1000).toFixed(0) }}s</div>
        </div>
        <div class="alarm-actions">
          <button v-if="!a.acknowledged" @click="store.ackAlarm(a.id)" title="确认">✓</button>
          <button v-if="!a.silenced" @click="store.silenceAlarm(a.id)" title="静默">🔇</button>
        </div>
      </div>
    </div>
  </div>
</template>
