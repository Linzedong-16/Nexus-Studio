import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updaterService } from '@/services/updaterService'
import type { UpdateStatus } from '@/types/updater'

interface NoticeProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
}

/** 右下角非模态提示卡片 */
function Notice({
  title,
  description,
  actionLabel,
  onAction,
  onDismiss
}: NoticeProps): React.JSX.Element {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <button
          type="button"
          title="关闭"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {actionLabel && onAction && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * 更新提示浮层
 *
 * 静默检测到新版本或下载完成时，右下角弹出非模态提示；
 * 检查失败等场景不打扰用户，仅在"关于"对话框的检查更新区域可见。
 */
export default function UpdateNotifier(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    return updaterService.onStatusChange((next) => {
      setStatus((prev) => {
        if (prev.state !== next.state) setDismissed(false)
        return next
      })
    })
  }, [])

  if (dismissed) return null

  switch (status.state) {
    case 'available':
      return (
        <Notice
          title={`发现新版本 v${status.version}`}
          description="点击下载，后台获取更新包，下载完成会再次提示重启安装。"
          actionLabel="下载更新"
          onAction={() => updaterService.download()}
          onDismiss={() => setDismissed(true)}
        />
      )
    case 'downloading':
      return (
        <Notice title={`正在下载更新… ${status.percent}%`} onDismiss={() => setDismissed(true)} />
      )
    case 'downloaded':
      return (
        <Notice
          title={`新版本 v${status.version} 已下载`}
          description="重启应用后即可完成安装。"
          actionLabel="重启并安装"
          onAction={() => updaterService.install()}
          onDismiss={() => setDismissed(true)}
        />
      )
    default:
      return null
  }
}
