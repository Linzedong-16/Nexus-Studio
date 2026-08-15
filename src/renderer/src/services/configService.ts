import type { ConnectionConfig, ConfigStore, ModelProviderFormValue } from '../types/ipc'
import type { RecentProjectEntry } from '../types/fileExplorer'

/**
 * 配置管理服务层
 *
 * 宪法 III：组件不直接调用 window.api，通过 Service 层封装
 * 宪法 I：密码通过 safeStorage 加密存储在主进程，渲染进程不接触明文存储逻辑
 *
 * 当前为占位实现，Phase 2 接入 electron-store 后替换
 */

export const configService = {
  /**
   * 获取主题设置
   */
  async getTheme(): Promise<'light' | 'dark'> {
    const theme = await window.api.config.get('theme')
    return (theme as 'light' | 'dark') || 'light'
  },

  /**
   * 设置主题
   */
  async setTheme(theme: 'light' | 'dark'): Promise<void> {
    return window.api.config.set('theme', theme)
  },

  /**
   * 获取字体大小
   */
  async getFontSize(): Promise<number> {
    const size = await window.api.config.get('fontSize')
    return (size as number) || 14
  },

  /**
   * 设置字体大小
   */
  async setFontSize(size: number): Promise<void> {
    return window.api.config.set('fontSize', size)
  },

  /**
   * 获取分页大小
   */
  async getPageSize(): Promise<number> {
    const size = await window.api.config.get('pageSize')
    return (size as number) || 100
  },

  /**
   * 设置分页大小
   */
  async setPageSize(size: number): Promise<void> {
    return window.api.config.set('pageSize', size)
  },

  /**
   * 获取所有连接配置（密码已解密）
   */
  async getConnections(): Promise<ConnectionConfig[]> {
    return window.api.config.getConnections()
  },

  /**
   * 保存连接配置
   */
  async saveConnection(config: ConnectionConfig): Promise<void> {
    return window.api.config.saveConnection(config)
  },

  /**
   * 删除连接配置
   */
  async removeConnection(id: string): Promise<void> {
    return window.api.config.removeConnection(id)
  },

  /**
   * 获取全部配置
   */
  async getAll(): Promise<ConfigStore> {
    return window.api.config.getAll()
  },

  /**
   * 获取「最近项目」列表
   */
  async getRecentProjects(): Promise<RecentProjectEntry[]> {
    const list = await window.api.config.get<RecentProjectEntry[]>('recentProjects')
    return list ?? []
  },

  /**
   * 设置「最近项目」列表
   */
  async setRecentProjects(list: RecentProjectEntry[]): Promise<void> {
    return window.api.config.set('recentProjects', list)
  },

  /**
   * 获取当前生效的模型提供方配置（已解密 apiKey，用于设置表单预填充）
   */
  async getModelProviderConfig(): Promise<ModelProviderFormValue> {
    return window.api.config.getModelProviderConfig()
  },

  /**
   * 保存模型提供方配置；保存后下一次对话请求立即生效，无需重启
   */
  async saveModelProviderConfig(value: ModelProviderFormValue): Promise<void> {
    return window.api.config.saveModelProviderConfig(value)
  }
}
