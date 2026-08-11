/**
 * ER 分析标签页根组件
 *
 * 数据流：queryService.getSchemas → queryService.getErDiagramData →
 * 转换为 React Flow 节点/连线（聚合外键列到 foreignKeyColumnNames）→
 * ERLayoutEngine.computeLayout 计算初始位置 → 渲染画布。
 *
 * 节点拖拽位置与布局中标志存于 erStore（按 tabId 隔离），
 * 标签页真正关闭时清理（见 workspaceStore 的关闭动作），避免多标签页状态互相污染或无限堆积。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getNodesBounds,
  getViewportForBounds,
  type NodeChange
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { queryService } from '@/services/queryService'
import { useErStore } from '@/store/erStore'
import type { ErAnalysisTabState, WorkspaceTab } from '@/types/workspace'
import { computeLayout } from './layout/ERLayoutEngine'
import EREdge from './EREdge'
import ERTableNode from './ERTableNode'
import ERToolbar from './ERToolbar'
import type { EREdgeType, ERTableNodeType } from './types'

interface ERDiagramProps {
  tab: WorkspaceTab
}

const NODE_TYPES = { erTable: ERTableNode }
const EDGE_TYPES = { erFk: EREdge }

function makeTableId(schema: string, name: string): string {
  return `${schema}.${name}`
}

export default function ERDiagram({ tab }: ERDiagramProps): React.JSX.Element {
  const state = tab.state as ErAnalysisTabState
  const savedPositions = useErStore((s) => s.nodePositions[tab.id])
  const isLayouting = useErStore((s) => s.isLayouting[tab.id] ?? false)
  const setNodePositions = useErStore((s) => s.setNodePositions)
  const setLayouting = useErStore((s) => s.setLayouting)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tableCount, setTableCount] = useState(0)
  const [foreignKeyCount, setForeignKeyCount] = useState(0)
  const [nodes, setNodes] = useState<ERTableNodeType[]>([])
  const [edges, setEdges] = useState<EREdgeType[]>([])
  const [layoutTransition, setLayoutTransition] = useState(false)

  const requestSeqRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (): Promise<void> => {
    if (loading && requestSeqRef.current > 0) return
    const seq = ++requestSeqRef.current
    setLoading(true)
    setError(null)
    try {
      const schemas = await queryService.getSchemas(state.connectionId, state.database)
      const erData = await queryService.getErDiagramData(
        state.connectionId,
        state.database,
        schemas.map((s) => s.name)
      )
      if (requestSeqRef.current !== seq) return

      const fkColumnsByTable = new Map<string, Set<string>>()
      for (const fk of erData.foreignKeys) {
        const key = makeTableId(fk.sourceSchema, fk.sourceTable)
        const set = fkColumnsByTable.get(key) ?? new Set<string>()
        fk.sourceColumns.forEach((c) => set.add(c))
        fkColumnsByTable.set(key, set)
      }

      const rawNodes: ERTableNodeType[] = erData.tables.map((table) => {
        const id = makeTableId(table.schema, table.name)
        return {
          id,
          type: 'erTable',
          position: savedPositions?.[id] ?? { x: 0, y: 0 },
          data: {
            tableId: id,
            schema: table.schema,
            tableName: table.name,
            columns: table.columns,
            comment: table.comment,
            foreignKeyColumnNames: Array.from(fkColumnsByTable.get(id) ?? [])
          }
        }
      })
      const rawEdges: EREdgeType[] = erData.foreignKeys.map((fk) => ({
        id: fk.constraintName,
        type: 'erFk',
        source: makeTableId(fk.sourceSchema, fk.sourceTable),
        target: makeTableId(fk.targetSchema, fk.targetTable),
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 16, height: 16 },
        data: { constraintName: fk.constraintName }
      }))

      let positionedNodes = rawNodes
      if (!savedPositions && rawNodes.length > 0) {
        setLayouting(tab.id, true)
        try {
          positionedNodes = await computeLayout(rawNodes, rawEdges)
        } finally {
          setLayouting(tab.id, false)
        }
      }
      if (requestSeqRef.current !== seq) return

      setTableCount(erData.tables.length)
      setForeignKeyCount(erData.foreignKeys.length)
      setNodes(positionedNodes)
      setEdges(rawEdges)
    } catch (err) {
      if (requestSeqRef.current !== seq) return
      setError(err instanceof Error ? err.message : 'ER 分析数据加载失败')
    } finally {
      if (requestSeqRef.current === seq) setLoading(false)
    }
    // savedPositions 仅在首次加载时读取一次，用于恢复布局；变化不应重新触发整体加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.connectionId, state.database, tab.id, setLayouting])

  useEffect(() => {
    // 挂载时拉取 ER 分析数据，需要立即置为加载中；这是标准的数据获取场景
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    // 仅在标签页挂载/卸载时执行一次；erStore 状态清理见 workspaceStore 的标签页关闭动作
    // （切换到另一个 ER 标签页也会走到这里的卸载分支，此处不能清理状态，否则会误删仍在使用的标签页数据）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  const handleNodesChange = useCallback((changes: NodeChange<ERTableNodeType>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev))
  }, [])

  const handleNodeDragStop = useCallback(() => {
    setNodes((current) => {
      const positions: Record<string, { x: number; y: number }> = {}
      for (const node of current) positions[node.id] = node.position
      setNodePositions(tab.id, positions)
      return current
    })
  }, [tab.id, setNodePositions])

  const handleAutoLayout = useCallback(async (): Promise<void> => {
    if (nodes.length === 0) return
    setLayouting(tab.id, true)
    try {
      const positioned = await computeLayout(nodes, edges)
      setLayoutTransition(true)
      setNodes(positioned)
      const positions: Record<string, { x: number; y: number }> = {}
      for (const node of positioned) positions[node.id] = node.position
      setNodePositions(tab.id, positions)
      setTimeout(() => setLayoutTransition(false), 320)
    } finally {
      setLayouting(tab.id, false)
    }
  }, [nodes, edges, tab.id, setLayouting, setNodePositions])

  const handleExport = useCallback((): void => {
    const viewportEl = containerRef.current?.querySelector<HTMLElement>('.react-flow__viewport')
    if (!viewportEl || nodes.length === 0) return
    const imageWidth = 1600
    const imageHeight = 1200
    const bounds = getNodesBounds(nodes)
    const { x, y, zoom } = getViewportForBounds(bounds, imageWidth, imageHeight, 0.2, 2, 0.1)
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue('--background')
      .trim()
    void toPng(viewportEl, {
      backgroundColor: background || undefined,
      width: imageWidth,
      height: imageHeight,
      style: {
        width: `${imageWidth}px`,
        height: `${imageHeight}px`,
        transform: `translate(${x}px, ${y}px) scale(${zoom})`
      }
    }).then((dataUrl) => {
      const link = document.createElement('a')
      link.download = `${state.database}-er-diagram.png`
      link.href = dataUrl
      link.click()
    })
  }, [nodes, state.database])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        正在加载 ER 分析数据…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="max-w-md text-center text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
          <RefreshCw className="size-3.5" />
          重试
        </Button>
      </div>
    )
  }

  if (tableCount === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        该数据库暂无表
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-full w-full',
        layoutTransition && '[&_.react-flow\\_\\_node]:transition-transform [&_.react-flow\\_\\_node]:duration-300 [&_.react-flow\\_\\_node]:ease-out'
      )}
    >
      {foreignKeyCount === 0 && (
        <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-1 text-xs text-muted-foreground shadow-sm">
          未发现关联关系
        </div>
      )}
      <ERToolbar
        onAutoLayout={() => void handleAutoLayout()}
        onExport={handleExport}
        isLayouting={isLayouting}
      />
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={handleNodesChange}
          onNodeDragStop={handleNodeDragStop}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}
