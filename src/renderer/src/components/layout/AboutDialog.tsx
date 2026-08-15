import { Copy, Check, RefreshCw } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useShellStore } from '@/store/shellStore'
import { updaterService } from '@/services/updaterService'
import type { AppVersions } from '@/types/ipc'
import type { UpdateStatus } from '@/types/updater'

/** 各信息项展示的标签映射 */
const LABELS: Record<keyof AppVersions, string> = {
  appName: '产品',
  appVersion: '版本',
  electron: 'Electron',
  node: 'Node.js',
  chrome: 'Chrome',
  v8: 'V8',
  os: 'OS'
}

/** 复制按钮组件 */
function CopyButton({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 降级：静默失败
    }
  }, [text])

  return (
    <button
      type="button"
      title="复制"
      onClick={handleCopy}
      className="ml-2 flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}

/** 更新状态对应的展示文案 */
function describeStatus(status: UpdateStatus): string {
  switch (status.state) {
    case 'checking':
      return '正在检查更新…'
    case 'available':
      return `发现新版本 v${status.version}`
    case 'not-available':
      return '已是最新版本'
    case 'downloading':
      return `正在下载更新… ${status.percent}%`
    case 'downloaded':
      return `新版本 v${status.version} 已下载，重启后生效`
    case 'error':
      return `检查更新失败：${status.message}`
    case 'idle':
      return ''
  }
}

/** 检查更新区域：展示当前状态，按状态驱动下一步操作 */
function UpdateSection(): React.JSX.Element {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    return updaterService.onStatusChange(setStatus)
  }, [])

  const handleAction = useCallback(() => {
    switch (status.state) {
      case 'available':
        updaterService.download()
        return
      case 'downloaded':
        updaterService.install()
        return
      default:
        setStatus({ state: 'checking' })
        updaterService.check()
    }
  }, [status.state])

  const busy = status.state === 'checking' || status.state === 'downloading'
  const actionLabel =
    status.state === 'available'
      ? '下载更新'
      : status.state === 'downloaded'
        ? '重启并安装'
        : '检查更新'

  return (
    <div className="flex items-center justify-between border-t pt-3 text-sm">
      <span className="text-muted-foreground">{describeStatus(status) || '有更新会在此提示'}</span>
      <Button variant="outline" size="sm" disabled={busy} onClick={handleAction}>
        <RefreshCw className={`mr-1.5 size-3.5 ${busy ? 'animate-spin' : ''}`} />
        {actionLabel}
      </Button>
    </div>
  )
}

/**
 * 关于 Nexus Studio 对话框
 * 仿 VS Code 风格展示应用版本、Electron / Node / Chrome / V8 版本及操作系统信息
 */
export default function AboutDialog(): React.JSX.Element {
  const aboutOpen = useShellStore((s) => s.aboutOpen)
  const setAboutOpen = useShellStore((s) => s.setAboutOpen)
  const [versions, setVersions] = useState<AppVersions | null>(null)

  useEffect(() => {
    // 仅在对话框打开时获取版本信息
    if (aboutOpen) {
      window.api.app
        .getVersions()
        .then(setVersions)
        .catch(() => setVersions(null))
    }
  }, [aboutOpen])

  const handleCopyAll = useCallback(async () => {
    if (!versions) return
    const text = Object.entries(LABELS)
      .map(([key, label]) => `${label}: ${versions[key as keyof AppVersions]}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 降级：静默失败
    }
  }, [versions])

  return (
    <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>关于 Nexus Studio</DialogTitle>
        </DialogHeader>

        {versions ? (
          <div className="space-y-2 text-sm">
            {Object.entries(LABELS).map(([key, label]) => (
              <div key={key} className="group flex items-center">
                <span className="w-20 shrink-0 text-muted-foreground">{label}:</span>
                <span className="select-all truncate">{versions[key as keyof AppVersions]}</span>
                <CopyButton text={versions[key as keyof AppVersions]} />
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-sm text-muted-foreground">加载中...</div>
        )}

        <UpdateSection />

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleCopyAll}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            复制全部信息
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
