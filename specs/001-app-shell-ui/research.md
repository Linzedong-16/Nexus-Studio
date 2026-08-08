# Phase 0 Research: TRAE 风格应用外壳

本文件记录实施前全部技术决策。规格无 [NEEDS CLARIFICATION] 遗留项，以下为重点技术选型与依赖论证（宪法 VII 要求）。

## R-001 路由方案

- **Decision**: 引入 `react-router` v7（`createHashRouter`），路由表由模式注册表（`config/modes.tsx`）编程生成
- **Rationale**:
  - FR-006 要求"路由地址可反映当前模式与页面、可直达"，状态切换式视图无法满足，必须有真实路由
  - Electron 生产环境以 `file://` 加载渲染进程，BrowserRouter 的 history API 在 `file://` 下刷新/直达会失效；**HashRouter 是 Electron 渲染进程的标准做法**（URL 中 `#/` 之后部分不参与文件路径解析）
  - v7 的 `createHashRouter` data API 支持布局路由（`<AppShell/>` 包裹各模式子路由）与 `Navigate` 重定向，天然覆盖 FR-009 无效路由回退
  - 配置驱动：`router.tsx` 遍历模式注册表生成 children，新增页面 = 注册表加一条记录（FR-010）
- **Alternatives considered**:
  - 自研状态切换视图（Zustand 存 currentPage）：无法满足路由可直达/可回退要求，且后续业务页（连接详情、查询标签页）必然需要路由，返工成本高 → 否决
  - `@tanstack/react-router`：功能更强但包体积与学习成本更高，本期无需其类型化 search params 能力 → 否决
  - BrowserRouter：`file://` 协议下不可直达 → 否决

## R-002 外壳 UI 状态持久化

- **Decision**: Zustand 5 + 内置 `persist` 中间件，`partialize` 仅持久化 `{ sidebarCollapsed, lastMode }` 到 localStorage；`searchOpen` 等瞬态不持久化
- **Rationale**:
  - 纯渲染进程 UI 偏好，无跨进程/加密需求；localStorage 为 Web 内置 API，**零新增依赖**（宪法 VII"优先内置"）
  - Zustand persist 为官方内置中间件，不是新依赖；`partialize` 精确控制持久化字段
  - 当前模式以路由 URL 为唯一事实源（刷新/直达可恢复），`lastMode` 仅用于启动时 `/` → 上次模式首页的重定向
- **Alternatives considered**:
  - `electron-store`（主进程 JSON 文件）：需要新增 IPC 往返读写 UI 偏好，为重非对称；宪法推荐它用于业务数据（连接配置等），留给 Phase 2+ → 本期否决
  - React Context + 手动 localStorage：违反宪法 III"禁止 Context 管理频繁变更状态" → 否决

## R-003 无边框窗口与窗口控制

- **Decision**: `BrowserWindow` 设 `frame: false`（全平台统一自定义标题栏）；顶部栏拖拽区用 CSS `-webkit-app-region: drag`，交互元素 `no-drag`；窗口控制走 `window:*` IPC（invoke/handle），最大化状态变化经 `window:maximized-changed` 事件（send/on）推送；设置 `minWidth: 940, minHeight: 600`（FR-003）
- **Rationale**:
  - 参考截图为自定义标题栏（无原生标题栏），FR-002 明确无边框方案
  - 窗口控制属于"危险操作"，必须在主进程执行（宪法 I），渲染进程经 preload 封装 API 调用
  - 最大化/还原状态需双向同步（用户也可用系统手势/双击标题栏触发），故需主→渲染事件通道
- **Alternatives considered**:
  - `titleBarStyle: 'hiddenInset'`（macOS 原生红绿灯）：跨平台行为不一致，Windows 仍需自绘，双套逻辑 → 本期否决，记为未来可选优化
  - 渲染进程直接 `remote`/暴露原始 `ipcRenderer`：宪法 I 明令禁止 → 否决

## R-004 shadcn/ui 组件增补

