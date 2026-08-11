import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DEFAULT_LOG_PANEL_HEIGHT, MIN_LOG_PANEL_HEIGHT, useLogStore } from '@/store/logStore'
import { useShellStore } from '@/store/shellStore'
import type { DbLogEntry, DbLogLevel } from '@/types/ipc'

/** 与 TitleBar 的 h-10 对应，拖拽触顶时面板最多顶到标题栏下沿 */
const TITLEBAR_HEIGHT = 40
/** 松手时高度低于该值视为“拖拽收纳”，直接关闭面板 */
const CLOSE_DRAG_THRESHOLD = 80

const LEVEL_CLASS: Record<DbLogLevel, string> = {
  debug: 'text-muted-foreground',
  info: 'text-foreground',
  warn: 'text-yellow-500',
  error: 'text-destructive'
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}

function LogLine({ entry }: { entry: DbLogEntry }): React.JSX.Element {
  return (
    <div className={cn('flex gap-2 whitespace-pre-wrap break-all', LEVEL_CLASS[entry.level])}>
      <span className="shrink-0 text-muted-foreground">{formatTime(entry.timestamp)}</span>
      <span className="shrink-0 uppercase">[{entry.level}]</span>
      {entry.database && <span className="shrink-0 text-muted-foreground">[{entry.database}]</span>}
      <span>{entry.message}</span>
    </div>
  )
}

/**
 * 数据库日志面板（只读，Ctrl+J 底部滑出，参考 VSCode Database Client 输出面板）
 * 日志的拉取/订阅在 AppShell 完成，本组件只负责渲染与展开收起
 */
export default function LogPanel(): React.JSX.Element {
  const open = useLogStore((s) => s.open)
  const entries = useLogStore((s) => s.entries)
  const height = useLogStore((s) => s.height)
  const setOpen = useLogStore((s) => s.setOpen)
  const setHeight = useLogStore((s) => s.setHeight)
  const clear = useLogStore((s) => s.clear)
  const contentInsetLeft = useShellStore((s) => s.contentInsetLeft)
  const schemaTreeExtraWidth = useShellStore((s) => s.schemaTreeExtraWidth)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [open, entries])

  /** 上边缘拖拽：上移变高（可触顶），下移变矮直到低于阈值时收纳关闭 */
  const handleDragStart = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = height
    document.body.style.cursor = 'row-resize'

    const onMove = (moveEvent: MouseEvent): void => {
      const maxHeight = window.innerHeight - TITLEBAR_HEIGHT
      const next = startHeight + (startY - moveEvent.clientY)
      setHeight(Math.min(maxHeight, Math.max(0, next)))
    }

    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''

      const current = useLogStore.getState().height
      if (current < CLOSE_DRAG_THRESHOLD) {
        setOpen(false)
        setHeight(DEFAULT_LOG_PANEL_HEIGHT)
      } else if (current < MIN_LOG_PANEL_HEIGHT) {
        setHeight(MIN_LOG_PANEL_HEIGHT)
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{ height, left: contentInsetLeft + schemaTreeExtraWidth }}
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col border-t bg-card shadow-lg"
        >
          <div
            onMouseDown={handleDragStart}
            className="absolute inset-x-0 top-0 z-10 h-1.5 -translate-y-1/2 cursor-row-resize hover:bg-primary/50"
          />
          <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
            <span className="text-sm font-medium">数据库日志</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="size-7" onClick={clear} title="清空">
                <Trash2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setOpen(false)}
                title="关闭"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-5"
          >
            {entries.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">暂无日志</div>
            ) : (
              entries.map((entry) => <LogLine key={entry.id} entry={entry} />)
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
