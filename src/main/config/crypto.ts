/**
 * 凭据加密工具
 *
 * 宪法 I：数据库密码必须使用 Electron safeStorage 加密后存储，
 * 禁止明文落盘。本文件是主进程中唯一导入 safeStorage 的地方。
 */
import { safeStorage } from 'electron'

function ensureEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统不支持 safeStorage 加密（Linux 需要可用的 keyring）')
  }
}

export function encryptPassword(plain: string): string {
  ensureEncryptionAvailable()
  const buffer = safeStorage.encryptString(plain)
  return buffer.toString('base64')
}

export function decryptPassword(encrypted: string): string {
  ensureEncryptionAvailable()
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}
