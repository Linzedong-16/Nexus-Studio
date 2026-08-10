---
description: 'Task list template for feature implementation'
---

# Tasks: 亮暗模式切换与丝滑过渡动画

**Input**: Design documents from `/specs/003-theme-toggle-transition/`

**Prerequisites**: [plan.md](./plan.md)（required）, [spec.md](./spec.md)（required for user stories）, [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: spec.md 未要求 TDD/自动化测试，且项目当前无自动化测试框架（见 plan.md Technical Context / Testing），故本任务列表不包含测试任务；验证方式为 quickstart.md 描述的人工走查 + 静态检查门禁（typecheck/lint/format）。

**Organization**: 任务按 spec.md 中的三个 User Story（US1/US2 均为 P1，US3 为 P2）分组，便于独立实现与验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)
- Include exact file paths in descriptions

## Path Conventions

单一 Electron 桌面应用，本特性全部落在 `src/renderer/src/`（渲染进程）下，无 `backend/`/`frontend/` 分离，不涉及 `src/main/`、`src/preload/`。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 为暗色模式的 CSS 基础设施做准备；本特性无新增 npm 依赖，无需安装/配置步骤

- [ ] T001 在 `src/renderer/src/assets/main.css` 中添加 `@custom-variant dark (&:where(.dark, .dark *));` 声明，将 `dark:` 变体的判定依据从 `prefers-color-scheme` 改为祖先带 `.dark` class（对应 research.md §2）
- [ ] T002 [P] 新建目录 `src/renderer/src/lib/theme/`，为 Phase 2/5 的 `applyThemeClass.ts`、`viewTransition.ts` 预留位置

**Checkpoint**: `dark:` 变体的判定机制已切换为 class 策略，可以开始编写实际的令牌覆盖与状态管理

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 建立"主题状态 → DOM class → CSS 令牌重新取值"的最小闭环，是 US1（可见的整体切换）与 US2（暗色下的正确取值）共同依赖的基础，必须先完成

**⚠️ CRITICAL**: 本阶段完成前，US1/US2/US3 均无法进行有意义的验证

- [ ] T003 在 `src/renderer/src/assets/main.css` 中新增 `.dark { ... }` 令牌覆盖块，为 `:root` 中定义的全部变量（`--background`、`--foreground`、`--card`、`--popover`、`--primary`、`--secondary`、`--muted`、`--accent`、`--destructive`、`--border`、`--input`、`--ring`、`--chart-1`~`--chart-5`、`--sidebar*` 等）提供暗色 oklch 数值（对应 research.md §2、data-model.md 的 `ThemePreference` 实体）
- [ ] T004 新建 `src/renderer/src/store/themeStore.ts`：Zustand + `persist` 中间件（`name: 'theme-store'`），状态 `mode: 'light' | 'dark'`（默认 `'light'`），动作 `toggle()`，写法对齐 `src/renderer/src/store/shellStore.ts` 的既有 `persist` 用法（对应 data-model.md）
- [ ] T005 新建 `src/renderer/src/lib/theme/applyThemeClass.ts`：导出 `applyThemeClass(mode: 'light' | 'dark'): void`，对 `document.documentElement` 增删 `dark` class；并在应用启动时（如 `App.tsx` 或 `themeStore.ts` 模块顶层，通过 `useThemeStore.subscribe`）订阅 `mode` 变化并同步调用，同时在读取到持久化值后立即同步一次以避免启动时的默认主题闪烁（FOUC，对应 spec.md Edge Cases）

**Checkpoint**: 手动在浏览器 DevTools 中为 `<html>` 添加/移除 `dark` class，应可看到标题栏/侧边栏背景色切换 —— 基础闭环验证通过，用户故事可以开始实现

---

## Phase 3: User Story 1 - 一键切换亮暗主题 (Priority: P1) 🎯 MVP

**Goal**: 用户在顶部栏搜索按钮旁看到切换图标，点击后应用整体切换主题，重启后保持上次选择

**Independent Test**: 点击图标，确认标题栏/侧边栏/正文整体切换主题；再次点击切回；重启应用确认保持上次选择

### Implementation for User Story 1

- [ ] T006 [US1] 新建 `src/renderer/src/components/layout/ThemeToggleButton.tsx`：读取 `useThemeStore` 的 `mode`，渲染 lucide-react 的 `Sun`/`Moon` 图标（随 `mode` 切换，对应 FR-009），点击时调用 `useThemeStore.getState().toggle()`；`aria-label`/`title` 随当前主题给出清晰文案（如"切换到暗色模式"/"切换到浅色模式"，对应 FR-010）；样式复用 `TitleBar.tsx` 中的 `iconBtnClass`/`noDrag` 常量
- [ ] T007 [US1] 修改 `src/renderer/src/components/layout/TitleBar.tsx`：在搜索按钮（`<Search>` 图标按钮）之后、"编辑(E)"下拉菜单之前插入 `<ThemeToggleButton />`（对应 FR-001）
- [ ] T008 [US1] 验证并（如需）修正 `themeStore.ts` 的启动恢复逻辑：确认应用重启后 `mode` 从 `localStorage` 正确恢复，且 `applyThemeClass` 在恢复后立即同步生效，无需用户重新点击（对应 FR-004/SC-004）

