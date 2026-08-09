/**
 * Work 工作区领域类型
 *
 * 定义 Work 模式下标签页工作区的状态契约。
 */
import type { ConnectionConfig, QueryResult } from './ipc'

/** 标签页类型 */
export type WorkspaceTabType = 'welcome' | 'connection' | 'query' | 'table'

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

/** 工作区标签页 */
export interface WorkspaceTab {
  id: string
  type: WorkspaceTabType
  title: string
  closable: boolean
  /** 连接/查询/表标签页各自的载荷 */
  state?: ConnectionTabState | QueryTabState | TableTabState
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
}
