/**
 * 自动化工作台
 *
 * 全局「自动化工作台」标签页内容，所有任务都在此管理。
 * 左侧：任务列表 + 新建按钮 + AI 编排入口
 * 右侧：任务详情 / 编辑器 / 运行历史
 */
import { useEffect } from 'react'
import { Timer, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTaskStore } from '@/store/taskStore'
import { TaskList } from './TaskList'
import { TaskEditor } from './TaskEditor'
import { TaskRunHistory } from './TaskRunHistory'

export default function TaskWorkbench(): React.JSX.Element {
  const fetchTasks = useTaskStore((s) => s.fetchTasks)
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const editingTaskId = useTaskStore((s) => s.editingTaskId)
  const isCreating = useTaskStore((s) => s.isCreating)
  const startCreating = useTaskStore((s) => s.startCreating)
  const handleStatusChange = useTaskStore((s) => s.handleStatusChange)

  // 加载任务列表
  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // 订阅主进程推送的任务状态变更
  useEffect(() => {
    const unsub = window.api.task.onStatusChange((payload) => {
      handleStatusChange(payload)
    })
    return unsub
  }, [handleStatusChange])

  const showEditor = isCreating || editingTaskId !== null

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左侧：任务列表 */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Timer className="size-4" />
            自动化任务
          </div>
          <div className="flex items-center gap-1">
            {/* AI 编排入口 */}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="AI 编排（自然语言描述自动生成任务）"
            >
              <Wand2 className="size-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={startCreating}>
              新建
            </Button>
          </div>
        </div>
        <TaskList />
      </div>

      {/* 右侧：详情 / 编辑 / 历史 */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {showEditor ? (
          <TaskEditor key={editingTaskId ?? 'new'} />
        ) : selectedTaskId ? (
          <TaskRunHistory taskId={selectedTaskId} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            选择左侧任务或新建任务
          </div>
        )}
      </div>
    </div>
  )
}
