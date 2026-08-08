# Contract: 模式 / 路由 / 菜单注册契约（外壳 UI 扩展点）

**模块**: `renderer/src/config/modes.tsx`（唯一配置源）· 消费方：`router/router.tsx`、`components/layout/{ModeSwitcher,SidebarNav}.tsx`
**目的**: 兑现 FR-010 / FR-023 —— 新增模式或页面**只改注册表**，外壳组件零改动。本契约是后续所有业务页面接入外壳的固定接口，签名不得在后续阶段破坏（宪法 VI"预留接口不空转"）。

## 类型契约（`types/shell.ts`）

```typescript
import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'

export type ModeId = 'work' | 'code' | 'design'

export interface ModeRoute {
  /** 相对 basePath 的子路径；'' 表示模式默认首页（每个模式恰一条） */
  path: string
  title: string
  Component: ComponentType
}

export interface MenuAction {
  icon: LucideIcon
  /** 无障碍名与 tooltip 文案 */
  label: string
}

export interface MenuItem {
  id: string
  label: string
  /** 必填 —— 侧边栏折叠为图标窄栏时仅显示图标（FR-013） */
  icon: LucideIcon
  /** 目标路由绝对路径（如 '/code'）；占位项为 null，点击仅视觉反馈（FR-021） */
  path: string | null
}

export interface MenuGroup {
  id: string
  /** 分组标题（如 '任务列表'）；置顶操作组为 null */
  title: string | null
  /** 分组标题右侧操作图标，可为空数组 */
  headerActions: MenuAction[]
  items: MenuItem[]
}

export interface ModeConfig {
  id: ModeId
  label: string
  /** 切换器标签前置图标；无图标传 null */
  icon: LucideIcon | null
  /** 路由基址，'/xxx' 形式，全局唯一 */
  basePath: string
  routes: ModeRoute[]
  menuGroups: MenuGroup[]
}

/** 模式注册表：顺序即切换器展示顺序；第一项为默认模式 */
export declare const MODES: readonly ModeConfig[]
```

## 路由生成约定（`router.tsx` 必须遵守）

1. 路由表 = 布局路由 `<AppShell/>` 包裹：每个模式生成 `<Route path={basePath}>` 父路由，其 `routes[]` 展开为子路由
2. 根路径 `/` → `<Navigate to={lastMode 默认首页} replace />`（读取 shellStore.persist 的 `lastMode`）
3. 每个模式父路由内：`path: '*'` → `<Navigate to={basePath} replace />`（模式内无效页回退，FR-009）
4. 顶层 `path: '*'` → `<Navigate to="/" replace />`（无效模式回退，经规则 2 到默认模式）
5. dev 环境启动断言：每个模式恰有一条 `path: ''`；`basePath` 无重复——违反则 throw（见 data-model.md §4）

## 渲染约定（外壳组件必须遵守）

- `ModeSwitcher` 仅依据 `MODES` 渲染标签，激活态由当前路由路径前缀（`useLocation` 匹配 `basePath`）推导，**不维护自身选中状态**
- `SidebarNav` 依据当前模式的 `menuGroups` 渲染；`MenuItem.path` 非空时用 `<NavLink>`，为 null 时渲染 `<button>` 占位
- 模式切换动作 = `navigate(targetMode.basePath)`，不直接改 Store；`lastMode` 由路由副作用（AppShell 内 `useEffect` 监听 location）同步写入

## 扩展流程（后续阶段接入业务页面时）

1. 在 `pages/<mode>/` 新建页面组件
2. 在 `MODES` 对应模式的 `routes` 追加 `{ path, title, Component }`，需要入口则在 `menuGroups` 追加 `MenuItem`
3. 完成 —— 禁止修改 `AppShell` / `router.tsx` / 侧边栏组件
