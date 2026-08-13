/**
 * Work 工作区领域类型
 *
 * 定义 Work 模式下标签页工作区的状态契约。
 */
import type { ConnectionConfig, QueryResult } from './ipc'
import type { AutomationTabState } from './task'

/** 标签页类型 */
export type WorkspaceTabType =
  'connection' | 'query' | 'table' | 'er-analysis' | 'file' | 'automation'

/** 查询标签页载荷 */
export interface QueryTabState {
  connectionId: string
  connectionName: string
  /** 该查询标签页作用的数据库（服务器级连接下必填） */
  database: string
  /** 打开时的来源 Schema（如从 Schema 级 Query 入口打开），仅用于展示/默认 SQL 拼装 */
  schema?: string
  sql: string
  defaultSql: string
}

/** 表数据浏览标签页载荷 */
export interface TableTabState {
  connectionId: string
  connectionName: string
  database: string
  schema: string
  table: string
  /** 附加 WHERE 条件（不含 WHERE 关键字），用于按条件过滤同一张表/视图，如角色权限查询 */
  filter?: string
  /**
   * 面包屑展示文案覆盖（如 "Security · Users · postgres"）。
   * 省略时回退为 `schema.table`；用于并非直接从"数据库 → Schema → 表"路径打开的标签页
   * （如从 Security 树节点打开的系统目录查询），避免面包屑与用户实际点击路径不一致。
   */
  breadcrumb?: string
  /** 每页记录数，默认 100 */
  pageSize: number
  /** 当前页码（1 起） */
  page: number
  /** 总记录数（用于计算总页数；查询失败时省略） */
  total?: number
  totalPages?: number
}

/** 连接标签页载荷（未保存前不落库） */
export interface ConnectionTabState {
  draft?: ConnectionConfig
  savedId?: string
}

/** ER 分析标签页载荷 */
export interface ErAnalysisTabState {
  connectionId: string
  connectionName: string
  database: string
}

/** 打开 ER 分析标签页的参数 */
export interface OpenErAnalysisTabPayload {
  connectionId: string
  connectionName: string
  database: string
}

/** 文件标签页载荷 */
export interface FileTabState {
  /** 文件绝对路径 */
  filePath: string
  /** 文件名（用于标题） */
  fileName: string
  /** 文件内容 */
  content: string
  /** 是否为二进制文件（为 true 时不渲染编辑器，展示不支持预览提示） */
  isBinary?: boolean
  /** 是否为图片文件 */
  isImage?: boolean
  /** 图片的 base64 data URL（isImage 为 true 时有效） */
  imageSrc?: string
}

/** 打开文件标签页的参数 */
export interface OpenFileTabPayload {
  filePath: string
  fileName: string
  content: string
  isImage?: boolean
  imageSrc?: string
}

/** 工作区标签页 */
export interface WorkspaceTab {
  id: string
  type: WorkspaceTabType
  title: string
  closable: boolean
  /** 是否固定（固定标签页在"关闭所有"时保留） */
  pinned: boolean
  /** 连接/查询/表/ER 分析/文件/自动化标签页各自的载荷 */
  state?:
    | ConnectionTabState
    | QueryTabState
    | TableTabState
    | ErAnalysisTabState
    | FileTabState
    | AutomationTabState
  /** 查询标签页的瞬时结果（不持久化） */
  result?: QueryResult | null
  error?: string
  loading?: boolean
}

/** 打开查询标签页的参数 */
export interface OpenQueryTabPayload {
  connectionId: string
  connectionName: string
  database: string
  schema?: string
  defaultSql: string
}

/** 打开表数据浏览标签页的参数 */
export interface OpenTableTabPayload {
  connectionId: string
  connectionName: string
  database: string
  schema: string
  table: string
  /** 附加 WHERE 条件（不含 WHERE 关键字） */
  filter?: string
  /** 面包屑展示文案覆盖，语义同 {@link TableTabState.breadcrumb} */
  breadcrumb?: string
}

/** 工作区状态 */
export interface WorkspaceState {
  tabs: WorkspaceTab[]
  activeTabId: string | null

  /** 新增一个连接标签页并激活 */
  addConnectionTab: () => void
  /** 打开一个查询标签页（同连接 + 同数据库去重） */
  openQueryTab: (payload: OpenQueryTabPayload) => string
  /** 打开一个表数据浏览标签页（同表去重） */
  openTableTab: (payload: OpenTableTabPayload) => string
  /** 打开一个 ER 分析标签页（同连接 + 同数据库去重） */
  openErAnalysisTab: (payload: OpenErAnalysisTabPayload) => string
  /** 打开一个文件标签页（同文件路径去重） */
  openFileTab: (payload: OpenFileTabPayload) => string
  /** 更新表标签页的分页状态 */
  updateTableTab: (
    id: string,
    patch: Partial<Pick<TableTabState, 'page' | 'pageSize' | 'total' | 'totalPages'>>
  ) => void
  /** 更新查询标签页的 SQL */
  updateQueryTab: (id: string, patch: Partial<Pick<QueryTabState, 'sql'>>) => void
  /** 设置查询标签页加载态 */
  setQueryLoading: (id: string, loading: boolean) => void
  /** 设置查询标签页结果或错误 */
  setQueryResult: (id: string, result: QueryResult | null, error?: string) => void
  /** 更新标签页标题 */
  updateTabTitle: (id: string, title: string) => void
  /** 关闭指定标签页 */
  closeTab: (id: string) => void
  /** 激活指定标签页 */
  activateTab: (id: string) => void
  /** 拖拽重新排序 */
  reorderTabs: (fromIndex: number, toIndex: number) => void
  /** 关闭其他标签页 */
  closeOtherTabs: (id: string) => void
  /** 关闭所有可关闭标签页 */
  closeAllTabs: () => void
  /** 切换标签页固定状态 */
  togglePin: (id: string) => void
  /** 恢复文件标签页内容（启动时调用） */
  hydrateFileTabs: () => Promise<void>
  /** 关闭所有属于指定路径（文件本身，或目录及其下全部内容）的文件标签页 */
  closeFileTabsUnderPath: (rootPath: string) => void
  /** 将匹配旧路径（文件本身，或目录及其下全部内容）的文件标签页更新为新路径 */
  renameFileTab: (oldPath: string, newPath: string) => void
  /** 打开自动化工作台标签页（同类型去重） */
  openAutomationTab: () => string
}
