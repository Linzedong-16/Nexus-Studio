---
description: 'Task list for 001-app-shell-ui implementation'
---

# Tasks: TRAE 风格应用外壳（App Shell）界面骨架

**Input**: Design documents from `/specs/001-app-shell-ui/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: 未请求测试任务（项目无单测框架；质量门禁 = `pnpm run typecheck` + `pnpm run lint`，功能验证 = quickstart.md 手动走查）

**Organization**: 任务按用户故事分组，每个故事可独立实现与验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: 所属用户故事（US1/US2/US3，映射 spec.md）
- 所有路径基于仓库根目录

---

## Phase 1: Setup（依赖与脚手架清理）

**Purpose**: 安装新依赖、清理脚手架演示代码（FR-025）、调校主题令牌

- [x] T001 安装新依赖：根目录执行 `pnpm add react-router` 与 `pnpm dlx shadcn@latest add avatar badge dialog dropdown-menu input tooltip`（组件落入 src/renderer/src/components/ui/，论证见 research.md R-001/R-004）
- [x] T002 [P] 清理脚手架演示代码（FR-025）：删除 src/renderer/src/components/Versions.tsx、src/renderer/src/assets/electron.svg、src/renderer/src/store/counter.ts，并删除 src/main/index.ts 中 `ipcMain.on('ping', ...)` 测试代码
- [x] T003 [P] 调校 src/renderer/src/assets/main.css 为 TRAE 浅色观感：保留 shadcn 令牌体系与 `@theme inline` 结构，`:root` 背景近白 `#fafafa` 系、侧边栏 `#f5f5f5` 系弱分割、低对比边框、`--radius: 0.5rem`，删除 `.dark` 令牌块（research.md R-006）

---

## Phase 2: Foundational（跨进程基础设施）

**Purpose**: 类型契约、全局状态、无边框窗口与窗口控制 IPC —— 所有用户故事的前置

**⚠️ CRITICAL**: 本阶段完成前不得开始任何用户故事

- [x] T004 创建 src/renderer/src/types/shell.ts：按 contracts/shell-config.md 定义 `ModeId`、`ModeRoute`、`MenuAction`、`MenuItem`、`MenuGroup`、`ModeConfig`；按 data-model.md §2 定义 `ShellUIState`（`sidebarCollapsed`/`lastMode`/`searchOpen`/`windowMaximized` + actions 签名），strict 模式零 `any`
- [x] T005 [P] 创建 src/renderer/src/store/shellStore.ts：Zustand + `persist` 中间件（key `shell-store`），`partialize` 仅持久化 `sidebarCollapsed` 与 `lastMode`；实现 `toggleSidebar`/`setSearchOpen`/`setLastMode`/`setWindowMaximized` 四个 action（research.md R-002）
- [x] T006 改造 src/main/index.ts 为无边框窗口：`frame: false`、`minWidth: 940`、`minHeight: 600`、默认 `width: 1280, height: 800`；保留 `contextIsolation: true`（宪法 I）
- [x] T007 创建 src/main/ipc/window.ts 并在 src/main/index.ts 注册：按 contracts/ipc-window.md 实现 `window:minimize`/`window:toggle-maximize`/`window:close`/`window:is-maximized`（invoke/handle，经 `BrowserWindow.fromWebContents(event.sender)` 定向当前窗口），并监听窗口 `maximize`/`unmaximize` 事件广播 `window:maximized-changed`
- [x] T008 [P] 改造 src/preload/index.ts 与 src/preload/index.d.ts：经 `contextBridge.exposeInMainWorld('api', ...)` 暴露 `windowControls` 封装 API（5 个方法，`onMaximizedChange` 返回取消订阅函数），`Window.api` 类型替换脚手架的 `unknown`（contracts/ipc-window.md）

**Checkpoint**: `pnpm run dev` 启动后为无边框窗口（空白内容区），DevTools 中 `window.api.windowControls.isMaximized()` 可用且类型完备

---

## Phase 3: User Story 1 - 三模式切换与独立路由 (Priority: P1) 🎯 MVP

**Goal**: 侧边栏顶部模式切换器（Work / `</>` Code / Design）带滑动指示动画；每模式一组独立路由；切换时菜单与内容区同步；无效路由回退；最近模式持久化

