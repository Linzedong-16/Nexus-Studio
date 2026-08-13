import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { createInvoke, createListener } from './utils'
import type { Api } from './index.d'
import type {
  QueryResult,
  DatabaseInfo,
  RoutineInfo,
  IndexInfo,
  TriggerInfo,
  RoleInfo,
  ErDiagramData,
  DbLogEntry
} from '../renderer/src/types/ipc'
import type { KeybindingEntry } from '../renderer/src/types/keybinding'
import type { FileNode } from '../renderer/src/types/fileExplorer'

/**
 * 渲染进程可用 API —— 使用工厂函数创建，声明式定义
 *
 * 宪法 I：只暴露封装后的有限 API，禁止透出原始 ipcRenderer
 * 宪法 V：invoke/handle 双向通信，send/on 单向推送
 *
 * 新增通道只需在此添加一行 createInvoke / createListener，无需手写 ipcRenderer 调用
 * 类型定义在 index.d.ts 中，与 src/renderer/src/types/ipc.ts 共享
 */
const api: Api = {
  // ─── 窗口控制 ───
  windowControls: {
    minimize: createInvoke('window:minimize'),
    toggleMaximize: createInvoke<[], boolean>('window:toggle-maximize'),
    close: createInvoke('window:close'),
    isMaximized: createInvoke<[], boolean>('window:is-maximized'),
    onMaximizedChange: createListener<boolean>('window:maximized-changed')
  },

  // ─── 数据库操作 ───
  db: {
    testConnection: createInvoke('db:test-connection'),
    connect: createInvoke('db:connect'),
    disconnect: createInvoke('db:disconnect'),
    getDatabases: createInvoke<[string], DatabaseInfo[]>('db:get-databases'),
    getRoles: createInvoke<[string], RoleInfo[]>('db:get-roles'),
    query: createInvoke<[string, string, string, unknown[]?], QueryResult>('db:query'),
    getSchemas: createInvoke('db:get-schemas'),
    getTables: createInvoke('db:get-tables'),
    getColumns: createInvoke('db:get-columns'),
    getIndexes: createInvoke<[string, string, string, string], IndexInfo[]>('db:get-indexes'),
    getTriggers: createInvoke<[string, string, string, string], TriggerInfo[]>('db:get-triggers'),
    getFunctions: createInvoke<[string, string, string], RoutineInfo[]>('db:get-functions'),
    getProcedures: createInvoke<[string, string, string], RoutineInfo[]>('db:get-procedures'),
    getErDiagramData: createInvoke<[string, string, string[]], ErDiagramData>(
      'db:get-er-diagram-data'
    ),
    onStatusChange: createListener('db:status-changed')
  },

  // ─── 配置读写 ───
  config: {
    get: createInvoke('config:get'),
    set: createInvoke('config:set'),
    getAll: createInvoke('config:get-all'),
    delete: createInvoke('config:delete'),
    getConnections: createInvoke('config:get-connections'),
    saveConnection: createInvoke('config:save-connection'),
    removeConnection: createInvoke('config:remove-connection')
  },

  // ─── 快捷键配置 ───
  keybindings: {
    getAll: createInvoke('keybindings:get-all'),
    saveAll: createInvoke<[KeybindingEntry[]], KeybindingEntry[]>('keybindings:save-all'),
    resetDefaults: createInvoke('keybindings:reset-defaults')
  },

  // ─── 数据库日志 ───
  log: {
    getBacklog: createInvoke<[], DbLogEntry[]>('log:get-backlog'),
    onLog: createListener<DbLogEntry>('log:db-log')
  },

  // ─── 头像文件管理 ───
  avatar: {
    save: createInvoke<[string], void>('avatar:save'),
    load: createInvoke<[], string | null>('avatar:load'),
    delete: createInvoke<[], void>('avatar:delete')
  },

  // ─── 应用信息 ───
  app: {
    getVersions: createInvoke<[], import('../renderer/src/types/ipc').AppVersions>(
      'app:get-versions'
    )
  },

  // ─── 文件系统操作 ───
  fs: {
    pickFolder: createInvoke<[], string | null>('fs:pick-folder'),
    readDir: createInvoke<[string], FileNode[]>('fs:read-dir'),
    readFile: createInvoke<[string], string>('fs:read-file'),
    writeFile: createInvoke<[string, string], void>('fs:write-file'),
    showItemInFolder: createInvoke<[string], void>('fs:show-item'),
    fileExists: createInvoke<[string], boolean>('fs:file-exists'),
    createFile: createInvoke<[string, string], string>('fs:create-file'),
    createDirectory: createInvoke<[string, string], string>('fs:create-directory'),
    rename: createInvoke<[string, string], string>('fs:rename'),
    deleteItem: createInvoke<[string], void>('fs:delete'),
    moveItem: createInvoke<[string, string], string>('fs:move'),
    readFileSafe: createInvoke<[string], { isBinary: boolean; content?: string }>(
      'fs:read-file-safe'
    )
  }
}

// 通过 contextBridge 安全暴露到渲染进程的 window 对象
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
