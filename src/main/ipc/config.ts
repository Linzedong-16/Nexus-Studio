import { createIPCHandler } from './utils'
import { configStore } from '../config/store'
import { decryptPassword, encryptPassword } from '../config/crypto'
import { loadModelProviderConfig } from '../ai/config'
import type {
  ConfigStore,
  ConnectionConfig,
  StoredConnection,
  StoredModelProviderConfig,
  ModelProviderFormValue
} from '../../renderer/src/types/ipc'

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
    // 同一服务器/账号的连接不应重复建立，无论是新建还是改后与其它连接撞车都要拦截
    const duplicate = stored.find(
      (c, i) =>
        i !== index &&
        c.type === config.type &&
        c.host === config.host &&
        c.port === config.port &&
        c.username === config.username &&
        (c.database ?? '') === (config.database ?? '')
    )
    if (duplicate) {
      throw new Error(`已存在相同的连接「${duplicate.name}」，请直接使用该连接，无需重复创建`)
    }
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

  createIPCHandler<[], ModelProviderFormValue>('config:get-model-provider', async () => {
    const config = loadModelProviderConfig()
    return { baseURL: config.baseURL, model: config.model, apiKey: config.apiKey ?? '' }
  })

  createIPCHandler<[ModelProviderFormValue], void>(
    'config:save-model-provider',
    async ({ baseURL, model, apiKey }) => {
      const trimmedApiKey = apiKey.trim()
      const next: StoredModelProviderConfig = {
        baseURL: baseURL.trim(),
        model: model.trim(),
        encryptedApiKey: trimmedApiKey ? encryptPassword(trimmedApiKey) : undefined
      }
      configStore.set('deepseekConfig', next)
    }
  )
}
