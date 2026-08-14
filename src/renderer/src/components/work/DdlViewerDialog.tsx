import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useThemeStore } from '@/store/themeStore'
import type { DdlResult } from '@/types/ipc'

interface DdlViewerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 加载中为 null；加载失败时通过 error 展示 */
  result: DdlResult | null
  /** 加载/获取失败的错误信息 */
  error?: string | null
}

/**
 * DDL 查看弹框
 *
 * 展示表/视图的完整 DDL 文本（只读 Monaco 编辑器语法高亮），并提供一键复制。
 */
export default function DdlViewerDialog({
  open,
  onOpenChange,
  result,
  error
}: DdlViewerDialogProps): React.JSX.Element {
  const mode = useThemeStore((s) => s.mode)
  const [copied, setCopied] = useState(false)

  const handleCopy = (): void => {
    if (!result) return
    void navigator.clipboard.writeText(result.ddl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-3xl">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle>
            {result
              ? `${result.objectType === 'table' ? '表' : '视图'} DDL：${result.schema}.${result.name}`
              : '查看 DDL'}
          </DialogTitle>
          {result && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="size-8" onClick={handleCopy}>
                  <Copy className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{copied ? '已复制' : '复制'}</TooltipContent>
            </Tooltip>
          )}
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="h-[60vh] overflow-hidden rounded border">
            <Editor
              height="100%"
              language="pgsql"
              theme={mode === 'dark' ? 'vs-dark' : 'vs'}
              value={result?.ddl ?? ''}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on'
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
