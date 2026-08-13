/**
 * 任务运行历史组件
 *
 * 展示选中任务的运行日志列表。
 */
import { Clock, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTaskStore } from '@/store/taskStore'
import { cn } from '@/lib/utils'

interface TaskRunHistoryProps {
  taskId: string
}

export function TaskRunHistory({ taskId }: TaskRunHistoryProps): React.JSX.Element {
  const tasks = useTaskStore((s) => s.tasks)
  const runNow = useTaskStore((s) => s.runNow)

  const task = tasks.find((t) => t.id === taskId)
  const logs = task?.runLogs ?? []

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        任务不存在
      </div>
    )
  }

  const handleRunNow = (): void => {
    runNow(taskId)
  }

  return (
    <div className="flex h-full flex-col">
      {/* 任务基本信息 */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">{task.name}</h2>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
              <StatusBadge status={task.lastRunStatus} />
              <span>{task.cronExpression}</span>
              {task.lastRunAt && <span>上次执行: {new Date(task.lastRunAt).toLocaleString()}</span>}
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleRunNow}>
            <Play className="size-3" />
            手动执行
          </Button>
        </div>
      </div>

      {/* 运行日志 */}
      <div className="flex-1 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Clock className="size-8 opacity-30" />
              暂无运行记录
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {[...logs].reverse().map((log) => (
              <div key={log.id} className="px-4 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <StatusBadge status={log.status} />
                  <span className="font-medium">
                    {log.status === 'success'
                      ? '成功'
                      : log.status === 'failed'
                        ? '失败'
                        : '运行中'}
                  </span>
                  {log.durationMs !== undefined && (
                    <span className="text-muted-foreground">· {log.durationMs}ms</span>
                  )}
                  {log.rowsAffected !== undefined && (
                    <span className="text-muted-foreground">· {log.rowsAffected} 行</span>
                  )}
                </div>
                <div className="mt-0.5 text-muted-foreground">
                  {new Date(log.startedAt).toLocaleString()}
                  {log.finishedAt && ` → ${new Date(log.finishedAt).toLocaleString()}`}
                </div>
                {log.error && (
                  <div className="mt-1 rounded bg-red-50 p-1.5 text-[10px] text-red-600 dark:bg-red-950 dark:text-red-400">
                    {log.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status?: string }): React.JSX.Element {
  if (!status)
    return (
      <Badge variant="secondary" className="h-4 px-1 text-[9px]">
        未执行
      </Badge>
    )
  const map: Record<string, { label: string; className: string }> = {
    success: {
      label: '成功',
      className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
    },
    failed: {
      label: '失败',
      className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    },
    running: {
      label: '运行中',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
    },
    idle: {
      label: '空闲',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
    }
  }
  const m = map[status] ?? { label: status, className: '' }
  return <Badge className={cn('h-4 px-1 text-[9px]', m.className)}>{m.label}</Badge>
}
