/**
 * 快捷键配置文件路径解析
 *
 * 与 configStore（始终落在 app.getPath('userData')，固定在系统盘）不同，
 * 快捷键 JSON 需要跟随应用安装所在的磁盘：打包环境下优先使用可执行文件同级的
 * data 目录；开发环境下沿用 userData，行为与 configStore 一致。
 *
 * 采用"已存在文件优先"策略避免路径在多次启动间跳变；安装目录不可写时
 * （如管理员安装到只读的 Program Files）回退到 userData。
 */
import { app } from 'electron'
import { existsSync, mkdirSync, accessSync, constants } from 'fs'
import { dirname, join } from 'path'

const FILE_NAME = 'keybindings.json'

function installDirCandidate(): string {
  return join(dirname(app.getPath('exe')), 'data', FILE_NAME)
}

function userDataCandidate(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

function isWritableDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

export function resolveKeybindingsPath(): string {
  if (!app.isPackaged) {
    return userDataCandidate()
  }

  const installPath = installDirCandidate()
  const userDataPath = userDataCandidate()

  if (existsSync(installPath)) return installPath
  if (existsSync(userDataPath)) return userDataPath

  return isWritableDir(dirname(installPath)) ? installPath : userDataPath
}