**Independent Test**: quickstart.md 场景 2/3 —— 点击三模式验证动画/菜单/内容同步，`/#/work|code|design` 直达，无效地址回退无白屏，重启恢复最近模式

### Implementation for User Story 1

- [x] T009 [P] [US1] 创建 src/renderer/src/pages/work/WorkHomePage.tsx：基础占位页，居中模式标题（如 "Work" 标语），与 Code/Design 文案明确区分（FR-020）
- [x] T010 [P] [US1] 创建 src/renderer/src/pages/code/CodeHomePage.tsx：基础占位页，居中 "Code with TRAE" 风格大标题（完整输入框骨架在 US3 完善）
- [x] T011 [P] [US1] 创建 src/renderer/src/pages/design/DesignHomePage.tsx：基础占位页，居中 "Design" 标语
- [x] T012 [US1] 创建 src/renderer/src/config/modes.tsx：导出 `MODES: readonly ModeConfig[]` 唯一配置源 —— 三模式（Code 带 `CodeXml` 图标、`basePath` 各为 `/work` `/code` `/design`、默认首页路由），菜单组本期同构复刻截图（新建任务/插件市场/自动化/模板库 + "任务列表"分组含头部操作图标占位，占位 `MenuItem.path` 为 null，依赖 T009–T011）
- [x] T013 [US1] 创建 src/renderer/src/router/router.tsx：`createHashRouter` 由 `MODES` 编程生成路由表 —— 布局路由包裹各模式子路由；`/` → `Navigate` 到 `lastMode` 首页；模式内 `*` 回退模式首页、顶层 `*` 回退 `/`（FR-009）；dev 环境断言每模式恰一条 `path: ''` 且 `basePath` 无重复（contracts/shell-config.md 路由生成约定）
- [x] T014 [P] [US1] 创建 src/renderer/src/components/layout/ModeSwitcher.tsx：分段式三标签切换器，ref 测量激活标签 `offsetLeft/offsetWidth`，绝对定位指示块以 `transform: translateX()` + `width` 过渡（200–250ms）滑动；激活态由 `useLocation` 匹配 `basePath` 推导，点击 = `navigate(basePath)`（research.md R-005，contracts 渲染约定）
- [x] T015 [P] [US1] 创建 src/renderer/src/components/layout/SidebarNav.tsx：按当前模式 `menuGroups` 渲染分组与菜单项（图标+文字、圆角 hover 高亮）；`path` 非空用 `NavLink`、为 null 渲染占位 `<button>`；列表超高可滚动
- [x] T016 [US1] 创建 src/renderer/src/components/layout/Sidebar.tsx：展开态容器（宽 260px），自上而下装配 ModeSwitcher + SidebarNav（滚动区），为 US2/US3 预留折叠态与底部用户区插槽（依赖 T014、T015）
- [x] T017 [P] [US1] 创建 src/renderer/src/components/layout/TitleBar.tsx：顶栏骨架（高约 40px），容器 `-webkit-app-region: drag` 可拖拽，左右控件区留空插槽（US2 填充）
- [x] T018 [US1] 创建 src/renderer/src/components/layout/AppShell.tsx：三区布局容器（TitleBar 置顶 + 下方 flex 行：Sidebar + `<Outlet/>` 内容区 `flex-1`）；`useEffect` 监听 location 将当前模式同步写入 `shellStore.lastMode`（依赖 T013、T016、T017）
- [x] T019 [US1] 重写 src/renderer/src/App.tsx：删除全部演示代码，仅 `RouterProvider` 挂载 T013 路由表

**Checkpoint**: US1 独立完成 —— 三模式切换/直达/回退/模式记忆全部可用，通过 quickstart 场景 2/3

---

## Phase 4: User Story 2 - 侧边栏折叠与顶部全局控件 (Priority: P2)

**Goal**: 顶栏折叠按钮驱动侧边栏 260px↔56px 动画折叠；搜索面板骨架；编辑/帮助下拉菜单骨架；窗口控制三按钮；折叠态持久化

**Independent Test**: quickstart.md 场景 4/5/6 —— 折叠动画 ≤300ms 无跳变、窄栏图标可导航、重启保持折叠态；搜索面板 Esc/遮罩/导航关闭；窗口控制与最大化状态双向同步；最小窗口尺寸约束生效

### Implementation for User Story 2

