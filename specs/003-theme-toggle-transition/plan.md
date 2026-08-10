# Implementation Plan: 亮暗模式切换与丝滑过渡动画

**Branch**: `003-theme-toggle-transition` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-theme-toggle-transition/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

在顶部栏搜索按钮之后新增一个亮暗模式切换图标；点击后通过 Zustand `persist` 状态驱动 `<html>` 根元素上的 `dark` class 切换，使 `main.css` 中已语义化的全部 Tailwind 令牌（`bg-background`/`text-foreground`/`border-border` 等）自动重新取值，同时为结构树等处遗留的字面调色板颜色（如 `TableNode.tsx` 的 `text-amber-700`）补充暗色安全的 `dark:` 覆盖，并将 Monaco 编辑器的 `theme` prop 与全局主题联动（`vs`/`vs-dark`）；切换瞬间使用浏览器原生 View Transitions API（`document.startViewTransition`）在合成器线程上播放一个以点击位置为圆心、`clip-path: circle()` 扩散至覆盖全窗口的动画，并遵循 `prefers-reduced-motion` 与防抖连续点击的约束。整个改动是纯渲染进程内的 UI/样式工作，不涉及主进程或新增 IPC 通道。

## Technical Context

**Language/Version**: TypeScript 5.9+（strict 模式），React 19，Electron 39+

**Primary Dependencies**: Zustand 5（`persist` 中间件，复用 `shellStore.ts` 已有模式）、Tailwind CSS 4（CSS-first 配置，`@custom-variant dark`）、`@monaco-editor/react`（联动内置 `vs`/`vs-dark` 主题）、浏览器原生 View Transitions API（`document.startViewTransition`，无新增 npm 依赖）

**Storage**: 渲染进程 `localStorage`（经 Zustand `persist`），与既有 `sidebarCollapsed`/`lastMode` 偏好同一存储方式；不涉及数据库或主进程 `electron-store`

**Testing**: 项目当前无自动化测试框架（`package.json` 未配置 vitest/jest/playwright）；遵循宪法规定的手动验证流程——`pnpm run typecheck`/`lint`/`format` 静态检查门禁 + `pnpm run dev` 启动后人工走查（详见 quickstart.md）

**Target Platform**: Electron 桌面应用渲染进程（Windows，内置 Chromium，完整支持 View Transitions API）

**Project Type**: desktop-app（Electron 单窗口应用，本特性仅涉及 renderer 端）

**Performance Goals**: 主题切换动画在标准桌面硬件上保持视觉连续、无可感知掉帧（SC-003）；全部界面区域完成主题切换在 1 秒内（SC-001）

**Constraints**: 动画必须由合成器线程驱动（`clip-path`/Web Animations API），不得触发同步布局抖动；`prefers-reduced-motion` 开启时必须跳过动画直接切换（FR-007）；连续快速点击不得导致动画堆积或状态错乱（FR-008）

**Scale/Scope**: 单一渲染进程内的样式与状态改动；影响面覆盖 `main.css` 令牌定义、新建 1 个 Zustand store、新建 1-2 个组件/工具模块、修改 `TitleBar.tsx` 与 `SqlEditor.tsx`，以及对 `components/schema/` 下约 6 个文件的字面颜色做 `dark:` 补充

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则 | 评估 | 结论 |
| --- | --- | --- |
| I. 进程隔离与安全 | 本特性完全在渲染进程内实现，不新增主进程逻辑、不新增 IPC、不涉及凭证或 SQL | PASS |
| II. TypeScript 全栈类型安全 | 新建 `themeStore`/动画工具模块均使用严格类型（`mode: 'light' \| 'dark'`），零 `any` | PASS |
| III. 组件化与关注点分离 | 新增切换按钮作为 `layout/` 下的独立展示组件（类比 `WindowControls.tsx`），仅调用 Zustand store 动作，不直接触达 `window.api`；过渡动画逻辑封装进独立工具模块，不下沉进 `TitleBar.tsx` | PASS |
| IV. 数据库适配器模式 | 不涉及数据库访问 | N/A |
| V. IPC 通信契约 | 主题偏好是纯渲染进程状态，不新增 `模块:操作` 通道 | N/A（宪法示例中提到的"主题切换"IPC 场景本特性不适用，因为决定改为 localStorage 持久化而非主进程存储，详见 research.md §1） |
| VI. 分阶段交付 | 属于既有应用外壳（001）之上的独立增量特性，不破坏此前阶段的交付物 | PASS |
| VII. 中文文档与注释规范 | 实现阶段新增代码将遵循中文注释/JSDoc 规范 | PASS（任务阶段落实） |
| VIII. 依赖最小化 | 明确排除 `next-themes`、`html2canvas` 等候选新依赖，全部依赖复用既有库或浏览器原生 API | PASS |

无宪法冲突，Complexity Tracking 无需填写。

## Project Structure

### Documentation (this feature)

```text
specs/003-theme-toggle-transition/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

`contracts/` 本次不生成：见下方 Structure Decision 说明。

### Source Code (repository root)

```text
src/renderer/src/
├── assets/
│   └── main.css                          # 新增 @custom-variant dark 与 .dark 令牌覆盖块
├── store/
│   └── themeStore.ts                     # 新建：Zustand + persist，mode: 'light' | 'dark'
├── lib/
│   └── theme/
│       ├── viewTransition.ts             # 新建：View Transitions 扩散动画封装
│       └── applyThemeClass.ts            # 新建：根据 mode 增删 <html> 的 dark class
├── components/
│   ├── layout/
│   │   ├── TitleBar.tsx                  # 修改：搜索按钮后插入切换按钮
│   │   └── ThemeToggleButton.tsx         # 新建：图标按钮 + 点击坐标采集 + 触发动画
│   ├── schema/
│   │   ├── ServerNode.tsx                # 修改：补充 dark: 安全色阶
│   │   ├── DatabaseNode.tsx              # 修改：同上
│   │   ├── SchemaNode.tsx                # 修改：同上
│   │   ├── ModuleGroup.tsx               # 修改：同上
│   │   ├── SecurityNode.tsx              # 修改：同上
│   │   └── TableNode.tsx                 # 修改：修正 text-amber-700 等高风险色阶
│   └── work/
│       └── SqlEditor.tsx                 # 修改：绑定 Monaco theme prop 到全局主题
```

**Structure Decision**: 单一 Electron 桌面应用（无独立前后端分离），本特性完全落在既有的
`src/renderer/src/` 渲染进程目录内，不新增顶层目录，不涉及 `src/main/`、`src/preload/`。
新建文件遵循既有分层约定：全局状态放 `store/`，无 UI 的纯逻辑工具放 `lib/`，UI 组件放
`components/layout/`；`components/schema/` 与 `components/work/SqlEditor.tsx` 为存量文件的
针对性修改，不新建目录。本特性不新增任何 IPC 通道或对外接口，属于纯内部渲染实现，故 Phase 1
不生成 `/contracts/` 目录（对应 `/speckit-plan` 流程中 "Skip if project is purely internal"
的例外条款）。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

无——Constitution Check 全部通过，本节不适用。
