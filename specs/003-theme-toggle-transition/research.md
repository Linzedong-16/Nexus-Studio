# Research: 亮暗模式切换与丝滑过渡动画

**Feature**: `003-theme-toggle-transition` | **Date**: 2026-08-10

本阶段针对 Technical Context 中未确定的技术选型逐项调研，全部结论均已落地为下方"Decision"，不再遗留 `NEEDS CLARIFICATION`。

## 1. 主题状态的存储与持久化方式

**Decision**: 新建渲染进程专用的 `useThemeStore`（Zustand + `persist` 中间件，`name: 'theme-store'`，落盘到 `localStorage`），字段仅 `mode: 'light' | 'dark'`，整体持久化（无需 `partialize` 裁剪）。

**Rationale**:
- 项目已有完全相同性质的先例：`shellStore.ts` 的 `sidebarCollapsed`/`lastMode` 就是"纯渲染进程 UI 偏好"，同样用 `persist` 落到 `localStorage`，不经过主进程 `electron-store`/IPC。主题偏好与这两项属于同一类状态（本机、本用户、界面级、与业务数据无关），复用同一模式最省心且符合宪法 VIII"依赖最小化"与既有约定保持一致。
- 若改走主进程 `electron-store` + 新增 IPC 通道，会引入渲染进程 ↔ 主进程往返（首帧要等 `invoke` 返回才能确定主题，容易出现 FOUC 闪烁），且违反"新功能不应无必要地扩大主进程/IPC 面"的最小改动原则。

**Alternatives considered**:
- 主进程 `electron-store` + `theme:get`/`theme:set` IPC 通道：功能上可行，但对一个纯 UI 偏好而言过度设计，且会引入启动期异步等待，增加 FOUC 风险。
- 引入 `next-themes` 库：该库面向 Next.js SSR 场景（服务端渲染时预置 class 避免闪烁），本项目是纯客户端渲染的 Electron 渲染进程，不存在 SSR 闪烁问题，引入它只是多一个依赖，且与宪法"状态管理统一用 Zustand"及"依赖最小化"冲突，故不采用。

## 2. 暗色模式的 CSS 令牌与切换机制

**Decision**: 沿用 Tailwind CSS 4 的 CSS-first 配置方式，在 `main.css` 中：
1. 新增 `@custom-variant dark (&:where(.dark, .dark *));`，将 `dark:` 变体的判定依据从默认的 `prefers-color-scheme` 媒体查询改为"祖先带 `.dark` class"，使暗色模式由应用内的手动开关驱动，而非跟随系统设置。
2. 新增一个与现有 `:root` 结构一一对应的 `.dark { ... }` 覆盖块，为 `--background`、`--foreground`、`--card`、`--popover`、`--primary`、`--secondary`、`--muted`、`--accent`、`--destructive`、`--border`、`--input`、`--ring`、`--chart-1`~`--chart-5`、`--sidebar*` 等全部现有令牌提供暗色数值（沿用 oklch 色彩空间，仅调整明度/对比关系，与浅色令牌保持同一套变量名，`@theme inline` 映射不用变）。
3. 主题切换 = 给根元素（`<html>`）添加/移除 `dark` class，一次 DOM 操作即可让所有已经使用语义 Tailwind 类（`bg-background`、`text-muted-foreground`、`border-border` 等）的组件自动重新取值，无需逐组件改代码。

**Rationale**: 现状审计（见下方"3. 暗色可读性风险点普查"）确认 shadcn 基础组件层（`button.tsx`/`badge.tsx`/`input.tsx`/`dropdown-menu.tsx`/`dialog.tsx` 等）已经在生成时预置了部分 `dark:` 变体，说明项目脚手架本就是按"迟早要接入 class 策略暗色模式"设计的，只是此前 `main.css` 从未定义 `.dark` 覆盖块（`specs/001-app-shell-ui/spec.md` 的假设明确写了"本期仅浅色"）。采用 class 策略而非媒体查询策略，是因为 spec 要求"点击图标手动切换"，媒体查询策略无法脱离系统设置独立切换。

