/**
 * 连接状态管理（瞬态，不持久化）
 *
 * 记录当前会话中已建立的服务器级连接、其下可访问的数据库清单，
 * 以及"服务器 → 数据库 → Schema → 模块"结构树的按需加载状态。
 * 连接配置的本体保存在 configService（electron-store），
 * 本 store 只负责"当前已建立连接"及其运行态数据。
 */
import { create } from 'zustand'
import type { ConnectionConfig, ConnectionResult, DatabaseInfo } from '@/types/ipc'
import type {
  DatabaseNodeState,
  ModuleKind,
  ModuleState,
  SchemaNodeState,
  SecurityNodeState,
  TableModuleKind,
  TableModuleState,
  TableNodeState
} from '@/types/database'
import { queryService } from '@/services/queryService'
import { configService } from '@/services/configService'
import { useTreeExpandStore } from '@/store/treeExpandStore'
import type { ConnectionExpandState } from '@/store/treeExpandStore'

export type ConnectionStatus = 'connecting' | 'connected' | 'error'

export interface ConnectedConnection {
  config: ConnectionConfig
  status: ConnectionStatus
  error?: string
  serverVersion?: string
  /** 服务器节点自身的展开态（结构树最顶层，跨会话持久化于 treeExpandStore） */
  expanded: boolean
  /** 服务器上当前账号有权限访问的全部数据库 */
  databases?: DatabaseInfo[]
  databasesLoading?: boolean
  databasesError?: string
  /** 当前浏览/查询作用的数据库；历史单库连接自动取 config.database（FR-016） */
  activeDatabase?: string
  /** 结构树运行态，key 为数据库名 */
  databaseNodes?: Record<string, DatabaseNodeState>
  /** Security（Users/Roles）节点运行态，集群级对象，与数据库列表平级 */
  security?: SecurityNodeState
}

interface ConnectionStoreState {
  connections: Record<string, ConnectedConnection>
  activeConnectionId: string | null

  activate: (id: string) => void
  /** 展开/收起服务器节点自身；首次展开时按需加载其数据库列表 */
  toggleConnectionNode: (id: string) => void
  setConnecting: (config: ConnectionConfig) => void
  setConnected: (config: ConnectionConfig, result: ConnectionResult) => void
  setError: (id: string, error: string) => void
  /** 断开服务器连接、清空该连接下全部数据库运行态，并删除持久化配置，防止下次启动被自动重连（FR-004） */
  disconnect: (id: string) => Promise<void>

  /** 应用启动时读取全部已保存的连接配置并逐一自动重连（各连接互不阻塞） */
  hydrateSavedConnections: () => Promise<void>

  /** 加载服务器上全部可访问数据库；已有缓存且无错误时默认跳过 */
  loadDatabases: (id: string, options?: { force?: boolean }) => Promise<void>
  /** 切换当前浏览/查询作用的数据库 */
  setActiveDatabase: (id: string, database: string) => void

  /** 展开/收起 Security 节点；首次展开时按需加载全部角色 */
  toggleSecurityNode: (id: string) => void
  loadRoles: (id: string, options?: { force?: boolean }) => Promise<void>
  /** 展开/收起 Security 下的 Users/Roles 子分组（不触发加载，数据已随 loadRoles 一次性获取） */
  toggleSecurityGroup: (id: string, group: 'users' | 'roles') => void

  /** 展开/收起数据库节点；首次展开时按需加载其 Schema 列表 */
  toggleDatabaseNode: (id: string, database: string) => void
  loadSchemas: (id: string, database: string, options?: { force?: boolean }) => Promise<void>

  /** 展开/收起 Schema 节点（不触发数据加载，仅展示模块分组） */
  toggleSchemaNode: (id: string, database: string, schema: string) => void

  /** 展开/收起模块分组；首次展开时按需加载该模块的数据 */
  toggleModule: (id: string, database: string, schema: string, moduleKind: ModuleKind) => void
  loadModuleItems: (
    id: string,
    database: string,
    schema: string,
    moduleKind: ModuleKind,
    options?: { force?: boolean }
  ) => Promise<void>

