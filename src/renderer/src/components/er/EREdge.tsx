/**
 * ER 图外键连线组件
 *
 * 默认灰色细线，hover/选中态变为主题蓝并加粗；终点带实心箭头；
 * 连线中点以 pill 样式标签展示约束名缩写，hover 时展开完整名称。
 */
import { memo, useState } from 'react'
import { EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { EREdgeType } from './types'

const DEFAULT_COLOR = '#94a3b8'
const ACTIVE_COLOR = '#3b82f6'

/** 将外键约束名缩写为适合连线标签展示的短文本 */
function abbreviateConstraintName(name: string): string {
  const stripped = name.replace(/^(fk_|fkey_)/i, '')
  return stripped.length > 14 ? `${stripped.slice(0, 12)}…` : stripped
}

function EREdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  data
}: EdgeProps<EREdgeType>): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 6
  })

  const constraintName = data?.constraintName ?? id
  const active = hovered || selected

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <motion.path
        d={edgePath}
        fill="none"
        stroke={active ? ACTIVE_COLOR : DEFAULT_COLOR}
        strokeWidth={active ? 2.5 : 1.5}
        markerEnd={markerEnd}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        style={{ pointerEvents: 'none' }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`
          }}
          title={constraintName}
          className={cn(
            'pointer-events-none rounded-full border bg-background/90 px-1.5 py-0.5 text-[10px] whitespace-nowrap shadow-sm transition-colors',
            active ? 'border-primary text-primary' : 'border-border text-muted-foreground'
          )}
        >
          {hovered ? constraintName : abbreviateConstraintName(constraintName)}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export default memo(EREdge)
