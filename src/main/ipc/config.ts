import { createIPCHandler } from './utils'
import { configStore } from '../config/store'
import { decryptPassword, encryptPassword } from '../config/crypto'
import type { ConfigStore, ConnectionConfig, StoredConnection } from '../../renderer/src/types/ipc'

/**
 * 配置读写 IPC 处理器
 *
 * 宪法 I：主进程独占文件系统操作，通过 electron-store 持久化。
 * 连接配置中的密码通过 safeStorage 加解密，渲染进程不接触加密逻辑。
 */

function toStored(config: ConnectionConfig): StoredConnection {
  const { password, ...rest } = config
  return {
    ...rest,
    encryptedPassword: password ? encryptPassword(password) : undefined
  }
}

function toRuntime(stored: StoredConnection): ConnectionConfig {
  const { encryptedPassword, ...rest } = stored
  return {
    ...rest,
    password: encryptedPassword ? decryptPassword(encryptedPassword) : ''
  }
}

export function registerConfigIPC(): void {
  createIPCHandler<[string], unknown>('config:get', async (key) => {
    if (key === 'connections') {
      throw new Error('请使用 config:get-connections 获取连接配置')
    }
    return configStore.get(key as keyof ConfigStore)
  })

  createIPCHandler<[string, unknown], void>('config:set', async (key, value) => {
    if (key === 'connections') {
      throw new Error('请使用 config:save-connection / config:remove-connection 修改连接配置')
    }
    configStore.set(key as keyof ConfigStore, value as never)
  })

  createIPCHandler<[], ConfigStore>('config:get-all', async () => {
    return configStore.store
  })

  createIPCHandler<[string], void>('config:delete', async (key) => {
    if (key === 'connections') {
      throw new Error('请使用 config:remove-connection 删除连接配置')
    }
    configStore.delete(key as keyof ConfigStore)
  })

  createIPCHandler<[], ConnectionConfig[]>('config:get-connections', async () => {
    const stored = configStore.get('connections') as StoredConnection[]
    return stored.map(toRuntime)
  })

  createIPCHandler<[ConnectionConfig], void>('config:save-connection', async (config) => {
    const stored = configStore.get('connections') as StoredConnection[]
    const index = stored.findIndex((c) => c.id === config.id)
    const next = toStored(config)
    if (index >= 0) {
      stored[index] = next
    } else {
      stored.push(next)
    }
    configStore.set('connections', stored)
  })

  createIPCHandler<[string], void>('config:remove-connection', async (id) => {
    const stored = configStore.get('connections') as StoredConnection[]
    configStore.set(
      'connections',
      stored.filter((c) => c.id !== id)
    )
  })
}
