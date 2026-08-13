/**
 * 文件资源管理器领域类型
 *
 * 定义文件树节点结构，供 FileExplorer 面板及 store 使用。
 */

/** 文件树节点 */
export interface FileNode {
  /** 文件/目录名 */
  name: string
  /** 绝对路径 */
  path: string
  /** 是否为目录 */
  isDirectory: boolean
  /** 子节点（仅目录有值，懒加载前为 undefined） */
  children?: FileNode[]
}

/** 「最近」列表中的一条项目文件夹历史记录 */
export interface RecentProjectEntry {
  /** 项目文件夹绝对路径，唯一标识 */
  path: string
  /** 显示名称（文件夹名） */
  name: string
  /** 最后一次被使用（激活）的时间戳（毫秒） */
  lastUsedAt: number
}
