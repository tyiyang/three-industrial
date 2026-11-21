# 工业园区三维可视化 Demo

Vue 3 + Three.js + TypeScript + Vite 实现的最小可行三维可视化Demo，可直接部署到 GitHub Pages。

## 功能

- **glTF 模型加载**：`public/models/device.gltf` 为自包含工业设备模型（内嵌 base64 buffer），由 `scripts/gen_model.py` 生成。加载失败时自动降级到内置几何体。
- **实例化绘制**：120 台设备通过单个 `THREE.InstancedMesh` 渲染（1 Draw Call），状态变更时仅更新变化的 `instanceColor`。
- **状态映射颜色**：正常=绿 / 告警=橙 / 故障=红 / 离线=灰，通过 `setColorAt()` 写入实例颜色。
- **点击选中高亮**：Raycaster 拾取 instanceId，线框盒 + 地面光环标识选中设备，左侧图表联动刷新。
- **ECharts 联动**：状态分布环形图、选中设备温度仪表盘、温度/负载实时曲线（24 点滚动）。
- **模拟 WebSocket**：`MockDeviceSocket` 每 2 秒推送一次设备数据（随机游走 + 突发尖峰驱动状态迁移），接口与真实 `WebSocket` 对齐，替换成本低。
- **FPS 计数**：右上角实时显示帧率，目标稳定 60fps。

## 本地运行

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 类型检查 + 生产构建 -> dist/
npm run preview  # 预览构建产物
```

重新生成 glTF 模型（可选）：

```bash
python scripts/gen_model.py
```

## 部署到 GitHub Pages

1. 将本项目推送到你的 GitHub 仓库（分支 `main` 或 `master`）。
2. 进入仓库 **Settings → Pages → Build and deployment**，Source 选择 **GitHub Actions**。
3. `.github/workflows/deploy.yml` 会在每次 push 后自动构建并部署。
4. 部署完成后访问 `https://<用户名>.github.io/<仓库名>/`。

> `vite.config.ts` 使用 `base: './'` 相对路径，无需根据仓库名修改配置。

## 接入真实 WebSocket

在 `src/App.vue` 中将 `MockDeviceSocket` 替换为原生 `WebSocket`，并保证推送消息符合 `WsMessage` 类型（`src/types/index.ts`）：

```ts
const socket = new WebSocket('wss://your-endpoint')
socket.onmessage = (e) => applyMessage(JSON.parse(e.data) as WsMessage)
```

## 目录结构

```
src/
  components/
    Scene3D.vue        # Three.js 场景、glTF 加载、实例化、拾取高亮、FPS
    DataPanel.vue      # ECharts 图表与设备列表
    EChart.vue         # ECharts 封装（自动 resize / dispose）
  composables/
    useDeviceStore.ts  # 响应式设备状态单例
    useMockWebSocket.ts# 模拟 WebSocket 数据源
  types/index.ts       # 类型与状态色值
public/models/device.gltf
scripts/gen_model.py   # glTF 生成器
```
