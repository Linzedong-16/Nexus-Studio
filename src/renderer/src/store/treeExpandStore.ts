/**
 * 结构树 / 文件树展开态持久化
 *
 * 与 connectionStore（瞬态连接数据）、fileExplorerStore（瞬态文件树数据）分离，
 * 只持久化"展开与否"的布尔标记（及文件树的已展开路径列表），跨页面切换、跨应用重启后
 * 驱动对应 store 恢复展开态，二者互不影响彼此的加载/重连时机。
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModuleKind, TableModuleKind } from '@/types/database'

export interface TableExpandState {
  expanded: boolean
  modules: Partial<Record<TableModuleKind, boolean>>
}

export interface SchemaExpandState {
  expanded: boolean
  modules: Partial<Record<ModuleKind, boolean>>
  tables: Record<string, TableExpandState>
}

export interface DatabaseExpandState {
  expanded: boolean
  schemas: Record<string, SchemaExpandState>
}

export interface SecurityExpandState {
  expanded: boolean
  usersGroupExpanded: boolean
  rolesGroupExpanded: boolean
}

export interface ConnectionExpandState {
  expanded: boolean
  security: SecurityExpandState
  databases: Record<string, DatabaseExpandState>
}

const EMPTY_SECURITY: SecurityExpandState = {
  expanded: false,
  usersGroupExpanded: false,
  rolesGroupExpanded: false
}

interface TreeExpandStoreState {
  /** 连接结构树展开态，key 为连接 ID */
  connections: Record<string, ConnectionExpandState>
  /** 文件树已展开目录路径，key 为项目根路径 */
  filePaths: Record<string, string[]>

  setConnectionExpanded: (id: string, expanded: boolean) => void
  setSecurityExpanded: (id: string, expanded: boolean) => void
  setSecurityGroupExpanded: (id: string, group: 'users' | 'roles', expanded: boolean) => void
  setDatabaseExpanded: (id: string, database: string, expanded: boolean) => void
  setSchemaExpanded: (id: string, database: string, schema: string, expanded: boolean) => void
  setModuleExpanded: (
    id: string,
    database: string,
    schema: string,
    moduleKind: ModuleKind,
    expanded: boolean
  ) => void
  setTableExpanded: (
    id: string,
    database: string,
    schema: string,
    table: string,
    expanded: boolean
  ) => void
  setTableModuleExpanded: (
    id: string,
    database: string,
    schema: string,
    table: string,
    moduleKind: TableModuleKind,
    expanded: boolean
  ) => void

  setFileExpandedPaths: (projectPath: string, paths: string[]) => void
}

export const useTreeExpandStore = create<TreeExpandStoreState>()(
  persist(
    (set, get) => {
      const ensureConn = (id: string): ConnectionExpandState =>
        get().connections[id] ?? { expanded: false, security: EMPTY_SECURITY, databases: {} }

      const ensureDb = (conn: ConnectionExpandState, database: string): DatabaseExpandState =>
        conn.databases[database] ?? { expanded: false, schemas: {} }

      const ensureSchema = (db: DatabaseExpandState, schema: string): SchemaExpandState =>
        db.schemas[schema] ?? { expanded: false, modules: {}, tables: {} }

      const ensureTable = (schemaState: SchemaExpandState, table: string): TableExpandState =>
        schemaState.tables[table] ?? { expanded: false, modules: {} }

      /** 对指定连接做不可变更新；连接不存在时以默认态创建 */
      const updateConn = (
        id: string,
        updater: (conn: ConnectionExpandState) => ConnectionExpandState
      ): void => {
        set((state) => ({
          connections: { ...state.connections, [id]: updater(ensureConn(id)) }
        }))
      }

      const updateDb = (
        id: string,
        database: string,
        updater: (db: DatabaseExpandState) => DatabaseExpandState
      ): void => {
        updateConn(id, (conn) => ({
          ...conn,
          databases: { ...conn.databases, [database]: updater(ensureDb(conn, database)) }
        }))
      }

      const updateSchema = (
        id: string,
        database: string,
        schema: string,
        updater: (s: SchemaExpandState) => SchemaExpandState
      ): void => {
        updateDb(id, database, (db) => ({
          ...db,
          schemas: { ...db.schemas, [schema]: updater(ensureSchema(db, schema)) }
        }))
      }

      const updateTable = (
        id: string,
        database: string,
        schema: string,
        table: string,
        updater: (t: TableExpandState) => TableExpandState
      ): void => {
        updateSchema(id, database, schema, (s) => ({
          ...s,
          tables: { ...s.tables, [table]: updater(ensureTable(s, table)) }
        }))
      }

      return {
        connections: {},
        filePaths: {},

        setConnectionExpanded: (id, expanded) => updateConn(id, (c) => ({ ...c, expanded })),

        setSecurityExpanded: (id, expanded) =>
          updateConn(id, (c) => ({ ...c, security: { ...c.security, expanded } })),

        setSecurityGroupExpanded: (id, group, expanded) =>
          updateConn(id, (c) => ({
            ...c,
            security: {
              ...c.security,
              ...(group === 'users'
                ? { usersGroupExpanded: expanded }
                : { rolesGroupExpanded: expanded })
            }
          })),

        setDatabaseExpanded: (id, database, expanded) =>
          updateDb(id, database, (d) => ({ ...d, expanded })),

        setSchemaExpanded: (id, database, schema, expanded) =>
          updateSchema(id, database, schema, (s) => ({ ...s, expanded })),

        setModuleExpanded: (id, database, schema, moduleKind, expanded) =>
          updateSchema(id, database, schema, (s) => ({
            ...s,
            modules: { ...s.modules, [moduleKind]: expanded }
          })),

        setTableExpanded: (id, database, schema, table, expanded) =>
          updateTable(id, database, schema, table, (t) => ({ ...t, expanded })),

        setTableModuleExpanded: (id, database, schema, table, moduleKind, expanded) =>
          updateTable(id, database, schema, table, (t) => ({
            ...t,
            modules: { ...t.modules, [moduleKind]: expanded }
          })),

        setFileExpandedPaths: (projectPath, paths) =>
          set((state) => ({ filePaths: { ...state.filePaths, [projectPath]: paths } }))
      }
    },
    { name: 'tree-expand-store' }
  )
)
