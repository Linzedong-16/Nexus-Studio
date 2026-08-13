import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * 退出确认对话框：当用户关闭窗口时，若有定时任务正在运行，弹出确认框
 * 监听主进程推送的 task:confirm-close 事件
 */
export default function TaskCloseConfirmDialog(): React.JSX.Element {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const unsubscribe = window.api.task.onConfirmClose(() => {
      setOpen(true)
    })
    return () => unsubscribe()
  }, [])

  const handleConfirm = async (): Promise<void> => {
    setOpen(false)
    await window.api.task.forceClose()
  }

  const handleCancel = (): void => {
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            <DialogTitle>确认退出</DialogTitle>
          </div>
          <DialogDescription>
            有定时任务正在运行中，退出将取消所有正在执行的任务。确定要退出吗？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            退出
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
