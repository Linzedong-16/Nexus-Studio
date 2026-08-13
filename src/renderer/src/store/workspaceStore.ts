/**
 * Work 工作区状态管理
 *
 * 管理 Work 模式下的标签页：创建、关闭、切换、拖拽排序。
 * 使用 Zustand persist 持久化到 localStorage。
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { useErStore } from '@/store/erStore'
import { fsService } from '@/services/fsService'
import type {
  ErAnalysisTabState,
  FileTabState,
  OpenErAnalysisTabPayload,
  OpenFileTabPayload,
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

/** 判断 filePath 是否为 rootPath 自身或其下的路径（支持 `/` 与 `\` 混合分隔符） */
function isPathUnder(filePath: string, rootPath: string): boolean {
  if (filePath === rootPath) return true
  return filePath.startsWith(`${rootPath}/`) || filePath.startsWith(`${rootPath}\\`)
}

/** 取路径的末段名称（文件名） */
function basenameOfPath(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return idx === -1 ? p : p.slice(idx + 1)
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
    if (tab.type === 'file') {
      return {
        ...tab,
        state: { ...((tab.state as FileTabState) ?? {}), content: '' },
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
            closable: true,
            pinned: false
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
            pinned: false,
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
            pinned: false,
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

      openErAnalysisTab: (payload: OpenErAnalysisTabPayload) => {
        let newId = ''
        set((state) => {
          const existing = state.tabs.find((t) => {
            if (t.type !== 'er-analysis') return false
            const s = t.state as ErAnalysisTabState | undefined
            return s?.connectionId === payload.connectionId && s?.database === payload.database
          })
          if (existing) {
            newId = existing.id
            return { activeTabId: existing.id }
          }
          newId = uuidv4()
          const newTab: WorkspaceTab = {
            id: newId,
            type: 'er-analysis',
            title: `${payload.connectionName} · ${payload.database} · ER 分析`,
            closable: true,
            pinned: false,
            state: {
              connectionId: payload.connectionId,
              connectionName: payload.connectionName,
              database: payload.database
            }
          }
          return {
            tabs: [...state.tabs, newTab],
            activeTabId: newId
          }
        })
        return newId
      },

      openFileTab: (payload: OpenFileTabPayload) => {
        let newId = ''
        set((state) => {
          const existing = state.tabs.find((t) => {
            if (t.type !== 'file') return false
            const s = t.state as FileTabState | undefined
            return s?.filePath === payload.filePath
          })
          if (existing) {
            newId = existing.id
            return { activeTabId: existing.id }
          }
          newId = uuidv4()
          const newTab: WorkspaceTab = {
            id: newId,
            type: 'file',
            title: payload.fileName,
            closable: true,
            pinned: false,
            state: {
              filePath: payload.filePath,
              fileName: payload.fileName,
              content: payload.content
            } as FileTabState
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

          const closing = state.tabs[index]
          if (closing.type === 'er-analysis') useErStore.getState().clearTabState(id)

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
          // 保留当前 tab 和所有 pinned tab
          const pinned = state.tabs.filter((t) => t.id !== id && t.pinned)
          if (!keep) return state
          for (const t of state.tabs) {
            if (t.id !== id && !t.pinned && t.type === 'er-analysis')
              useErStore.getState().clearTabState(t.id)
          }
          return {
            tabs: [keep, ...pinned],
            activeTabId: keep.id
          }
        })
      },

      closeAllTabs: () => {
        set((state) => {
          // 过滤掉 pinned 标签页，仅关闭未固定的
          const pinnedTabs = state.tabs.filter((t) => t.pinned)
          for (const t of state.tabs) {
            if (t.type === 'er-analysis' && !t.pinned) useErStore.getState().clearTabState(t.id)
          }
          return {
            tabs: pinnedTabs,
            activeTabId: pinnedTabs[0]?.id ?? null
          }
        })
      },

      togglePin: (id) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t))
        }))
      },

      hydrateFileTabs: async () => {
        const { tabs } = useWorkspaceStore.getState()
        for (const tab of tabs) {
          if (tab.type !== 'file') continue
          const state = tab.state as FileTabState | undefined
          if (!state?.filePath) continue
          try {
            const result = await fsService.readFileSafe(state.filePath)
            const updatedTab: WorkspaceTab = {
              ...tab,
              state: { ...state, content: result.content ?? '', isBinary: result.isBinary }
            }
            set((s) => ({
              tabs: s.tabs.map((t) => (t.id === tab.id ? updatedTab : t))
            }))
          } catch {
            // 文件不存在则关闭该标签页
            set((s) => ({
              tabs: s.tabs.filter((t) => t.id !== tab.id)
            }))
          }
        }
      },

      closeFileTabsUnderPath: (rootPath) => {
        set((state) => {
          const nextTabs = state.tabs.filter((t) => {
            if (t.type !== 'file') return true
            const filePath = (t.state as FileTabState | undefined)?.filePath
            return !filePath || !isPathUnder(filePath, rootPath)
          })
          if (nextTabs.length === state.tabs.length) return state
          let nextActiveId = state.activeTabId
          if (nextActiveId && !nextTabs.some((t) => t.id === nextActiveId)) {
            nextActiveId = nextTabs[0]?.id ?? null
          }
          return { tabs: nextTabs, activeTabId: nextActiveId }
        })
      },

      renameFileTab: (oldPath, newPath) => {
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.type !== 'file') return t
            const fileState = t.state as FileTabState | undefined
            if (!fileState?.filePath || !isPathUnder(fileState.filePath, oldPath)) return t
            const updatedFilePath = newPath + fileState.filePath.slice(oldPath.length)
            const fileName = basenameOfPath(updatedFilePath)
            return {
              ...t,
              title: fileName,
              state: { ...fileState, filePath: updatedFilePath, fileName }
            }
          })
        }))
      }
    }),
    {
      name: 'nexus-studio-work-workspace',
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
