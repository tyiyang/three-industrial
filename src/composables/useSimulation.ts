import { onBeforeUnmount, onMounted } from 'vue'
import type { WorkerIn, WorkerOut } from '../types'
import { useDemoStore } from '../stores/useDemoStore'

/** 在 Worker 中运行仿真，主线程只负责把增量写入 store */
export function useSimulation() {
  const store = useDemoStore()
  let worker: Worker | null = null

  function send(msg: WorkerIn) {
    worker?.postMessage(msg)
  }

  onMounted(() => {
    worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const msg = e.data
      if (msg.type === 'ready') {
        store.connected = true
        return
      }
      if (msg.type === 'tick') {
        store.applyTick(msg.t, msg.patches, msg.alarms, msg.snapshot)
      }
    }
    send({ type: 'init', devices: store.devices.map((d) => ({ ...d })) })
    send({ type: 'interval', ms: store.intervalMs })
  })

  onBeforeUnmount(() => {
    worker?.terminate()
    worker = null
    store.connected = false
  })

  return {
    setInterval(ms: number) {
      store.intervalMs = ms
      send({ type: 'interval', ms })
    },
    setPaused(paused: boolean) {
      store.paused = paused
      send({ type: 'pause', paused })
    },
    inject(id: number, state: import('../types').DeviceState) {
      send({ type: 'inject', id, state })
    },
  }
}