- **Decision**: 通过 shadcn CLI 增补 6 个基础组件：`avatar`（用户区）、`badge`（套餐标识）、`dialog`（搜索面板）、`dropdown-menu`（编辑/帮助菜单）、`input`（搜索框与首页输入骨架）、`tooltip`（折叠窄栏图标提示）
- **Rationale**: 宪法 III 规定基础交互控件统一用 shadcn/ui 不自研；以上为本期外壳最小必需集
- **Alternatives considered**:
  - `command`（cmdk 搜索面板）：搜索面板本期为纯骨架（FR-017 无真实搜索逻辑），Dialog + Input 足够；引入 cmdk 属过度依赖 → 否决，真实搜索落地时再评估
  - `scroll-area`：菜单滚动用原生 `overflow-y-auto` 即可，不为样式细节加 Radix 依赖 → 否决
  - `separator`：分隔线用 Tailwind `border`/`h-px` 实现 → 否决
  - framer-motion（切换器动画）：见 R-005 → 否决

## R-005 模式切换器滑动指示动画

- **Decision**: 纯 CSS 方案：切换器容器 `relative`，指示器为绝对定位元素，通过 ref 测量激活标签的 `offsetLeft/offsetWidth`，以 `transform: translateX()` + `width` 过渡（`transition-transform` 200–250ms，GPU 合成属性）实现滑动；侧边栏折叠用 `width` 260px↔56px 过渡
- **Rationale**: `transform`/`opacity` 走合成器线程可稳定 60fps（SC-001/002）；无需任何动画库，符合依赖最小化
- **Alternatives considered**:
  - framer-motion `layoutId`：体验优秀但为两个微动画引入 ~40KB 依赖，宪法 VII 不允许 → 否决
  - JS 逐帧动画（requestAnimationFrame）：手写插值易掉帧且代码冗余 → 否决

## R-006 主题令牌调校（TRAE 浅色观感）

- **Decision**: 保留脚手架 `main.css` 的 shadcn 令牌体系与 `@theme inline` 结构，仅调校 `:root` 浅色令牌：背景近白（`#fafafa` 系）、侧边栏略深于内容区（`#f5f5f5` 系弱分割）、边框低对比、圆角 `--radius: 0.5rem`、中性灰文字层级；删除 `.dark` 令牌块（本期仅浅色，spec Assumptions）
- **Rationale**: 截图观感为近色系弱分割浅色界面；shadcn neutral 基底与 TRAE 灰阶吻合，微调即可；保留令牌体系保证后续 shadcn 组件接入零冲突
- **Alternatives considered**:
  - 全部推翻手写 CSS 变量：破坏 shadcn 约定，后续组件增补需返工 → 否决
  - 保留 .dark 块"备用"：未经验证的死代码，且与"仅浅色"范围声明矛盾 → 删除（深色主题立项时重新生成）

## R-007 模式注册表设计（配置驱动核心）

- **Decision**: `config/modes.tsx` 导出 `MODES: ModeConfig[]` 唯一配置源；`router.tsx` 消费它生成路由，`SidebarNav`/`ModeSwitcher` 消费它渲染；类型定义见 [contracts/shell-config.md](contracts/shell-config.md)
- **Rationale**: FR-010/FR-023 要求新增页面不动外壳；注册表模式使"加一个页面"="数组加一项"，外壳组件零修改，编译期类型检查兜底
- **Alternatives considered**:
  - 约定式文件系统路由（扫描 pages/ 目录）：需 vite `import.meta.glob` 魔法，隐式约定降低可读性，菜单顺序/图标仍需配置 → 否决（显式注册表更直白）

## R-008 脚手架清理范围（FR-025）

- **Decision**: 删除 `Versions.tsx`、`electron.svg`、`store/counter.ts`、主进程 `ping` IPC；重写 `App.tsx`；`main.css` 按 R-006 调校而非删除
- **Rationale**: `main.css` 内容经核实为 shadcn 设计令牌（非 electron-vite 演示样式），属设计系统基础设施应保留调校；其余均为演示代码，残留会污染样式与打包体积
- **注意**: `resources/icon.png` 为打包图标，不在清理范围
