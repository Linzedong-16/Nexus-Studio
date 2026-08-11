import { app } from 'electron'
import * as os from 'os'
import { createIPCHandler } from './utils'

export interface AppVersions {
  appVersion: string
  appName: string
  electron: string
  node: string
  chrome: string
  v8: string
  os: string
}

/**
 * 获取应用版本和环境信息
 */
function getAppVersions(): AppVersions {
  return {
    appVersion: app.getVersion(),
    appName: app.getName(),
    electron: process.versions.electron ?? 'unknown',
    node: process.versions.node ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    v8: process.versions.v8 ?? 'unknown',
    os: `${os.type()} ${os.arch()} ${os.release()}`
  }
}

export function registerAppIPC(): void {
  createIPCHandler<[], AppVersions>('app:get-versions', async () => {
    return getAppVersions()
  })
}
