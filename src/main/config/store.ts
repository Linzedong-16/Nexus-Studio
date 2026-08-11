/**
 * 本地配置持久化
 *
 * 使用 electron-store 存储应用设置和连接配置。
 * 连接配置中的密码不在此直接读写，而是通过 config IPC 处理器
 * 结合 safeStorage 加解密后存取。
 */
import Store from 'electron-store'
import type { ConfigStore } from '../../renderer/src/types/ipc'

const defaults: ConfigStore = {
  theme: 'light',
  fontSize: 14,
  pageSize: 100,
  connections: [],
  recentFiles: []
}

export const configStore = new Store<ConfigStore>({
  name: 'nexus-studio-config',
  defaults
})
