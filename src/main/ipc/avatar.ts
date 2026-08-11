import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { createIPCHandler } from './utils'

/** 头像文件固定存放目录：<userData>/avatar/ */
const AVATAR_DIR = join(app.getPath('userData'), 'avatar')
/** 头像文件固定路径（始终只有一张） */
const AVATAR_PATH = join(AVATAR_DIR, 'avatar.png')

function ensureDir(): void {
  if (!existsSync(AVATAR_DIR)) {
    mkdirSync(AVATAR_DIR, { recursive: true })
  }
}

/**
 * 头像文件 IPC 处理器
 *
 * 头像文件存放在 app.getPath('userData')/avatar/avatar.png，
 * 始终只保留一张，新保存会覆盖旧文件。
 */
export function registerAvatarIPC(): void {
  // 保存头像（base64 DataURL → 文件）
  createIPCHandler<[string], void>('avatar:save', async (base64Data: string) => {
    ensureDir()
    // 剥离 data:image/xxx;base64, 前缀
    const matches = base64Data.match(/^data:image\/\w+;base64,(.+)$/)
    const raw = matches ? matches[1]! : base64Data
    writeFileSync(AVATAR_PATH, Buffer.from(raw, 'base64'))
  })

  // 加载头像文件 → base64 DataURL（供启动时回显）
  createIPCHandler<[], string | null>('avatar:load', async () => {
    if (!existsSync(AVATAR_PATH)) return null
    const buffer = readFileSync(AVATAR_PATH)
    return `data:image/png;base64,${buffer.toString('base64')}`
  })

  // 删除旧的头像文件（切换到远程链接时清理）
  createIPCHandler<[], void>('avatar:delete', async () => {
    if (existsSync(AVATAR_PATH)) {
      unlinkSync(AVATAR_PATH)
    }
  })
}
