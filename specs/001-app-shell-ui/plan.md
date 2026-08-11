# Implementation Plan: TRAE 风格应用外壳（App Shell）界面骨架

**Branch**: `001-app-shell-ui` | **Date**: 2026-08-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-app-shell-ui/spec.md`

## Summary

为 Nexus Studio 桌面应用搭建参考字节 TRAE 客户端的应用外壳：自定义无边框窗口（顶部全局操作栏 + 窗口控制按钮）、左侧可折叠侧边栏（含 Work/Code/Design 三模式分段切换器、模式菜单区、底部用户信息区）、右侧核心内容视图（各模式独立路由组的占位首页）。核心机制为**配置驱动**：模式、路由、菜单集中在模式注册表中定义，外壳组件消费配置，新增页面零改动外壳。本期仅交付 UI 骨架，先清理 electron-vite 脚手架示例代码，全局 UI 状态（折叠态、最近模式）持久化，窗口控制走类型化 IPC。

## Technical Context

**Language/Version**: TypeScript 5.9（strict 模式，零 `any`）

**Primary Dependencies**: Electron 39 · React 19 · Tailwind CSS 4 · shadcn/ui（Radix UI）· Zustand 5 · electron-vite 5 · lucide-react（既有）；**新增**：`react-router` v7（路由）、`@radix-ui/react-dropdown-menu` / `react-dialog` / `react-avatar` / `react-tooltip`（随 shadcn 组件引入）

**Storage**: 外壳 UI 状态（侧边栏折叠态、最近使用模式）经 Zustand `persist` 中间件存 localStorage；无业务数据存储（本期不引入 electron-store）

**Testing**: 无单测框架（项目现状）；质量门禁为 `pnpm run typecheck` + `pnpm run lint` 零错误，功能验证按 quickstart.md 手动走查

**Target Platform**: Windows / macOS / Linux 桌面（Electron 三进程架构）

**Project Type**: desktop-app（Electron main / preload / renderer 三层隔离）

**Performance Goals**: 动画全程 ≤300ms 且 60fps；模式切换视觉响应 <200ms；外壳冷启动可交互 <3s

**Constraints**: 宪法七原则（进程隔离、类型安全、组件分离、IPC 契约、分阶段交付、依赖最小化）；`contextIsolation: true` / `nodeIntegration: false`；IPC 通道 `模块:操作` 命名；渲染进程禁止直接访问 Node.js API

**Scale/Scope**: 1 套外壳布局（~9 个布局组件）+ 3 个模式占位首页 + 1 个模式注册表 + 窗口控制 IPC（5 通道）；不含任何数据库业务功能

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 宪法原则                | 门禁项                                                                        | 判定      | 说明                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. 进程隔离与安全       | 渲染进程不直接访问 Node/Electron API；窗口控制经 contextBridge 暴露的封装 API | ✅ 通过   | 新增 `window:*` IPC + preload `windowControls` 封装 API；`contextIsolation: true`、`nodeIntegration: false` 维持不变；本期无凭据/数据库操作                               |
| II. TypeScript 类型安全 | IPC 请求/返回值类型化；零 `any`；Store 签名完备                               | ✅ 通过   | `window:*` 通道在 `types/` 与 `preload/index.d.ts` 双侧声明；模式注册表全量类型化                                                                                         |
| III. 组件化与关注点分离 | shadcn/ui 基础组件；layout/ 纯布局无业务；状态统一 Zustand                    | ✅ 通过   | 布局组件全部入 `components/layout/`；模式/路由/菜单集中于 `config/modes.tsx` 配置驱动（FR-010/FR-023）；全局 UI 状态入 `shellStore`                                       |
| IV. 数据库适配器模式    | 本期不涉及数据库代码                                                          | ✅ N/A    | Phase 1 范围外，适配器层后续阶段实现                                                                                                                                      |
| V. IPC 通信契约         | 通道 `模块:操作` 命名；双向用 invoke/handle；单向通知用 send/on               | ✅ 通过   | `window:minimize` / `window:toggle-maximize` / `window:close` / `window:is-maximized`（invoke/handle）+ `window:maximized-changed`（send/on 通知）                        |
| VI. 分阶段交付          | 本期即宪法 Phase 1（基础框架），完成后可独立构建运行                          | ✅ 通过   | 交付物 = 可运行骨架，无 Phase 2+ 业务                                                                                                                                     |
| VII. 依赖最小化         | 新增依赖需论证；优先内置 API                                                  | ⚠️ 需论证 | 新增 `react-router` 与 4 个 Radix 包，论证见 [research.md](research.md)；UI 状态持久化用 localStorage（Web 内置，零依赖）替代 electron-store；不引入 framer-motion / cmdk |

**门禁结论**：无阻断性违规；新增依赖已在 Phase 0 研究中完成论证（见 Complexity Tracking 不适用，依赖论证记录于 research.md R-001/R-004）。

## Project Structure

### Documentation (this feature)

```text
specs/001-app-shell-ui/
├── plan.md              # 本文件（/speckit-plan 输出）
├── research.md          # Phase 0 输出：技术决策与依赖论证
├── data-model.md        # Phase 1 输出：外壳领域类型与状态机
├── quickstart.md        # Phase 1 输出：手动验证走查指南
├── contracts/           # Phase 1 输出
│   ├── ipc-window.md    # 窗口控制 IPC 契约
│   └── shell-config.md  # 模式/路由/菜单注册契约（UI 扩展点）
└── tasks.md             # Phase 2 输出（/speckit-tasks，本命令不生成）
```

### Source Code (repository root)

```text
src/
├── main/                          # 主进程（禁止引入 React/前端库）
│   ├── index.ts                   # 修改：无边框窗口、最小窗口尺寸、注册窗口 IPC；删除 ping 测试
│   └── ipc/
│       └── window.ts              # 新增：窗口控制 IPC 处理器（window:*）
├── preload/                       # 预加载（禁止第三方库）
│   ├── index.ts                   # 修改：contextBridge 暴露 windowControls 封装 API
│   └── index.d.ts                 # 修改：Window.api 类型声明（替代 unknown）
└── renderer/src/
    ├── main.tsx                   # 不变（挂载 App）
    ├── App.tsx                    # 重写：仅负责挂 RouterProvider（删除脚手架演示页）
    ├── assets/
    │   └── main.css               # 调整：保留 shadcn 令牌体系，调校为 TRAE 浅色观感
    ├── router/
    │   └── router.tsx             # 新增：由模式注册表生成 createHashRouter 路由表 + 回退
    ├── config/
    │   └── modes.tsx              # 新增：模式注册表（Mode/路由/菜单唯一配置源，FR-023）
    ├── types/
    │   └── shell.ts               # 新增：ModeConfig / MenuGroup / MenuItem / ShellUIState 类型
    ├── store/
    │   └── shellStore.ts          # 新增：Zustand + persist（折叠态、最近模式持久化；搜索开关不持久化）
    ├── components/
    │   ├── ui/                    # shadcn 基础组件（既有 button；新增 avatar/badge/dialog/dropdown-menu/input/tooltip）
    │   └── layout/                # 外壳布局组件（纯布局，零业务逻辑，FR-022）
    │       ├── AppShell.tsx       # 三区布局容器（顶栏 + 侧边栏 + <Outlet/>）
    │       ├── TitleBar.tsx       # 顶部全局栏（折叠钮/搜索/编辑/帮助菜单 + 拖拽区）
    │       ├── WindowControls.tsx # 最小化/最大化还原/关闭
    │       ├── Sidebar.tsx        # 侧边栏容器（展开 260px / 折叠 56px 动画）
    │       ├── ModeSwitcher.tsx   # 分段式三模式切换器（滑动指示器动画）
    │       ├── SidebarNav.tsx     # 模式菜单列表 + 任务列表分组（滚动区）
    │       ├── UserPanel.tsx      # 底部用户信息区（头像/名称/徽章/移动端入口）
    │       └── SearchPalette.tsx  # 全局搜索面板骨架（Dialog + Input，Esc/遮罩关闭）
    └── pages/                     # 模式占位首页（业务页面未来填充处）
        ├── work/WorkHomePage.tsx
        ├── code/CodeHomePage.tsx  # 参考截图：大标题 + 输入框骨架 + 快捷按钮组
        └── design/DesignHomePage.tsx
```

**脚手架清理清单（FR-025，实施第一步执行）**：

```text
删除：src/renderer/src/components/Versions.tsx
删除：src/renderer/src/assets/electron.svg
删除：src/renderer/src/store/counter.ts
删除：src/main/index.ts 中 ipcMain.on('ping') 测试代码
重写：src/renderer/src/App.tsx（演示页 → 路由入口）
```

**Structure Decision**: 遵循宪法"目录结构规范"的渲染进程分层：`components/ui`（shadcn 基础层）与 `components/layout`（外壳布局层）分离，`pages/` 按模式分目录承载占位首页，`config/modes.tsx` 作为模式/路由/菜单唯一配置源被 `router/` 与 `layout/` 消费——新增页面仅需在注册表登记（FR-010）。主进程窗口逻辑拆为 `main/ipc/window.ts`，保持 `main/index.ts` 只做窗口创建与启动编排。

## Complexity Tracking

> 无宪法违规需要论证。新增依赖（react-router、Radix 组件包）的必要性与被否决的替代方案记录于 [research.md](research.md)。
