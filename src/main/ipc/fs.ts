/**
 * 文件系统 IPC 处理器
 *
 * 为渲染进程提供安全的文件系统操作通道：
 * - 目录选择、读取、写入
 * - 系统文件管理器定位
 *
 * 宪法 I：不暴露原始 fs 模块给渲染进程
 * 宪法 V：invoke/handle 双向通信
 */
import { dialog, shell } from 'electron'
import { readdir, readFile, writeFile, mkdir, rename as fsRename, open } from 'fs/promises'
import { existsSync } from 'fs'
import { createIPCHandler } from './utils'

/** 图片扩展名 → MIME 类型映射 */
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

/** 获取图片文件的 MIME 类型 */
function getImageMime(name: string): string | undefined {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return IMAGE_MIME[ext]
}

/** 文件树节点（与渲染进程类型保持一致） */
interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

/**
 * 路径拼接辅助函数
 *
 * `fs:read-dir` 历来以手动 `${dirPath}/${name}` 拼接子路径（而非 Node `path` 模块），
 * 根路径本身可能保留系统对话框返回的原生分隔符（Windows 下为 `\`）。
 * 新增的创建/重命名/移动处理器沿用同一拼接方式，确保同一血缘下的路径字符串
 * 具备一致的可比较性（供渲染进程按路径字符串做展开态/选中态/嵌套关系判断）
 */
function joinPath(parent: string, name: string): string {
  return `${parent}/${name}`
}

/** 取路径最后一个分隔符（`/` 或 `\`）位置 */
function lastSepIndex(p: string): number {
  return Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
}

/** 取路径的父目录部分 */
function dirnamePath(p: string): string {
  const idx = lastSepIndex(p)
  return idx === -1 ? p : p.slice(0, idx)
}

/** 取路径的末段名称 */
function basenamePath(p: string): string {
  const idx = lastSepIndex(p)
  return idx === -1 ? p : p.slice(idx + 1)
}

/** 判断 targetPath 是否为 sourcePath 自身或其子孙路径 */
function isSelfOrDescendant(sourcePath: string, targetPath: string): boolean {
  if (targetPath === sourcePath) return true
  return targetPath.startsWith(`${sourcePath}/`) || targetPath.startsWith(`${sourcePath}\\`)
}

/**
 * 递归读取目录内容，构建文件树
 * 排除以 '.' 开头的隐藏文件/目录
 */
async function readDirTree(dirPath: string): Promise<FileNode[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const nodes: FileNode[] = []

  for (const entry of entries) {
    // 忽略隐藏文件/目录
    if (entry.name.startsWith('.')) continue

    const fullPath = `${dirPath}/${entry.name}`
    const isDirectory = entry.isDirectory()

    nodes.push({
      name: entry.name,
      path: fullPath,
      isDirectory,
      children: isDirectory ? undefined : undefined
    })
  }

  // 排序：目录在前，文件在后，均按名称字母序
  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return nodes
}