**Checkpoint**: User Story 1 现在应可独立运行与验证 —— 点击图标即可看到应用整体切换主题，重启后保持

---

## Phase 4: User Story 2 - 暗色模式下内容清晰可读，无颜色覆盖导致的"消失" (Priority: P1)

**Goal**: 暗色模式下应用内所有已知的文字/图标/徽章均保持清晰可辨，修正所有未随主题联动的硬编码配色

**Independent Test**: 切换到暗色模式后逐一走查结构树各级节点、徽章、浮层组件、SQL 编辑器，确认无一处出现颜色覆盖导致的不可读

### Implementation for User Story 2

- [ ] T009 [P] [US2] 修改 `src/renderer/src/components/schema/ServerNode.tsx`：为服务器图标的 `text-blue-600` 追加暗色安全色阶（如 `dark:text-blue-400`）
- [ ] T010 [P] [US2] 修改 `src/renderer/src/components/schema/DatabaseNode.tsx`：为数据库图标的 `text-blue-500` 追加暗色安全色阶（如 `dark:text-blue-400`）
- [ ] T011 [P] [US2] 修改 `src/renderer/src/components/schema/SchemaNode.tsx`：为 `FolderTree` 图标的 `text-amber-500` 追加暗色安全色阶（如 `dark:text-amber-400`）
- [ ] T012 [P] [US2] 修改 `src/renderer/src/components/schema/ModuleGroup.tsx`：为模块分组图标的 `text-purple-500`/`text-green-500` 追加对应暗色安全色阶
- [ ] T013 [P] [US2] 修改 `src/renderer/src/components/schema/SecurityNode.tsx`：为 `text-rose-500`（Shield）、`text-amber-500`（KeyRound）、`text-blue-500`（User）追加对应暗色安全色阶
- [ ] T014 [US2] 修改 `src/renderer/src/components/schema/TableNode.tsx`：修正高风险的主键列名 `text-amber-700`（追加或替换为 `dark:text-amber-400` 一类双态映射），并为其余图标/徽章（`text-green-500`、`text-sky-500`、`text-orange-500`、`bg-amber-500/15 text-amber-600`、`bg-sky-500/15 text-sky-600`）追加对应暗色安全色阶（对应 research.md §3 标记的最高风险点）
- [ ] T015 [US2] 修改 `src/renderer/src/components/work/SqlEditor.tsx`：读取 `useThemeStore` 的 `mode`，向 Monaco `<Editor>` 组件传入 `theme={mode === 'dark' ? 'vs-dark' : 'vs'}`（对应 FR-002、research.md §4）
- [ ] T016 [US2] 走查 `src/renderer/src/components/ui/`（`button.tsx`、`badge.tsx`、`dialog.tsx`、`dropdown-menu.tsx`、`input.tsx`）及设置面板/连接表单等浮层组件在暗色模式下的实际渲染效果，确认 T003 新增的 `.dark` 令牌块与既有 `dark:` 预置变体配合表现正常；发现任何遗留的硬编码浅色配色一并在此任务中修正（对应 FR-003 的"catch-all"验收场景）

**Checkpoint**: User Story 1 与 2 现在应共同工作 —— 暗色模式下全应用清晰可读，无颜色覆盖问题

---

## Phase 5: User Story 3 - 从按钮位置向外扩散的丝滑切换动画 (Priority: P2)

**Goal**: 点击切换图标时播放以图标位置为圆心、向外扩散覆盖全窗口的过渡动画，且流畅、可降级、可防抖

**Independent Test**: 点击图标观察扩散动画；动画播放期间连续快速点击验证无撕裂/卡死；开启"减弱动态效果"验证直接切换无动画；窗口最大化/还原后验证扩散范围正确适配

### Implementation for User Story 3

- [ ] T017 [US3] 新建 `src/renderer/src/lib/theme/viewTransition.ts`：导出 `runThemeTransition(originX: number, originY: number, applyMode: () => void): void`；内部先判断 `window.matchMedia('(prefers-reduced-motion: reduce)').matches`，为真时直接调用 `applyMode()` 并返回（对应 FR-007）；否则调用 `document.startViewTransition(applyMode)`，在其 `.ready` resolve 后计算 `(originX, originY)` 到视口四角的最大欧氏距离作为 `endRadius`，用 Web Animations API 对根元素的 view-transition 伪元素播放 `clip-path` 从 `circle(0px at {originX}px {originY}px)` 到 `circle({endRadius}px at {originX}px {originY}px)` 的动画（对应 FR-005、research.md §5）
- [ ] T018 [US3] 在 `viewTransition.ts` 中新增"动画进行中"守卫：维护一个模块级标志，`startViewTransition` 返回的 `transition.finished` 未 resolve 期间，`runThemeTransition` 的后续调用直接忽略（对应 FR-008）
- [ ] T019 [US3] 修改 `src/renderer/src/components/layout/ThemeToggleButton.tsx`：点击回调改为通过 `event.currentTarget.getBoundingClientRect()` 计算按钮中心坐标，调用 `runThemeTransition(x, y, () => useThemeStore.getState().toggle())` 而非直接调用 `toggle()`
- [ ] T020 [US3] 在 `src/renderer/src/assets/main.css` 中为 `::view-transition-old(root)`/`::view-transition-new(root)` 添加样式重置（如 `animation: none`），避免浏览器默认的交叉淡入淡出与自定义 `clip-path` 扩散动画叠加冲突（对应 FR-006）

