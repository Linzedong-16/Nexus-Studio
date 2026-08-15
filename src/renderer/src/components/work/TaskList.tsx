/**
 * 任务列表组件
 *
 * 展示所有任务，支持选中、运行状态指示。
 */
import { Play, Pencil, PauseCircle, PlayCircle, Trash2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTaskStore } from '@/store/taskStore'
import { cn } from '@/lib/utils'
import type { ScheduledTask } from '@/types/task'

export function TaskList(): React.JSX.Element {
  const tasks = useTaskStore((s) => s.tasks)
  const loading = useTaskStore((s) => s.loading)
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const selectTask = useTaskStore((s) => s.selectTask)
  const startEditing = useTaskStore((s) => s.startEditing)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const runNow = useTaskStore((s) => s.runNow)
  const updateTask = useTaskStore((s) => s.updateTask)

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        加载中...
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
        <Clock className="size-8 opacity-30" />
        暂无任务，点击「新建」创建
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {tasks.map((task) => (
        <TaskListItem
          key={task.id}
          task={task}
          selected={selectedTaskId === task.id}
          onSelect={() => selectTask(task.id)}
          onEdit={() => startEditing(task.id)}
          onDelete={() => deleteTask(task.id)}
          onRunNow={() => runNow(task.id)}
          onTogglePause={() => updateTask({ id: task.id, enabled: !task.enabled })}
        />
      ))}
    </div>
  )
}

interface TaskListItemProps {
  task: ScheduledTask
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onRunNow: () => void
  onTogglePause: () => void
}

function TaskListItem({
  task,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onRunNow,
  onTogglePause
}: TaskListItemProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'group flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm transition-colors hover:bg-accent',
        selected && 'bg-accent'
      )}
      onClick={onSelect}
      onDoubleClick={onEdit}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <StatusDot status={task.lastRunStatus} />
          <span className="truncate text-xs font-medium">{task.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <TemplateLabel template={task.template} />
          <span>·</span>
          <span>{task.cronExpression}</span>
          {!task.enabled && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              已暂停
            </Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          title="手动执行"
          onClick={(e) => {
            e.stopPropagation()
            onRunNow()
          }}
        >
          <Play className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          title={task.enabled ? '暂停任务' : '启用任务'}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePause()
          }}
        >
          {task.enabled ? <PauseCircle className="size-3" /> : <PlayCircle className="size-3" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          title="编辑"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          title="删除"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  )
}

function StatusDot({ status }: { status?: string }): React.JSX.Element {
  const color =
    status === 'success'
      ? 'bg-green-500'
      : status === 'failed'
        ? 'bg-red-500'
        : status === 'running'
          ? 'bg-blue-500 animate-pulse'
          : 'bg-gray-300'
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', color)} />
}

function TemplateLabel({ template }: { template: string }): React.JSX.Element {
  const labels: Record<string, string> = {
    'sql-execute': 'SQL 执行',
    'data-export-csv': '导出 CSV',
    'data-export-json': '导出 JSON',
    'pg-dump': 'pg_dump'
  }
  return <span>{labels[template] ?? template}</span>
}
