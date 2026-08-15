import { existsSync } from 'node:fs'
import { open, readFile, stat } from 'node:fs/promises'
import { z } from 'zod'
import type { ToolDefinition } from './types'

/**
 * 文件类工具：只读读取本地文本文件内容，供模型感知用户在对话中引用的文件/项目文件；
 * 读取范围限定在当前打开的项目目录内，且不支持二进制文件
 */

/** 单次返回的文件内容字符数上限，超出则截断（约为 reactLoop.ts MAX_CONTEXT_TOKENS 的 15%） */
const MAX_CONTENT_CHARS = 30_000

/** 二进制探测读取的字节数，与 `src/main/ipc/fs.ts` 的 `fs:read-file-safe` 采用同一阈值 */
const BINARY_PROBE_SIZE = 8192

const readFileSchema = z.object({
  path: z.string().min(1),
  /** 由 reactLoop.ts 的 processBatch 在真正调用前自动注入当前项目根目录，模型不需要填写 */
  projectRoot: z.string().nullable().optional()
})

/** 判断 targetPath 是否为 rootPath 自身或其子孙路径（与 fileExplorerStore.ts 的 isSelfOrDescendant 同款逻辑） */
function isWithinRoot(rootPath: string, targetPath: string): boolean {
  if (targetPath === rootPath) return true
  return targetPath.startsWith(`${rootPath}/`) || targetPath.startsWith(`${rootPath}\\`)
}

/** 读取文件前 8KB 探测是否含空字节，用于判定是否为二进制文件 */
async function isBinaryFile(path: string): Promise<boolean> {
  const fd = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(BINARY_PROBE_SIZE)
    const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).includes(0)
  } finally {
    await fd.close()
  }
}

/**
 * 读取用户引用或提及的本地文本文件内容
 *
 * @example
 * await toolRegistry.invoke('file.readFile', { path: '/project/init.sql', projectRoot: '/project' })
 * @throws 未打开项目、路径越界、文件不存在、目标是文件夹或文件为二进制格式时抛出
 */
export const readFileTool: ToolDefinition<
  z.infer<typeof readFileSchema>,
  { path: string; content: string; truncated: boolean; totalChars: number }
> = {
  name: 'file.readFile',
  description: '读取用户引用或提及的本地文本文件内容，仅限当前项目目录内、非二进制文件',
  mutates: false,
  inputSchema: readFileSchema,
  async execute({ path, projectRoot }) {
    if (!projectRoot || !isWithinRoot(projectRoot, path)) {
      throw new Error('该文件不在当前打开的项目目录内，无法读取')
    }
    if (!existsSync(path)) {
      throw new Error('文件不存在')
    }
    const stats = await stat(path)
    if (stats.isDirectory()) {
      throw new Error('目标是文件夹，无法读取内容')
    }
    if (await isBinaryFile(path)) {
      throw new Error('不支持读取二进制文件')
    }
    const content = await readFile(path, 'utf-8')
    if (content.length > MAX_CONTENT_CHARS) {
      return {
        path,
        content:
          content.slice(0, MAX_CONTENT_CHARS) +
          `\n\n[内容已截断：文件总长度 ${content.length} 字符，仅展示前 ${MAX_CONTENT_CHARS} 字符]`,
        truncated: true,
        totalChars: content.length
      }
    }
    return { path, content, truncated: false, totalChars: content.length }
  }
}

export const fileTools: ToolDefinition[] = [readFileTool]
