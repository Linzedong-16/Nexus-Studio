import type { UpdateStatus } from '../types/updater'

/**
 * 自动更新服务层
 *
 * 宪法 III：组件不直接调用 window.api，通过 Service 层封装
 */

export const updaterService = {
  /** 触发一次检查更新，结果通过 onStatusChange 推送 */
  async check(): Promise<void> {
    return window.api.updater.check()
  },

  /** 下载已检测到的新版本 */
  async download(): Promise<void> {
    return window.api.updater.download()
  },

  /** 重启并安装已下载的更新 */
  async install(): Promise<void> {
    return window.api.updater.install()
  },

  /** 订阅更新状态变更；返回取消订阅函数 */
  onStatusChange(callback: (status: UpdateStatus) => void): () => void {
    return window.api.updater.onStatusChange(callback)
  }
}
