/**
 * ER 图渲染层专属类型
 *
 * 与跨进程共享类型（types/ipc.ts）分离：这里的类型只服务于
 * @xyflow/react 的节点/连线渲染，不参与 IPC 通信。
 */
import type { Node, Edge } from '@xyflow/react'
import type { ColumnInfo } from '@/types/ipc'

/** ER 表节点承载的数据 */
export type ERTableNodeData = {
  tableId: string
  schema: string
  tableName: string
  columns: ColumnInfo[]
  comment?: string
  /** 参与外键关系的列名集合，用于节点内高亮列 */
  foreignKeyColumnNames: string[]
}

/** ER 外键连线承载的数据 */
export type EREdgeData = {
  /** 外键约束名称，用于连线标签展示 */
  constraintName: string
}

export type ERTableNodeType = Node<ERTableNodeData>
export type EREdgeType = Edge<EREdgeData>