  /** 展开/收起表节点 */
  toggleTableNode: (id: string, database: string, schema: string, table: string) => void
  /** 展开/收起表级子模块（columns/indexes/triggers）；首次展开时按需加载 */
  toggleTableModule: (
    id: string,
    database: string,
    schema: string,
    table: string,
    moduleKind: TableModuleKind
  ) => void
  loadTableModuleItems: (
    id: string,
    database: string,
    schema: string,
    table: string,
    moduleKind: TableModuleKind,
    options?: { force?: boolean }
  ) => Promise<void>
}

export const useConnectionStore = create<ConnectionStoreState>()((set, get) => {
  /** 读取指定连接在 treeExpandStore 中持久化的展开态快照，供各层级节点首次创建时取默认值 */
  const persistedConn = (id: string): ConnectionExpandState | undefined =>
    useTreeExpandStore.getState().connections[id]

  /** 对指定连接做不可变更新；连接不存在时忽略 */
  const updateConn = (
    id: string,
    updater: (conn: ConnectedConnection) => ConnectedConnection
  ): void => {
    set((state) => {
      const conn = state.connections[id]
      if (!conn) return state
      return { connections: { ...state.connections, [id]: updater(conn) } }
    })
  }

  /** 对指定数据库节点做不可变更新；节点不存在时以持久化展开态为默认创建 */
  const updateDatabaseNode = (
    id: string,
    database: string,
    updater: (node: DatabaseNodeState) => DatabaseNodeState
  ): void => {
    updateConn(id, (conn) => {
      const nodes = conn.databaseNodes ?? {}
      const current = nodes[database] ?? {
        expanded: persistedConn(id)?.databases[database]?.expanded ?? false
      }
      return { ...conn, databaseNodes: { ...nodes, [database]: updater(current) } }
    })
  }

  /** 对 Security 节点做不可变更新；节点不存在时以持久化展开态为默认创建 */
  const updateSecurityNode = (
    id: string,
    updater: (node: SecurityNodeState) => SecurityNodeState
  ): void => {
    updateConn(id, (conn) => {
      const persistedSecurity = persistedConn(id)?.security
      const current = conn.security ?? {
        expanded: persistedSecurity?.expanded ?? false,
        usersGroupExpanded: persistedSecurity?.usersGroupExpanded ?? false,
        rolesGroupExpanded: persistedSecurity?.rolesGroupExpanded ?? false
      }
      return { ...conn, security: updater(current) }
    })
  }

  /** 对指定 Schema 节点做不可变更新；节点不存在时以持久化展开态为默认创建 */
  const updateSchemaNode = (
    id: string,
    database: string,
    schema: string,
    updater: (node: SchemaNodeState) => SchemaNodeState
  ): void => {
    updateDatabaseNode(id, database, (dbNode) => {
      const schemaNodes = dbNode.schemaNodes ?? {}
      const current = schemaNodes[schema] ?? {
        expanded: persistedConn(id)?.databases[database]?.schemas[schema]?.expanded ?? false,
        modules: {}
      }
      return { ...dbNode, schemaNodes: { ...schemaNodes, [schema]: updater(current) } }
    })
  }

  /** 对指定模块分组做不可变更新；节点不存在时以持久化展开态为默认创建 */
  const updateModule = (
    id: string,
    database: string,
    schema: string,
    moduleKind: ModuleKind,
    updater: (mod: ModuleState) => ModuleState
  ): void => {
    updateSchemaNode(id, database, schema, (schemaNode) => {
      const modules = schemaNode.modules ?? {}
      const current = modules[moduleKind] ?? {
        expanded:
          persistedConn(id)?.databases[database]?.schemas[schema]?.modules[moduleKind] ?? false
      }
      return { ...schemaNode, modules: { ...modules, [moduleKind]: updater(current) } }
    })
  }

  /** 对指定表节点做不可变更新；节点不存在时以持久化展开态为默认创建 */
  const updateTableNode = (
    id: string,
    database: string,
    schema: string,
    table: string,
    updater: (node: TableNodeState) => TableNodeState
  ): void => {
    updateSchemaNode(id, database, schema, (schemaNode) => {
      const tableNodes = schemaNode.tableNodes ?? {}
      const current = tableNodes[table] ?? {
        expanded:
          persistedConn(id)?.databases[database]?.schemas[schema]?.tables[table]?.expanded ?? false,
        modules: {}
      }
      return { ...schemaNode, tableNodes: { ...tableNodes, [table]: updater(current) } }
    })
  }

  /** 对指定表级子模块做不可变更新；节点不存在时以持久化展开态为默认创建 */
  const updateTableModule = (
    id: string,
    database: string,
    schema: string,
    table: string,
    moduleKind: TableModuleKind,
    updater: (mod: TableModuleState) => TableModuleState
  ): void => {
    updateTableNode(id, database, schema, table, (tableNode) => {
      const modules = tableNode.modules ?? {}
      const current = modules[moduleKind] ?? {
        expanded:
          persistedConn(id)?.databases[database]?.schemas[schema]?.tables[table]?.modules[
            moduleKind
          ] ?? false
      }
      return { ...tableNode, modules: { ...modules, [moduleKind]: updater(current) } }
    })
  }

  /** FR-016：将 database 标记为默认展开的数据库节点并加载其 Schema（历史单库连接升级用） */
  const expandDefaultDatabase = (id: string, database: string): void => {
    updateDatabaseNode(id, database, (node) => ({ ...node, expanded: true }))
    void get().loadSchemas(id, database)
  }

  /**
   * 重连后按 treeExpandStore 中持久化的展开态逐层恢复结构树（连接/Security/数据库/Schema/模块/表/表级子模块），
   * 恢复展开的同时按需触发对应层级的数据加载，使恢复后的树与用户手动展开时的结果一致
   */
  const restoreExpansion = async (id: string): Promise<void> => {
    const persisted = useTreeExpandStore.getState().connections[id]
    if (!persisted) return

    if (persisted.expanded) {
      updateConn(id, (c) => ({ ...c, expanded: true }))
    }

    if (persisted.security.expanded) {
      updateSecurityNode(id, (n) => ({
        ...n,
        expanded: true,
        usersGroupExpanded: persisted.security.usersGroupExpanded,
        rolesGroupExpanded: persisted.security.rolesGroupExpanded
      }))
      await get().loadRoles(id)
    }

    await Promise.all(
      Object.entries(persisted.databases).map(async ([database, dbState]) => {
        if (!dbState.expanded) return
        updateDatabaseNode(id, database, (n) => ({ ...n, expanded: true }))
        await get().loadSchemas(id, database)

        await Promise.all(
          Object.entries(dbState.schemas).map(async ([schema, schemaState]) => {
            if (schemaState.expanded) {
              updateSchemaNode(id, database, schema, (n) => ({ ...n, expanded: true }))
            }

            const moduleEntries = Object.entries(schemaState.modules) as [ModuleKind, boolean][]
            await Promise.all(
              moduleEntries
                .filter(([, expanded]) => expanded)
                .map(async ([moduleKind]) => {
                  updateModule(id, database, schema, moduleKind, (m) => ({ ...m, expanded: true }))
                  await get().loadModuleItems(id, database, schema, moduleKind)
                })
            )

            await Promise.all(
              Object.entries(schemaState.tables).map(async ([table, tableState]) => {
                if (!tableState.expanded) return
                updateTableNode(id, database, schema, table, (n) => ({ ...n, expanded: true }))

                const tableModuleEntries = Object.entries(tableState.modules) as [
                  TableModuleKind,
                  boolean
                ][]
                await Promise.all(
                  tableModuleEntries
                    .filter(([, expanded]) => expanded)
                    .map(async ([moduleKind]) => {
                      updateTableModule(id, database, schema, table, moduleKind, (m) => ({
                        ...m,
                        expanded: true
                      }))
                      await get().loadTableModuleItems(id, database, schema, table, moduleKind)
                    })
                )
              })
            )
          })
        )
      })
    )
  }

  return {
    connections: {},
    activeConnectionId: null,

    activate: (id) => {
      set({ activeConnectionId: id })
      // FR-016：历史单库连接自动升级为服务器级连接的默认浏览数据库，无需用户手动操作
      const conn = get().connections[id]
      if (conn && !conn.activeDatabase && conn.config.database) {
        const database = conn.config.database
        updateConn(id, (c) => ({ ...c, activeDatabase: database }))
        expandDefaultDatabase(id, database)
      }
    },

    toggleConnectionNode: (id) => {
      get().activate(id)
      const conn = get().connections[id]
      const nextExpanded = !(conn?.expanded ?? false)
      updateConn(id, (c) => ({ ...c, expanded: nextExpanded }))
      useTreeExpandStore.getState().setConnectionExpanded(id, nextExpanded)
      if (nextExpanded && !conn?.databases) {
        void get().loadDatabases(id)
      }
    },

    setConnecting: (config) =>
      set((state) => ({
        connections: {
          ...state.connections,
          [config.id]: {
            config,
            status: 'connecting',
            expanded: persistedConn(config.id)?.expanded ?? false
          }
        },
        activeConnectionId: config.id
      })),

    setConnected: (config, result) => {
      set((state) => ({
        connections: {
          ...state.connections,
          [config.id]: {
            ...state.connections[config.id],
            config,
            status: 'connected',
            error: undefined,
            serverVersion: result.serverVersion
          }
        }
      }))
      get().activate(config.id)
    },

    setError: (id, error) =>
      set((state) => {
        const conn = state.connections[id]
        if (!conn) return state
        return { connections: { ...state.connections, [id]: { ...conn, status: 'error', error } } }
      }),

    hydrateSavedConnections: async () => {
      const configs = await configService.getConnections()
      await Promise.all(
        configs.map(async (config) => {
          get().setConnecting(config)
          try {
            const result = await queryService.connect(config)
            if (result.success) {
              get().setConnected(config, result)
              await get().loadDatabases(config.id)
              await restoreExpansion(config.id)
            } else {
              get().setError(config.id, result.message)
            }
          } catch (error) {
            get().setError(config.id, error instanceof Error ? error.message : '连接失败')
          }
        })
      )
    },

    disconnect: async (id) => {
      try {
        await queryService.disconnect(id)
      } finally {
        // 手动断开即视为放弃该连接，同时删除持久化配置，避免下次启动时被自动重连（FR-004）
        void configService.removeConnection(id)
        set((state) => {
          if (!(id in state.connections)) return state
          const next = { ...state.connections }
          delete next[id]
          return {
            connections: next,
            activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId
          }
        })
      }
    },

    loadDatabases: async (id, options) => {
      const conn = get().connections[id]
      if (!conn) return
      if (!options?.force && conn.databases && !conn.databasesError) return

      const hadActiveDatabase = Boolean(conn.activeDatabase)
      updateConn(id, (c) => ({ ...c, databasesLoading: true, databasesError: undefined }))
      try {
        const databases = await queryService.getDatabases(id)
        updateConn(id, (c) => {
          const legacy = c.config.database
          const activeDatabase =
            c.activeDatabase ??
            (legacy && databases.some((d) => d.name === legacy) ? legacy : undefined)
          return {
            ...c,
            databases,
            databasesLoading: false,
            databasesError: undefined,
            activeDatabase
          }
        })
        // FR-016 兜底：若此前尚未确定默认数据库，此处首次确定后同样标记为默认展开
        const resolvedActiveDatabase = get().connections[id]?.activeDatabase
        if (!hadActiveDatabase && resolvedActiveDatabase) {
          expandDefaultDatabase(id, resolvedActiveDatabase)
        }
      } catch (error) {
        updateConn(id, (c) => ({
          ...c,
          databasesLoading: false,
          databasesError: error instanceof Error ? error.message : '加载数据库列表失败'
        }))
      }
    },

    setActiveDatabase: (id, database) => {
      updateConn(id, (c) => ({ ...c, activeDatabase: database }))
      // 确保该数据库存在对应的结构树节点（首次选中时创建默认态）
      updateDatabaseNode(id, database, (node) => node)
    },

    toggleSecurityNode: (id) => {
      const current = get().connections[id]?.security
      const nextExpanded = !(current?.expanded ?? false)
      updateSecurityNode(id, (node) => ({ ...node, expanded: nextExpanded }))
      useTreeExpandStore.getState().setSecurityExpanded(id, nextExpanded)
      if (nextExpanded && !current?.roles) {
        void get().loadRoles(id)
      }
    },

    loadRoles: async (id, options) => {
      const current = get().connections[id]?.security
      if (!options?.force && current?.roles && !current.rolesError) return

      updateSecurityNode(id, (node) => ({ ...node, rolesLoading: true, rolesError: undefined }))
      try {
        const roles = await queryService.getRoles(id)
        updateSecurityNode(id, (node) => ({
          ...node,
          roles,
          rolesLoading: false,
          rolesError: undefined
        }))
      } catch (error) {
        updateSecurityNode(id, (node) => ({
          ...node,
          rolesLoading: false,
          rolesError: error instanceof Error ? error.message : '加载角色列表失败'
        }))
      }
    },

    toggleSecurityGroup: (id, group) => {
      const key = group === 'users' ? 'usersGroupExpanded' : 'rolesGroupExpanded'
      const current = get().connections[id]?.security
      const nextExpanded = !(current?.[key] ?? false)
      updateSecurityNode(id, (node) => ({ ...node, [key]: nextExpanded }))
      useTreeExpandStore.getState().setSecurityGroupExpanded(id, group, nextExpanded)
    },

    toggleDatabaseNode: (id, database) => {
      const current = get().connections[id]?.databaseNodes?.[database]
      const nextExpanded = !(current?.expanded ?? false)
      updateDatabaseNode(id, database, (node) => ({ ...node, expanded: nextExpanded }))
      useTreeExpandStore.getState().setDatabaseExpanded(id, database, nextExpanded)
      if (nextExpanded && !current?.schemas) {
        void get().loadSchemas(id, database)
      }
    },

    loadSchemas: async (id, database, options) => {
      const node = get().connections[id]?.databaseNodes?.[database]
      if (!options?.force && node?.schemas && !node.schemasError) return

      updateDatabaseNode(id, database, (n) => ({
        ...n,
        schemasLoading: true,
        schemasError: undefined
      }))
      try {
        const schemas = await queryService.getSchemas(id, database)
        updateDatabaseNode(id, database, (n) => ({
          ...n,
          schemas,
          schemasLoading: false,
          schemasError: undefined
        }))
      } catch (error) {
        updateDatabaseNode(id, database, (n) => ({
          ...n,
          schemasLoading: false,
          schemasError: error instanceof Error ? error.message : '加载 Schema 失败'
        }))
      }
    },

    toggleSchemaNode: (id, database, schema) => {
      const current = get().connections[id]?.databaseNodes?.[database]?.schemaNodes?.[schema]
      const nextExpanded = !(current?.expanded ?? false)
      updateSchemaNode(id, database, schema, (node) => ({ ...node, expanded: nextExpanded }))
      useTreeExpandStore.getState().setSchemaExpanded(id, database, schema, nextExpanded)
    },

    toggleTableNode: (id, database, schema, table) => {
      const current =
        get().connections[id]?.databaseNodes?.[database]?.schemaNodes?.[schema]?.tableNodes?.[table]
      const nextExpanded = !(current?.expanded ?? false)
      updateTableNode(id, database, schema, table, (node) => ({ ...node, expanded: nextExpanded }))
      useTreeExpandStore.getState().setTableExpanded(id, database, schema, table, nextExpanded)
    },

    toggleTableModule: (id, database, schema, table, moduleKind) => {
      const current =
        get().connections[id]?.databaseNodes?.[database]?.schemaNodes?.[schema]?.tableNodes?.[table]
          ?.modules?.[moduleKind]
      const nextExpanded = !(current?.expanded ?? false)
      updateTableModule(id, database, schema, table, moduleKind, (mod) => ({
        ...mod,
        expanded: nextExpanded
      }))
      useTreeExpandStore
        .getState()
        .setTableModuleExpanded(id, database, schema, table, moduleKind, nextExpanded)
      if (nextExpanded && !current?.items) {
        void get().loadTableModuleItems(id, database, schema, table, moduleKind)
      }
    },

    loadTableModuleItems: async (id, database, schema, table, moduleKind, options) => {
      const current =
        get().connections[id]?.databaseNodes?.[database]?.schemaNodes?.[schema]?.tableNodes?.[table]
          ?.modules?.[moduleKind]
      if (!options?.force && current?.items && !current.error) return

      updateTableModule(id, database, schema, table, moduleKind, (mod) => ({
        ...mod,
        loading: true,
        error: undefined
      }))
      try {
        let items: TableModuleState['items']
        if (moduleKind === 'columns') {
          items = await queryService.getColumns(id, database, schema, table)
        } else if (moduleKind === 'indexes') {
          items = await queryService.getIndexes(id, database, schema, table)
        } else {
          items = await queryService.getTriggers(id, database, schema, table)
        }
        updateTableModule(id, database, schema, table, moduleKind, (mod) => ({
          ...mod,
          items,
          loading: false,
          error: undefined
        }))
      } catch (error) {
        updateTableModule(id, database, schema, table, moduleKind, (mod) => ({
          ...mod,
          loading: false,
          error: error instanceof Error ? error.message : '加载失败'
        }))
      }
    },

    toggleModule: (id, database, schema, moduleKind) => {
      const current =
        get().connections[id]?.databaseNodes?.[database]?.schemaNodes?.[schema]?.modules?.[
          moduleKind
        ]
      const nextExpanded = !(current?.expanded ?? false)
      updateModule(id, database, schema, moduleKind, (mod) => ({ ...mod, expanded: nextExpanded }))
      useTreeExpandStore
        .getState()
        .setModuleExpanded(id, database, schema, moduleKind, nextExpanded)
      if (nextExpanded && !current?.items) {
        void get().loadModuleItems(id, database, schema, moduleKind)
      }
    },

    loadModuleItems: async (id, database, schema, moduleKind, options) => {
      const current =
        get().connections[id]?.databaseNodes?.[database]?.schemaNodes?.[schema]?.modules?.[
          moduleKind
        ]
      if (!options?.force && current?.items && !current.error) return

      updateModule(id, database, schema, moduleKind, (mod) => ({
        ...mod,
        loading: true,
        error: undefined
      }))
      try {
        let items: ModuleState['items']
        if (moduleKind === 'tables' || moduleKind === 'views') {
          const tables = await queryService.getTables(id, database, schema)
          items = tables.filter((t) =>
            moduleKind === 'tables' ? t.type === 'table' : t.type === 'view'
          )
        } else if (moduleKind === 'functions') {
          items = await queryService.getFunctions(id, database, schema)
        } else if (moduleKind === 'procedures') {
          items = await queryService.getProcedures(id, database, schema)
        } else {
          items = []
        }
        updateModule(id, database, schema, moduleKind, (mod) => ({
          ...mod,
          items,
          loading: false,
          error: undefined
        }))
      } catch (error) {
        updateModule(id, database, schema, moduleKind, (mod) => ({
          ...mod,
          loading: false,
          error: error instanceof Error ? error.message : '加载失败'
        }))
      }
    }
  }
})
