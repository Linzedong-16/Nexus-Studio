import type { FileNode } from '../types/fileExplorer'

/**
 * 文件系统服务层
 *
 * 宪法 III：组件不直接调用 window.api，通过 Service 层封装
 * 封装 window.api.fs 全部调用，供 fileExplorerStore 使用
 */

export const fsService = {
  /** 唤起系统目录选择器，返回选中路径或 null */
  async pickFolder(): Promise<string | null> {
    return window.api.fs.pickFolder()
  },

  /** 读取目录内容（排除隐藏文件），返回直接子节点 */
  async readDir(dirPath: string): Promise<FileNode[]> {
    return window.api.fs.readDir(dirPath)
  },

  /** 读取文件内容（UTF-8） */
  async readFile(filePath: string): Promise<string> {
    return window.api.fs.readFile(filePath)
  },

  /** 写入文件内容（UTF-8） */
  async writeFile(filePath: string, content: string): Promise<void> {
    return window.api.fs.writeFile(filePath, content)
  },

  /** 在系统文件管理器中定位文件 */
  async showItemInFolder(filePath: string): Promise<void> {
    return window.api.fs.showItemInFolder(filePath)
  },

  /** 检查文件是否存在 */
  async fileExists(filePath: string): Promise<boolean> {
    return window.api.fs.fileExists(filePath)
  },

  /** 在指定目录下新建空文件，同名条目已存在时抛错 */
  async createFile(parentDir: string, name: string): Promise<string> {
    return window.api.fs.createFile(parentDir, name)
  },

  /** 在指定目录下新建空文件夹，同名条目已存在时抛错 */
  async createDirectory(parentDir: string, name: string): Promise<string> {
    return window.api.fs.createDirectory(parentDir, name)
  },

  /** 重命名文件或文件夹（同目录内改名），目标名称冲突或原路径不存在时抛错 */
  async rename(oldPath: string, newName: string): Promise<string> {
    return window.api.fs.rename(oldPath, newName)
  },

  /** 删除文件或文件夹（移入系统回收站，可恢复） */
  async deleteItem(path: string): Promise<void> {
    return window.api.fs.deleteItem(path)
  },

  /** 将文件或文件夹移动到目标目录下，目标已有同名条目或目标是源自身/子孙目录时抛错 */
  async moveItem(sourcePath: string, targetDirPath: string): Promise<string> {
    return window.api.fs.moveItem(sourcePath, targetDirPath)
  },

  /** 安全读取文件：先探测是否为二进制文件，二进制文件不读取全文内容 */
  async readFileSafe(path: string): Promise<{ isBinary: boolean; content?: string }> {
    return window.api.fs.readFileSafe(path)
  }
}
