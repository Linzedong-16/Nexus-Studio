import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ConnectionConfig,
  ConnectionResult,
  TestResult,
  QueryResult,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  ConnectionStatus,
  ConfigStore
} from '../renderer/src/types/ipc'

// ─── 窗口控制 API ───

export interface WindowControlsApi {
  minimize(): Promise<void>
  toggleMaximize(): Promise<boolean>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  /** 订阅最大化状态变化；返回取消订阅函数 */
  onMaximizedChange(callback: (maximized: boolean) => void): () => void
}

// ─── 数据库 API ───

export interface DatabaseApi {
  testConnection(config: ConnectionConfig): Promise<TestResult>
  connect(config: ConnectionConfig): Promise<ConnectionResult>
  disconnect(connectionId: string): Promise<void>
  query(connectionId: string, sql: string): Promise<QueryResult>
  getSchemas(connectionId: string): Promise<SchemaInfo[]>
  getTables(connectionId: string, schema: string): Promise<TableInfo[]>
  getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]>
  /** 订阅连接状态变化；返回取消订阅函数 */
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void
}

// ─── 配置 API ───

export interface ConfigApi {
  get<T = unknown>(key: string): Promise<T>
  set(key: string, value: unknown): Promise<void>
  getAll(): Promise<ConfigStore>
  delete(key: string): Promise<void>
}

// ─── 全局 API ───

export interface Api {
  windowControls: WindowControlsApi
  db: DatabaseApi
  config: ConfigApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
