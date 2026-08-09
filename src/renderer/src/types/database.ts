/**
 * 渲染进程本地类型：结构树模块能力与运行态
 *
 * 与跨进程共享类型（types/ipc.ts）区分：这里的类型只在渲染进程内部
 * 用于驱动结构树组件的渲染与按需加载状态机
 */

import type { RoutineInfo, SchemaInfo, TableInfo, ColumnInfo, IndexInfo, TriggerInfo } from './ipc'

// ─── 模块类型 ───

/** 结构树中可出现的模块种类，PostgreSQL 专属模块与通用模块统一枚举 */
export type ModuleKind = 'query' | 'tables' | 'views' | 'functions' | 'procedures'

/** 表级子模块种类：字段 / 索引 / 触发器 */
export type TableModuleKind = 'columns' | 'indexes' | 'triggers'

// ─── 数据库类型能力配置 ───

export interface DatabaseCapability {
  /** 数据库节点下直接展示的模块（如 PostgreSQL 的快捷 Query 入口） */
  databaseLevelModules: ModuleKind[]
  /** Schema 节点下展示的模块，数组顺序即渲染顺序 */
  schemaLevelModules: ModuleKind[]
}

// ─── 结构树运行态 ───

export interface ModuleState {
  expanded: boolean
  loading?: boolean
  error?: string
  items?: TableInfo[] | RoutineInfo[]
}

export interface TableModuleState {
  expanded: boolean
  loading?: boolean
  error?: string
  items?: ColumnInfo[] | IndexInfo[] | TriggerInfo[]
}

export interface TableNodeState {
  expanded: boolean
  modules: Partial<Record<TableModuleKind, TableModuleState>>
}

export interface SchemaNodeState {
  expanded: boolean
  modules: Partial<Record<ModuleKind, ModuleState>>
  /** 表级节点运行态，key 为表名 */
  tableNodes?: Record<string, TableNodeState>
}

export interface DatabaseNodeState {
  expanded: boolean
  schemas?: SchemaInfo[]
  schemasLoading?: boolean
  schemasError?: string
  schemaNodes?: Record<string, SchemaNodeState>
}
