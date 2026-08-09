import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'

/**
 * 外壳领域类型 —— 契约见 specs/001-app-shell-ui/contracts/shell-config.md
 * 与 specs/001-app-shell-ui/data-model.md 保持一致
 */

/** 模式标识；新增模式时扩展此联合类型并在 config/modes.tsx 注册 */
export type ModeId = 'work' | 'code' | 'design'

/** 模式内页面路由 */
export interface ModeRoute {
  /** 相对 basePath 的子路径；'' 表示模式默认首页（每个模式恰一条） */
  path: string
  title: string
  Component: ComponentType
}

/** 菜单分组头部操作（图标按钮占位） */
export interface MenuAction {
  icon: LucideIcon
  /** 无障碍名与 tooltip 文案 */
  label: string
}

/** 侧边栏菜单项 */
export interface MenuItem {
  id: string
  label: string
  /** 必填 —— 侧边栏折叠为图标窄栏时仅显示图标（FR-013） */
  icon: LucideIcon
  /** 目标路由绝对路径（如 '/code'）；占位项为 null */
  path: string | null
  /** 占位项的点击回调；有 path 时通常不配置 */
  onClick?: () => void
}

/** 侧边栏菜单分组（如"任务列表"） */
export interface MenuGroup {
  id: string
  /** 分组标题；置顶操作组为 null */
  title: string | null
  /** 分组标题右侧操作图标，可为空数组 */
  headerActions: MenuAction[]
  items: MenuItem[]
}

/** 模式配置 —— 外壳的唯一配置单元 */
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

/** 外壳全局 UI 状态（data-model.md §2） */
export interface ShellUIState {
  /** 侧边栏折叠态（持久化，FR-011/012） */
  sidebarCollapsed: boolean
  /** 最近使用模式，启动重定向用（持久化，FR-008） */
  lastMode: ModeId
  /** 搜索面板开关（瞬态，FR-017） */
  searchOpen: boolean
  /** 镜像主进程窗口最大化状态（瞬态） */
  windowMaximized: boolean
  toggleSidebar: () => void
  setSearchOpen: (open: boolean) => void
  setLastMode: (mode: ModeId) => void
  setWindowMaximized: (maximized: boolean) => void
}