**Alternatives considered**:
- 仅用 `prefers-color-scheme` 媒体查询驱动 `dark:`：无法满足"点击按钮手动切换"的核心交互需求，排除。
- 每个组件内部各自维护 `if (theme === 'dark') ...` 条件类名：与 Tailwind/shadcn 语义化令牌体系背道而驰，维护成本随组件数量线性增长，排除。

## 3. 暗色可读性风险点普查（对应 FR-003 / User Story 2）

对 `src/renderer/src/components/**/*.tsx` 与 `src/renderer/src/**/*.css` 做过一次读取式排查，结论：

- **`main.css` 本身无风险**：所有令牌均已通过 CSS 变量路由，没有裸写的十六进制/rgb 颜色；唯一缺口是尚未定义 `.dark` 覆盖块（本 research 第 2 节已给出方案）。
- **shadcn 基础组件层大部分"免费适配"**：`button.tsx`、`badge.tsx`、`input.tsx`、`dropdown-menu.tsx`、`dialog.tsx` 等已使用语义令牌类（`bg-background`/`text-popover-foreground`/`border-input` 等），一旦 `.dark` 令牌块补齐即可自动获得正确的暗色表现，不需要改动这些文件的 class；其中 `badge.tsx`/`input.tsx`/`dropdown-menu.tsx` 甚至已经预置了针对 `destructive`/`input` 的 `dark:` 微调（如 `dark:bg-destructive/60`），进一步印证脚手架本就预留了暗色扩展点。
- **真正的风险集中在结构树（`components/schema/`）里用 Tailwind 调色板字面色阶标注的图标/徽章**：这些颜色未经语义令牌中转，不会随 `.dark` 令牌块自动变化，需要逐一确认在深色背景下的对比度并补充 `dark:` 覆盖，风险点清单：
  - `ServerNode.tsx`（服务器图标 `text-blue-600`）
  - `DatabaseNode.tsx`（数据库图标 `text-blue-500`）
  - `SchemaNode.tsx`（Schema 图标 `text-amber-500`）
  - `ModuleGroup.tsx`（模块分组图标 `text-purple-500` / `text-green-500`）
  - `SecurityNode.tsx`（Security/角色相关图标 `text-rose-500` / `text-amber-500` / `text-blue-500`）
  - `TableNode.tsx`（表/视图/索引/触发器图标 `text-green-500` / `text-sky-500` / `text-orange-500`；主键列名 `text-amber-700`；PK/UNIQUE 徽章 `bg-amber-500/15 text-amber-600`、`bg-sky-500/15 text-sky-600`）
  - `WindowControls.tsx`（关闭按钮 `hover:bg-red-600 hover:text-white`，低风险但非令牌化）
- **明确的高风险单点**：`TableNode.tsx` 中主键列名使用的 `text-amber-700`——这是为浅色背景调校的偏深色阶，直接搬到深色背景上会显著失去对比度（趋近于"深色文字叠加深色背景"），属于 spec 中"颜色覆盖导致内容消失"的典型场景，必须替换为在深色背景下同样可读的色阶（如改用 `text-amber-600 dark:text-amber-400` 之类的双态映射，或统一改走带 `dark:` 覆盖的令牌类）。
- **中等风险**：其余 Tailwind 500 色阶（blue-500/green-500/sky-500/purple-500/rose-500/orange-500）本身是中等明度的饱和色，在纯黑/深灰背景上通常仍保有可读对比度，但需要在实现阶段逐一用暗色背景实际截图核对（而非假设"500 色阶天然安全"），不达标的按需追加 `dark:text-*-400` 一类更亮的对应色阶。

**Decision**: 实现阶段对上述清单中的每个文件逐一核对深色背景下的实际对比度，凡对比度不足的位置追加 `dark:` 变体（优先在同一色系内选择更亮的色阶，而非改换色系，以保留"图标颜色区分不同对象类型"的既有设计意图）；`TableNode.tsx` 的 `text-amber-700` 必须在本次改造中修正。

## 4. Monaco 编辑器主题联动

**Decision**: `SqlEditor.tsx` 当前未显式传入 `theme` prop（`@monaco-editor/react` 默认回退到内置的 `vs`/浅色主题）。新增逻辑：读取全局主题状态，浅色时传入 `theme="vs"`，暗色时传入 `theme="vs-dark"`（均为 Monaco 内置主题，无需自定义 `monaco.editor.defineTheme` 逐一映射语法高亮色）。

