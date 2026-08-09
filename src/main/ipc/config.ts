import { createIPCHandler } from './utils'

/**
 * 配置读写 IPC 处理器
 *
 * 宪法 I：主进程独占文件系统操作，通过 electron-store 持久化
 * 渲染进程不直接访问 Node.js fs 模块
 *
 * 通道命名：config:xxx（宪法 V：模块:操作 格式）
 */

// ─── 类型定义 ───

export interface ConfigStore {
  theme: 'light' | 'dark'
  fontSize: number
  pageSize: number
  connections: Array<{
    id: string
    name: string
    host: string
    port: number
    database: string
    username: string
    encryptedPassword?: string
  }>
  recentFiles: string[]
  windowBounds?: { x: number; y: number; width: number; height: number }
}

// ─── 内存存储（Phase 2 替换为 electron-store） ───

let configStore: ConfigStore = {
  theme: 'light',
  fontSize: 14,
  pageSize: 100,
  connections: [],
  recentFiles: []
}

// 模拟 electron-store 的读/写能力，Phase 2 替换为真正的 electron-store
function getConfig(): ConfigStore {
  return configStore
}

function setConfig(partial: Partial<ConfigStore>): void {
  configStore = { ...configStore, ...partial }
}

// ─── 注册 IPC 处理器 ───

export function registerConfigIPC(): void {
  // 获取单个配置项
  createIPCHandler<[string], unknown>('config:get', async (key) => {
    const config = getConfig()
    return (config as unknown as Record<string, unknown>)[key]
  })

  // 设置单个配置项
  createIPCHandler<[string, unknown], void>('config:set', async (key, value) => {
    setConfig({ [key]: value })
  })

  // 获取全部配置
  createIPCHandler<[], ConfigStore>('config:get-all', async () => {
    return getConfig()
  })

  // 删除配置项
  createIPCHandler<[string], void>('config:delete', async (key) => {
    const config = getConfig()
    delete (config as unknown as Record<string, unknown>)[key]
    setConfig(config)
  })
}
