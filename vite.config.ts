import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Relative base so the built site works on any GitHub Pages project path
// (https://<user>.github.io/<repo>/) without hard-coding the repo name.
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          echarts: ['echarts'],
        },
      },
    },
  },
})