**Checkpoint**: 所有用户故事现在应可独立运行 —— 主题切换附带流畅的扩散动画，且能正确降级与防抖

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 收尾验证，确保三个用户故事组合后仍满足宪法门禁与 spec.md 的全部成功标准

- [ ] T021 [P] 运行 `pnpm run typecheck`、`pnpm run lint`、`pnpm run format`，修复全部报错（宪法质量门禁）
- [ ] T022 按 [quickstart.md](./quickstart.md) 的全部步骤逐条人工验证，含 SC-002 要求的暗色模式下 20+ 处文字/图标抽查、键盘聚焦激活与屏幕阅读器文本说明验证
- [ ] T023 [P] 检查 `src/renderer/src/components/layout/WindowControls.tsx` 的 `hover:bg-red-600 hover:text-white`（关闭按钮）在暗色模式下的实际视觉效果，确认无需调整（research.md §3 标记的低风险项收尾确认）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无前置依赖，可立即开始
- **Foundational (Phase 2)**: 依赖 Setup 完成 —— **阻塞**全部用户故事
- **User Story 1 (Phase 3)**: 依赖 Foundational 完成；与 US2/US3 无相互依赖
- **User Story 2 (Phase 4)**: 依赖 Foundational 完成；与 US1 无相互依赖（可并行开发），但建议在 US1 之后验证，因为需要先能切换主题才能观察暗色效果
- **User Story 3 (Phase 5)**: 依赖 Foundational 完成，且其 T019 需要 `ThemeToggleButton.tsx`（US1 的 T006）已存在 —— 因此 US3 在实现顺序上依赖 US1，但功能验证仍是独立的（不依赖 US2 是否完成）
- **Polish (Phase 6)**: 依赖所有已实现的用户故事完成

### Within Each User Story

- US1：T006（组件）→ T007（接入 TitleBar）→ T008（验证持久化）
- US2：T009-T013 可并行（不同文件），T014（`TableNode.tsx`）独立，T015（Monaco）独立，T016（收尾走查）在其余任务完成后进行
- US3：T017（核心动画函数）→ T018（防抖守卫，同文件顺序执行）→ T019（接入按钮，依赖 T006 与 T017/T018）→ T020（CSS 重置，可与 T017-T019 并行）

### Parallel Opportunities

- Setup 阶段 T002 可与 T001 并行
- Foundational 阶段 T003（CSS）与 T004（store）可并行；T005 依赖 T004 已定义的 store
- US2 的 T009-T013（5 个不同的 schema 组件文件）可全部并行
- US3 的 T020（CSS 重置）可与 T017-T019 并行
- Polish 阶段 T021 与 T023 可并行，T022 需在其余任务完成后进行

---

## Parallel Example: User Story 2

```bash
# T009-T013 分别修改不同文件，可并行执行：
Task: "修改 ServerNode.tsx 追加 dark:text-blue-400"
Task: "修改 DatabaseNode.tsx 追加 dark:text-blue-400"
Task: "修改 SchemaNode.tsx 追加 dark:text-amber-400"
Task: "修改 ModuleGroup.tsx 追加对应 dark: 变体"
Task: "修改 SecurityNode.tsx 追加对应 dark: 变体"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（关键阻塞项）
3. 完成 Phase 3: User Story 1
4. **停下验证**：点击图标看到整体切换、重启后保持 —— 此时已是一个可用的最小主题切换功能（暗色具体配色可能尚不完善，但不会崩溃或不可读到无法使用的程度，因为 Foundational 阶段已提供全套 `.dark` 令牌）
5. 视情况继续 US2（可读性精修）与 US3（动画体验）

### Incremental Delivery

1. Setup + Foundational → 基础闭环就位
2. + User Story 1 → 独立验证 → 可视为 MVP
3. + User Story 2 → 独立验证暗色可读性 → 无遗留颜色覆盖问题
4. + User Story 3 → 独立验证扩散动画 → 完整体验交付
5. 各阶段互不破坏前一阶段已交付的能力

---

## Notes

- [P] 任务 = 不同文件、无相互依赖
- [Story] 标签用于追溯任务对应的用户故事
- 本特性不涉及数据库/IPC，故未生成 `tests/contract/`、`tests/integration/` 相关任务
- 每个用户故事完成后建议提交一次（commit），便于按 story 粒度回溯
- 结束时运行 T021（静态检查）与 T022（quickstart 走查）作为最终验收
