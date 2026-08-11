/**
 * ER 图自动布局引擎
 *
 * 封装 elkjs 的 layered 分层算法，输入输出均为 React Flow 原生
 * Node/Edge 类型，调用方无需了解 ELK 的图结构。
 *
 * 使用 elk.bundled.js（同步、无 Web Worker 的浏览器构建），
 * 避免在渲染进程中处理 Worker 脚本的资源路径解析问题。
 */
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'
import type { Edge } from '@xyflow/react'
import type { ERTableNodeData, ERTableNodeType } from '../types'

const elk = new ELK()

/** 节点估算宽度（表卡片固定宽度） */
const NODE_WIDTH = 260
/** 表头高度 */
const HEADER_HEIGHT = 36
/** 每列行高 */
const ROW_HEIGHT = 24
/** 无列时的最小行数占位 */
const MIN_ROWS = 1

function estimateNodeHeight(data: ERTableNodeData): number {
  return HEADER_HEIGHT + Math.max(data.columns.length, MIN_ROWS) * ROW_HEIGHT
}

/**
 * 计算 ER 图节点的自动布局位置
 *
 * @param nodes 待布局的表节点（position 会被覆盖）
 * @param edges 外键连线，用于分层算法确定层级顺序
 * @returns 位置更新后的节点数组，顺序与输入一致
 */
export async function computeLayout(
  nodes: ERTableNodeType[],
  edges: Edge[]
): Promise<ERTableNodeType[]> {
  if (nodes.length === 0) return nodes

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.spacing.nodeNode': '64',
      'elk.edgeRouting': 'ORTHOGONAL'
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: estimateNodeHeight(node.data)
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target]
    }))
  }

  const layouted = await elk.layout(graph)
  const positionById = new Map(
    (layouted.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }])
  )

  return nodes.map((node) => ({
    ...node,
    position: positionById.get(node.id) ?? node.position
  }))
}