/** 注册所有文件系统 IPC 通道 */
export function registerFsIPC(): void {
  // 唤起系统目录选择器
  createIPCHandler<[], string | null>('fs:pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 唤起系统保存文件对话框，用户取消返回 null
  createIPCHandler<[string, { name: string; extensions: string[] }[]], string | null>(
    'fs:pick-save-file',
    async (defaultFileName: string, filters: { name: string; extensions: string[] }[]) => {
      const result = await dialog.showSaveDialog({
        defaultPath: defaultFileName,
        filters
      })
      if (result.canceled || !result.filePath) return null
      return result.filePath
    }
  )

  // 唤起系统打开文件对话框，用户取消返回 null
  createIPCHandler<[{ name: string; extensions: string[] }[]], string | null>(
    'fs:pick-open-file',
    async (filters: { name: string; extensions: string[] }[]) => {
      const result = await dialog.showOpenDialog({
        filters,
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    }
  )

  // 读取目录内容（懒加载，仅返回直接子节点）
  createIPCHandler<[string], FileNode[]>('fs:read-dir', async (dirPath: string) => {
    return readDirTree(dirPath)
  })

  // 读取文件内容（UTF-8）
  createIPCHandler<[string], string>('fs:read-file', async (filePath: string) => {
    return readFile(filePath, 'utf-8')
  })

  // 写入文件内容
  createIPCHandler<[string, string], void>(
    'fs:write-file',
    async (filePath: string, content: string) => {
      await writeFile(filePath, content, 'utf-8')
    }
  )

  // 在系统文件管理器中定位文件
  createIPCHandler<[string], void>('fs:show-item', async (filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  // 检查文件是否存在
  createIPCHandler<[string], boolean>('fs:file-exists', async (filePath: string) => {
    return existsSync(filePath)
  })

  // 在指定目录下新建空文件
  createIPCHandler<[string, string], string>(
    'fs:create-file',
    async (parentDir: string, name: string) => {
      const target = joinPath(parentDir, name)
      if (existsSync(target)) {
        throw new Error(`"${name}" 已存在`)
      }
      await writeFile(target, '', 'utf-8')
      return target
    }
  )

  // 在指定目录下新建空文件夹
  createIPCHandler<[string, string], string>(
    'fs:create-directory',
    async (parentDir: string, name: string) => {
      const target = joinPath(parentDir, name)
      if (existsSync(target)) {
        throw new Error(`"${name}" 已存在`)
      }
      await mkdir(target)
      return target
    }
  )

  // 重命名文件或文件夹（同目录内改名）
  createIPCHandler<[string, string], string>(
    'fs:rename',
    async (oldPath: string, newName: string) => {
      if (!existsSync(oldPath)) {
        throw new Error('待重命名的文件或文件夹不存在')
      }
      const target = joinPath(dirnamePath(oldPath), newName)
      if (existsSync(target)) {
        throw new Error(`"${newName}" 已存在`)
      }
      await fsRename(oldPath, target)
      return target
    }
  )

  // 删除文件或文件夹（移入系统回收站，可恢复）
  createIPCHandler<[string], void>('fs:delete', async (targetPath: string) => {
    if (!existsSync(targetPath)) {
      throw new Error('待删除的文件或文件夹不存在')
    }
    await shell.trashItem(targetPath)
  })

  // 移动文件或文件夹到目标目录下（用于拖拽移动）
  createIPCHandler<[string, string], string>(
    'fs:move',
    async (sourcePath: string, targetDirPath: string) => {
      if (!existsSync(sourcePath)) {
        throw new Error('待移动的文件或文件夹不存在')
      }
      if (isSelfOrDescendant(sourcePath, targetDirPath)) {
        throw new Error('不能移动到自身或其子目录下')
      }
      const name = basenamePath(sourcePath)
      const target = joinPath(targetDirPath, name)
      if (existsSync(target)) {
        throw new Error(`目标目录下已存在 "${name}"`)
      }
      await fsRename(sourcePath, target)
      return target
    }
  )

  // 安全读取文件：先探测前 8KB 是否含空字节判定二进制，二进制文件不读取全文
  createIPCHandler<[string], { isBinary: boolean; content?: string }>(
    'fs:read-file-safe',
    async (targetPath: string) => {
      if (!existsSync(targetPath)) {
        throw new Error('文件不存在')
      }
      const fd = await open(targetPath, 'r')
      let isBinary: boolean
      try {
        const buffer = Buffer.alloc(8192)
        const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0)
        isBinary = buffer.subarray(0, bytesRead).includes(0)
      } finally {
        await fd.close()
      }
      if (isBinary) return { isBinary: true }
      const content = await readFile(targetPath, 'utf-8')
      return { isBinary: false, content }
    }
  )

  // 读取图片文件为 base64 data URL
  createIPCHandler<[string], string | null>('fs:read-image-base64', async (targetPath: string) => {
    if (!existsSync(targetPath)) {
      throw new Error('文件不存在')
    }
    const name = targetPath.slice(lastSepIndex(targetPath) + 1)
    const mime = getImageMime(name)
    if (!mime) return null
    const buffer = await readFile(targetPath)
    const base64 = buffer.toString('base64')
    return `data:${mime};base64,${base64}`
  })
}