- [x] T020 [P] [US2] 创建 src/renderer/src/components/layout/WindowControls.tsx：最小化/最大化还原/关闭三按钮，调用 `window.api.windowControls`；启动时 `isMaximized()` 初始化并经 `onMaximizedChange` 订阅同步图标（卸载时取消订阅）；按钮 `-webkit-app-region: no-drag`
- [x] T021 [US2] 补全 src/renderer/src/components/layout/TitleBar.tsx 左侧控件区：折叠按钮（调用 `toggleSidebar`）、搜索图标（`setSearchOpen(true)`）、"编辑(E)"/"帮助(H)" `dropdown-menu` 骨架（占位菜单项：撤销/重做/剪切/复制/粘贴、关于/快捷键），右侧装配 T020 WindowControls；全部交互元素 `no-drag`（FR-016/018）
- [x] T022 [P] [US2] 创建 src/renderer/src/components/layout/SearchPalette.tsx：`Dialog` + `Input` 居中搜索面板骨架（无真实搜索逻辑，FR-017），Esc/点击遮罩关闭；监听路由变化自动关闭（spec Edge Case）
- [x] T023 [P] [US2] 改造 src/renderer/src/components/layout/Sidebar.tsx 支持折叠态：读取 `sidebarCollapsed`，宽度 260px↔56px 过渡 ≤300ms；折叠时菜单文字隐藏仅显图标、菜单图标挂 `tooltip`、模式切换器压缩为纵向图标列；折叠态下导航功能保持可用（FR-011/013，spec US2 场景 6）
- [x] T024 [US2] 改造 src/renderer/src/components/layout/AppShell.tsx：接入 `searchOpen` 渲染 SearchPalette；确认折叠态下内容区 `flex-1` 平滑自适应无抖动（依赖 T021、T022、T023）

**Checkpoint**: US2 独立完成 —— 折叠/搜索/菜单/窗口控制全部可用，通过 quickstart 场景 4/5/6

---

## Phase 5: User Story 3 - 用户信息区与模式占位首页 (Priority: P3)

**Goal**: 侧边栏底部固定用户信息区（头像/名称/套餐徽章/移动端入口，折叠态仅头像）；三个模式首页完善为截图风格骨架（大标题 + 输入框 + 快捷按钮组）

**Independent Test**: quickstart.md 场景 1/8 —— 用户区固定底部不随菜单滚动、折叠态仅头像、头像加载失败显示首字符 fallback；五要点视觉走查对照截图

### Implementation for User Story 3

- [x] T025 [US3] 创建 src/renderer/src/components/layout/UserPanel.tsx：`Avatar`（`avatarUrl` 为 null 时首字符 fallback，spec Edge Case）+ 用户名 + `Badge` 套餐标识（免费）+ 移动端次级入口；模块级常量硬编码占位数据（data-model.md §3）；折叠态收缩为仅头像
- [x] T026 [US3] 集成 src/renderer/src/components/layout/Sidebar.tsx：UserPanel 固定底部（菜单滚动区之外，不随滚动，FR-014/015）（依赖 T025）
- [x] T027 [P] [US3] 完善 src/renderer/src/pages/code/CodeHomePage.tsx：参考截图完整骨架 —— 居中 `</> Code with TRAE` 风格大标题、居中输入框卡片（占位文本 + 底部工具栏图标组 + 右侧模型选择占位与主操作按钮）、下方快捷操作按钮组（应用开发/项目理解/游戏创意/工具脚本式占位）、输入框下方环境/项目选择占位行；全部纯展示有 hover/焦点反馈（FR-019/021）
- [x] T028 [P] [US3] 完善 src/renderer/src/pages/work/WorkHomePage.tsx：同构骨架，标题/快捷按钮文案按 Work 模式区分（FR-020）
- [x] T029 [P] [US3] 完善 src/renderer/src/pages/design/DesignHomePage.tsx：同构骨架，标题/快捷按钮文案按 Design 模式区分（FR-020）

**Checkpoint**: US3 独立完成 —— 用户区与三模式占位首页达到截图观感，通过 quickstart 场景 1/8

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 质量门禁与整体走查