**Rationale**: spec 的 Assumptions 明确"暗色模式的具体配色数值以保证可读性与常规可用性为目标，不要求逐像素还原某个特定设计规范"，Monaco 内置的 `vs-dark` 已经是被广泛验证过的、可读性良好的深色配色方案，满足 FR-002/FR-003 的联动与可读性要求，且零新增依赖。

**Alternatives considered**: 用 `monaco.editor.defineTheme` 自定义一套与应用 oklch 令牌像素级对齐的编辑器主题——收益（视觉一致性再提升一点）远不及成本（需要手工映射数十个语法高亮 token 颜色，且要同时维护浅色/暗色两套），本次不做。

## 5. "按钮位置为圆心向外扩散"过渡动画的技术方案

**Decision**: 使用浏览器原生 View Transitions API（`document.startViewTransition()`），在触发切换的回调中：
1. 记录点击事件的视口坐标 `(x, y)`（即切换图标当时所在位置）。
2. 计算该点到视口四个角的最大欧氏距离，作为扩散终态的圆形半径 `endRadius`。
3. 切换前先 `document.startViewTransition(() => { 在此回调内切换 dark class / Zustand 状态 })`，浏览器会自动为切换前后的两帧画面各拍一张快照。
4. 在 `transition.ready` resolve 之后，用 Web Animations API 对 `::view-transition-new(root)`（或 `::view-transition-old(root)`，取决于哪一态应表现为"从圆心扩散覆盖"的那一层）播放一个 `clip-path` 从 `circle(0px at {x}px {y}px)` 到 `circle({endRadius}px at {x}px {y}px)` 的动画。

**Rationale**:
- Electron 39 内置的 Chromium 版本远高于 View Transitions API 的最低要求（Chromium 111+），且 Electron 应用只面向自带的 Chromium 渲染，不存在"目标浏览器不支持"的兼容性顾虑，属于零新增依赖、原生实现。
- `clip-path` 动画由合成器（compositor）线程驱动，不触发布局/重绘（layout/paint），是"注意渲染性能与优化"这一要求下的标准最佳实践；View Transitions API 天然基于"新旧两帧快照 + 合成层动画"模型，恰好避免了手写 DOM 覆盖层截图/克隆节点等更重的实现方式。
- 该 API 原生处理"新主题的完整渲染结果"作为动画素材，不需要额外用 `html2canvas` 之类的库手动截图新状态，规避了额外依赖与截图性能开销。

**Alternatives considered**:
- 手写一个覆盖全屏的 `<div>`，配合 `clip-path`/`mask-image` 径向渐变从按钮位置扩散，扩散完成后再真正切换主题：需要自行处理"覆盖层要显示新主题完整渲染结果"的问题（往往需要克隆 DOM 或者截图），实现复杂度和维护成本明显更高，故不采用。
- 单纯用 CSS `transition: background-color` 做全局淡入淡出：无法呈现"以按钮为圆心扩散"的效果，不满足 FR-005，排除。

## 6. 无障碍降级（减弱动态效果）与连续点击防抖

**Decision**:
- 每次点击时（而非模块加载时缓存）读取 `window.matchMedia('(prefers-reduced-motion: reduce)').matches`；为真时跳过 `startViewTransition` 的动画部分，直接同步切换 `dark` class，满足 FR-007 / SC-005。
- 用一个模块级/组件级的"动画进行中"标志位守卫点击处理函数：`startViewTransition` 返回的 `transition.finished` Promise 未 resolve 之前，忽略后续点击，满足 FR-008。

**Rationale**: `prefers-reduced-motion` 是无障碍领域的标准信号，浏览器原生 `matchMedia` API 已足够，不需要额外依赖；在点击时实时读取而非启动时缓存，是为了兼容用户在应用运行期间修改系统设置的场景。

**Alternatives considered**: 用 CSS `@media (prefers-reduced-motion: reduce)` 直接禁用某个 CSS transition/animation 声明——对本方案不适用，因为扩散动画是通过 JS 调用 Web Animations API 显式 `animate()` 播放的，需要在 JS 侧判断后决定是否播放，而不是声明式 CSS 规则能覆盖的范围。
