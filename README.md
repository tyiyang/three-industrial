# 工业园区三维可视化监控平台

一个完整的工业设备监控 Demo：Vue 3 + Three.js + TypeScript + Vite + Pinia，数据仿真在 Web Worker 中运行，可直接部署到 GitHub Pages。

## 技术栈

| 层次 | 技术 |
|---|---|
| 框架 | Vue 3（Composition API）+ Pinia + TypeScript（strict） |
| 三维 | Three.js r169：InstancedMesh / LOD / glTF / EffectComposer（Bloom + Outline）/ CSS2DRenderer / Raycaster |
| 图表 | ECharts 5（饼图 / 热力图 / 横向条形 / 多轴趋势） |
| 动画 | @tweenjs/tween.js（相机缓动飞行） |
| 并发 | Web Worker（仿真计算与告警规则）+ 环形缓冲区 |
| 测试 | Vitest（状态机 / 环形缓冲 / 告警引擎，14 个用例） |
| 构建 | Vite 5，`base: './'` 相对路径，GitHub Actions 自动部署 |

## 核心功能

### 三维场景
- **四种 glTF 设备模型**（反应釜 / 储罐 / 配电柜 / 冷却塔），由 `scripts/gen_model.py` 生成，buffer 以 base64 内嵌，无外部 .bin 依赖
- **按类型分组的 InstancedMesh**：120 台设备仅 4 个 Draw Call；状态变化只更新变化的 `instanceColor`
- **园区场景**：主干道、厂房、围墙、路灯、绿化带、网格地面
- **后处理**：UnrealBloom 辉光 + OutlinePass 选中描边（无选中时自动跳过以省性能）
- **LOD**：相机拉远时切换到低模盒体；视锥剔除由 Three.js 自动完成
- **昼夜光照**：DirectionalLight + HemisphereLight + 阴影，一键切换
- **设备标签**：CSS2DRenderer 展示选中与告警设备铭牌

### 交互
- 点击选中、Shift 加选、双击聚焦飞行
- **框选模式**：拖拽矩形批量选中
- **测距工具**：点击地面两点测量距离
- **三种预设视角**（总览 / 俯视 / 巡检），相机缓动飞行
- **搜索定位**：按名称 / 编号 / 区域定位设备
- 告警中心点击告警项定位到对应设备

### 数据链路
- Web Worker 每 2 秒推送增量遥测（温度 / 压力 / 负载 / 振动 / 健康度），带**均值回归**避免数值漂移
- **状态机**：6 种状态（运行/待机/告警/故障/检修/离线），合法迁移约束，非法迁移被拒绝
- **告警规则引擎**：5 条规则（温度高/超限、振动异常、压力低、负载高），连续命中 N 次才触发、滞回清除，避免告警抖动
- **断线重连、心跳**：Worker 生命周期由 composable 管理（真实 WebSocket 可直接替换）
- 120 帧快照**环形缓冲**，支持历史时间轴回放任意时刻的园区状态

### 分析面板
- KPI：在线率、平均健康度、平均温度、活动告警数
- 状态分布环形图、区域×类型告警热力图、健康度最差 Top 8、选中设备多轴趋势
- 告警中心：等级筛选、确认、静默、全部确认

### 工程化
- Pinia 集中状态管理，严格 TypeScript 类型
- 14 个 Vitest 单测覆盖状态机 / 环形缓冲 / 告警引擎
- 性能 HUD（FPS / Draw Call / 三角面 / 实例数）+ **自适应画质降级**（连续低帧自动关辉光与阴影）

## 本地运行

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm run preview
npm test           # 运行单测
python scripts/gen_model.py   # 重新生成四种 glTF 模型
```

## 部署到 GitHub Pages

1. 推送到 `main` 或 `master` 分支
2. 仓库 Settings → Pages → Source 选 **GitHub Actions**
3. `.github/workflows/deploy.yml` 自动构建部署（已配置 `enablement: true`，会自动开启 Pages）
4. 访问 `https://<用户名>.github.io/<仓库名>/`

## 目录结构

```
src/
  components/   Scene3D / DataPanel / AlarmCenter / Toolbar / PerfHUD / Timeline / EChart
  core/         stateMachine / alarmEngine / ringBuffer / campus（纯逻辑与几何，可单测）
  stores/       useDemoStore.ts（Pinia）
  workers/      simulation.worker.ts（仿真 + 告警计算）
  composables/  useSimulation.ts（Worker 生命周期）
  types/        index.ts（全部类型与状态色值）
scripts/gen_model.py   glTF 生成器
tests/core.test.ts     核心逻辑单测
```

## 面试讲解要点（按技术深度）

1. **性能**：为什么用 InstancedMesh？120 台设备从 120 Draw Call 降到 4；如何按类型分组、只更新变化的实例色
2. **并发**：为什么把仿真放 Worker？主线程只做渲染与增量应用；环形缓冲 O(1) 写入
3. **状态建模**：状态机约束迁移 vs 直接 if-else 赋值；告警规则为何要"连续 N 次 + 滞回清除"
4. **渲染管线**：EffectComposer 各 Pass 的作用，OutlinePass 的开销与按需启用优化
5. **工程化**：Pinia 状态拆分、严格 TS、Vitest 保证核心逻辑、自适应画质降级策略
