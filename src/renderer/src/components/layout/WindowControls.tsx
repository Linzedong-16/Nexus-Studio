import { useEffect } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { useShellStore } from '@/store/shellStore'
import { cn } from '@/lib/utils'

const btnClass =
  'flex h-10 w-11 items-center justify-center text-muted-foreground transition-colors [-webkit-app-region:no-drag]'

/**
 * 窗口控制按钮（FR-002）：最小化 / 最大化还原 / 关闭
 * 状态经 window:* IPC 与主进程双向同步（contracts/ipc-window.md）
 */
export default function WindowControls(): React.JSX.Element {
  const maximized = useShellStore((s) => s.windowMaximized)
  const setWindowMaximized = useShellStore((s) => s.setWindowMaximized)

  useEffect(() => {
    let disposed = false
    window.api.windowControls
      .isMaximized()
      .then((m) => {
        if (!disposed) setWindowMaximized(m)
      })
      .catch(console.error)
    const unsubscribe = window.api.windowControls.onMaximizedChange(setWindowMaximized)
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [setWindowMaximized])

  const handleToggleMaximize = (): void => {
    window.api.windowControls.toggleMaximize().then(setWindowMaximized).catch(console.error)
  }

  return (
    <div className="flex items-center">
      <button
        type="button"
        title="最小化"
        onClick={() => window.api.windowControls.minimize().catch(console.error)}
        className={cn(btnClass, 'hover:bg-accent hover:text-foreground')}
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        title={maximized ? '还原' : '最大化'}
        onClick={handleToggleMaximize}
        className={cn(btnClass, 'hover:bg-accent hover:text-foreground')}
      >
        {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
      </button>
      <button
        type="button"
        title="关闭"
        onClick={() => window.api.windowControls.close().catch(console.error)}
        className={cn(btnClass, 'hover:bg-red-600 hover:text-white')}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
