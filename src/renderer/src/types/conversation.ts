/**
 * 对话引用类型
 *
 * 用户在 Code 模式下右键将文件/数据库对象以引用形式添加到对话中。
 * 当前阶段仅完成 UI 实现，多轮对话与 AI SDK 对接在后续迭代进行。
 */

/** 可引用的实体类型 */
export type ReferenceType = 'file' | 'connection' | 'database' | 'schema' | 'table' | 'moduleGroup'

/** 对话引用实体 */
export interface ConversationReference {
  /** 唯一标识（如文件路径、connectionId/database/schema 组合） */
  id: string
  /** 实体类型 */
  type: ReferenceType
  /** 显示名称 */
  label: string
  /** 附加描述（如文件路径、数据库名等） */
  detail?: string
  /** 添加时间戳 */
  timestamp: number
}
