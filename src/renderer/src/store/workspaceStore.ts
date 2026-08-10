/**
 * Work 工作区状态管理
 *
 * 管理 Work 模式下的标签页：创建、关闭、切换、拖拽排序。
 * 使用 Zustand persist 持久化到 localStorage。
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type {
  OpenQueryTabPayload,
  OpenTableTabPayload,
  QueryTabState,
  TableTabState,
  WorkspaceState,
  WorkspaceTab
} from '@/types/workspace'

/** 提取表名用于标签标题 */
function extractTableName(sql: string): string {
  const match = sql.match(/FROM\s+"?([^"\s.]+)"?"?\.?"?([^"\s;]+)"?/i)
  return match?.[2] ?? match?.[1] ?? '查询'
}

/** 持久化时剥离瞬时状态（SQL 内容、结果、加载态） */
function sanitizeForPersist(tabs: WorkspaceTab[]): WorkspaceTab[] {
  return tabs.map((tab) => {
    if (tab.type === 'query') {
      return {
        ...tab,
        state: { ...((tab.state as QueryTabState) ?? {}), sql: '' },
        result: null,
        error: undefined,
        loading: false
      }
    }
    if (tab.type === 'table') {
      return {
        ...tab,
        state: { ...((tab.state as TableTabState) ?? {}), page: 1 },
        result: null,
        error: undefined,
        loading: false
      }
    }
    return { ...tab, result: null, error: undefined, loading: false }
  })
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      tabs: [],
      activeTabId: null,

      addConnectionTab: () => {
        set((state) => {
          const connectionCount = state.tabs.filter((t) => t.type === 'connection').length
          const nextIndex = connectionCount + 1
          const newTab: WorkspaceTab = {
            id: uuidv4(),
            type: 'connection',
            title: `新建连接 ${nextIndex}`,
            closable: true
          }
          return {
            tabs: [...state.tabs, newTab],
            activeTabId: newTab.id
          }
        })
      },

      openQueryTab: (payload: OpenQueryTabPayload) => {
        let newId = ''
        set((state) => {
          const existing = state.tabs.find((t) => {
            if (t.type !== 'query') return false
            const s = t.state as QueryTabState | undefined
            return s?.connectionId === payload.connectionId && s?.database === payload.database
          })
          if (existing) {
            newId = existing.id
            return { activeTabId: existing.id }
          }
          newId = uuidv4()
          const tableName = extractTableName(payload.defaultSql)
          const newTab: WorkspaceTab = {
            id: newId,
            type: 'query',
            title: `${payload.connectionName} · ${payload.database} · ${tableName}`,
            closable: true,
            state: {
              connectionId: payload.connectionId,
              connectionName: payload.connectionName,
              database: payload.database,
              schema: payload.schema,
              sql: payload.defaultSql,
              defaultSql: payload.defaultSql
            },
            result: null,
            error: undefined,
            loading: false
          }
          return {
            tabs: [...state.tabs, newTab],
            activeTabId: newId
          }
        })
        return newId
      },

      openTableTab: (payload: OpenTableTabPayload) => {
        let newId = ''
        set((state) => {
          const existing = state.tabs.find((t) => {
            if (t.type !== 'table') return false
            const s = t.state as TableTabState | undefined
            return (
              s?.connectionId === payload.connectionId &&
              s?.database === payload.database &&
              s?.schema === payload.schema &&
              s?.table === payload.table &&
              s?.filter === payload.filter
            )
          })
          if (existing) {
            newId = existing.id
            return { activeTabId: existing.id }
          }
          newId = uuidv4()
          const newTab: WorkspaceTab = {
            id: newId,
            type: 'table',
            title: `${payload.connectionName} · ${payload.breadcrumb ?? `${payload.schema}.${payload.table}`}`,
            closable: true,
            state: {
              connectionId: payload.connectionId,
              connectionName: payload.connectionName,
              database: payload.database,
              schema: payload.schema,
              table: payload.table,
              filter: payload.filter,
              breadcrumb: payload.breadcrumb,
              pageSize: 100,
              page: 1
            },
            result: null,
            error: undefined,
            loading: false
          }
          return {
            tabs: [...state.tabs, newTab],
            activeTabId: newId
          }
        })
        return newId
      },

      updateTableTab: (id, patch) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id && t.type === 'table'
              ? { ...t, state: { ...(t.state as TableTabState), ...patch } }
              : t
          )
        }))
      },

      updateQueryTab: (id, patch) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id && t.type === 'query'
              ? { ...t, state: { ...(t.state as QueryTabState), ...patch } }
              : t
          )
        }))
      },

      setQueryLoading: (id, loading) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, loading } : t))
        }))
      },

      setQueryResult: (id, result, error) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, result, error, loading: false } : t))
        }))
      },

      updateTabTitle: (id, title) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t))
        }))
      },

      closeTab: (id) => {
        set((state) => {
          const index = state.tabs.findIndex((t) => t.id === id)
          if (index === -1) return state

          const nextTabs = state.tabs.filter((t) => t.id !== id)
          let nextActiveId = state.activeTabId

          if (state.activeTabId === id) {
            const neighbor = nextTabs[index] ?? nextTabs[index - 1] ?? nextTabs[0]
            nextActiveId = neighbor?.id ?? null
          }

          return {
            tabs: nextTabs,
            activeTabId: nextActiveId
          }
        })
      },

      activateTab: (id) => {
        set({ activeTabId: id })
      },

      reorderTabs: (fromIndex, toIndex) => {
        set((state) => {
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            fromIndex >= state.tabs.length ||
            toIndex < 0 ||
            toIndex >= state.tabs.length
          ) {
            return state
          }
          const nextTabs = [...state.tabs]
          const [moved] = nextTabs.splice(fromIndex, 1)
          nextTabs.splice(toIndex, 0, moved)
          return { tabs: nextTabs }
        })
      },

      closeOtherTabs: (id) => {
        set((state) => {
          const keep = state.tabs.find((t) => t.id === id)
          if (!keep) return state
          return {
            tabs: [keep],
            activeTabId: keep.id
          }
        })
      },

      closeAllTabs: () => {
        set({
          tabs: [],
          activeTabId: null
        })
      }
    }),
    {
      name: 'db-client-work-workspace',
      partialize: (state) => ({
        tabs: sanitizeForPersist(state.tabs),
        activeTabId: state.activeTabId
      }),
      version: 2,
      migrate: (persistedState: unknown) => {
        const state = persistedState as {
          tabs?: Array<Omit<WorkspaceTab, 'type'> & { type: string }>
          activeTabId?: string | null
        }
        const tabs = sanitizeForPersist(
          (state?.tabs ?? []).filter((t) => t.type !== 'welcome') as WorkspaceTab[]
        )
        const activeTabId =
          state?.activeTabId && tabs.some((t) => t.id === state.activeTabId)
            ? state.activeTabId
            : (tabs[0]?.id ?? null)
        return { tabs, activeTabId }
      }
    }
  )
)
