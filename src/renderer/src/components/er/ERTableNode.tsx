/**
 * ER 图自定义表节点
 *
 * 展示 schema.表名、列名/数据类型列表，主键列以图标标识，
 * 参与外键关系的列高亮显示。
 */
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { KeyRound, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ERTableNodeType } from './types'

function ERTableNode({ data }: NodeProps<ERTableNodeType>): React.JSX.Element {
  const { schema, tableName, columns, comment, foreignKeyColumnNames } = data

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      className="w-64 overflow-hidden rounded-md border border-border bg-card shadow-sm"
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <Handle type="source" position={Position.Right} className="!bg-primary" />

      <div
        className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-2.5 py-1.5"
        title={comment}
      >
        <Table2 className="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
        <span className="truncate text-xs font-medium text-foreground">{tableName}</span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{schema}</span>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {columns.map((column) => (
          <div
            key={column.name}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 text-[12px]',
              foreignKeyColumnNames.includes(column.name) && 'bg-amber-500/15 dark:bg-amber-500/20'
            )}
          >
            {column.isPrimaryKey ? (
              <KeyRound className="size-3 shrink-0 text-amber-500 dark:text-amber-400" />
            ) : (
              <span className="size-3 shrink-0" />
            )}
            <span
              className={cn('truncate', column.isPrimaryKey && 'font-semibold text-foreground')}
            >
              {column.name}
            </span>
            <span className="ml-auto shrink-0 truncate text-[11px] text-muted-foreground">
              {column.dataType}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

export default memo(ERTableNode)