- [x] T030 执行 `pnpm run format`、`pnpm run lint`、`pnpm run typecheck` 并修复至全部零错误（宪法质量门禁）
- [x] T031 按 quickstart.md 场景 1–8 全量走查并修复问题（含 SC-004 扩展性抽查：注册表加临时页面验证外壳零改动后回滚）
- [x] T032 [P] 对照 TRAE 截图做视觉微调：间距/圆角/字号层级/hover 态/切换器与折叠动画时长（SC-001/002/005）
- [x] T033 按 Conventional Commits 中文提交（如 `feat: 实现 TRAE 风格应用外壳界面骨架`）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖，立即开始
- **Foundational (Phase 2)**: 依赖 Setup（T002 先删 main/index.ts 的 ping，T006/T007 再改造同文件）—— **阻断所有用户故事**
- **User Stories (Phase 3–5)**: 均依赖 Foundational 完成
  - US1 承载外壳主体（页面/注册表/路由/布局组件），US2、US3 在同一批布局文件上增量改造
  - 因此本特性三个故事**顺序执行**（P1 → P2 → P3），并行度体现在故事内部
- **Polish (Phase 6)**: 依赖全部故事完成

### User Story Dependencies

- **US1 (P1)**: Foundational 完成后即可开始 —— 产出路由表、模式注册表、AppShell/Sidebar/TitleBar 骨架
- **US2 (P2)**: 依赖 US1 的 TitleBar/Sidebar/AppShell 文件存在（增量改造，非同文件并行）
- **US3 (P3)**: 依赖 US1 的页面文件与 US2 完成后的 Sidebar（集成 UserPanel）

### Within Each User Story

- US1: 页面（T009–T011 [P]）→ 注册表（T012）→ 路由（T013）→ 布局组件（T014/T015/T017 [P] → T016 → T018）→ 入口（T019）
- US2: 独立新文件（T020/T022/T023 [P]，T023 改造 US1 的 Sidebar）→ TitleBar 补全（T021）→ AppShell 集成（T024）
- US3: UserPanel（T025）→ Sidebar 集成（T026）；页面完善（T027/T028/T029 [P]，与 T025/T026 不同文件可并行）

### Parallel Opportunities

- Phase 1: T002、T003 可并行（T001 先行，后续任务依赖新依赖类型）
- Phase 2: T005、T008 可并行；T006 → T007 串行（同文件 src/main/index.ts）
- US1: T009/T010/T011 三页面并行；T014/T015/T017 三布局组件并行
- US2: T020/T022/T023 并行
- US3: T027/T028/T029 并行，且可与 T025/T026 并行

---

## Parallel Example: User Story 1

```bash
# 三个占位页面同时创建：
Task: "创建 src/renderer/src/pages/work/WorkHomePage.tsx"
Task: "创建 src/renderer/src/pages/code/CodeHomePage.tsx"
Task: "创建 src/renderer/src/pages/design/DesignHomePage.tsx"

# 注册表与路由就绪后，三个布局组件并行：
Task: "创建 src/renderer/src/components/layout/ModeSwitcher.tsx"
Task: "创建 src/renderer/src/components/layout/SidebarNav.tsx"
Task: "创建 src/renderer/src/components/layout/TitleBar.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1（依赖 + 清理）与 Phase 2（类型/状态/窗口 IPC 基础设施）
2. 完成 Phase 3 US1 → **停止并验证**：quickstart 场景 2/3 —— 此时已具备"可运行、可切换、可直达、可回退"的三工作区骨架，可独立演示

### Incremental Delivery

1. Setup + Foundational → 无边框空壳窗口 + 类型化窗口 IPC 就绪
2. - US1 → 三模式路由骨架（MVP）→ 场景 2/3 验证
3. - US2 → 折叠/搜索/菜单/窗口控制补全 → 场景 4/5/6 验证
4. - US3 → 用户区与占位首页完善 → 场景 1/8 视觉走查
5. Polish → 质量门禁 + 全量走查 + 提交

---

## Notes

- [P] 任务 = 不同文件、无未完成依赖；同文件跨任务（如 main/index.ts、Sidebar.tsx、TitleBar.tsx、AppShell.tsx）必须串行
- [Story] 标签映射 spec.md 用户故事，保证可追溯
- 无测试任务：功能验证以 quickstart.md 各场景为 Checkpoint 门槛
- 每个 Checkpoint 后即可暂停验证；验证失败不进入下一阶段
- 动画一律使用 `transform`/`width`/`opacity` 过渡（GPU 友好），禁止引入动画库（research.md R-005）
- 提交粒度：每个 Phase 完成后提交一次，或按 T033 最终统一提交
