import { useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type ValueFormat = 'plain' | 'json'

interface LargeValueEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValue: string
  /** 支持返回 Promise：保存失败时抛出的错误会内联展示，弹框保持打开以便重试 */
  onSave: (value: string) => void | Promise<void>
}

/**
 * 大文本 / JSON 编辑弹框
 *
 * 供 AddRowDialog 的放大镜入口、表格单元格编辑复用：用更大的文本域编辑单个字段的值，
 * 并在选择 JSON 格式时做合法性校验。不感知自己在编辑表单里的哪一列，
 * 通过 initialValue/onSave 与父组件桥接，保持可复用。
 */
export default function LargeValueEditorDialog({
  open,
  onOpenChange,
  initialValue,
  onSave
}: LargeValueEditorDialogProps): React.JSX.Element {
  const [format, setFormat] = useState<ValueFormat>('plain')
  const [text, setText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  // 弹框由关闭切换为打开时，以 initialValue 重置一次内部状态
  // （渲染期间的状态调整，而非副作用，避免额外的一次级联重渲染）
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setText(initialValue)
      try {
        JSON.parse(initialValue)
        setFormat('json')
      } catch {
        setFormat('plain')
      }
      setJsonError(null)
      setSaveError(null)
    }
  }

  const handleTextChange = (value: string): void => {
    setText(value)
    if (format !== 'json') return
    try {
      JSON.parse(value)
      setJsonError(null)
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'JSON 格式不合法')
    }
  }

  const handleFormatChange = (value: ValueFormat): void => {
    setFormat(value)
    if (value !== 'json') {
      setJsonError(null)
      return
    }
    try {
      JSON.parse(text)
      setJsonError(null)
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'JSON 格式不合法')
    }
  }

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(text)
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(text)
      onOpenChange(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>编辑数据</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Select value={format} onValueChange={(v) => handleFormatChange(v as ValueFormat)}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plain">Plain</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="size-8" onClick={handleCopy}>
                <Copy className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">复制</TooltipContent>
          </Tooltip>
        </div>

        <Textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          aria-invalid={format === 'json' && jsonError !== null}
          className="h-72 resize-none font-mono text-xs"
          spellCheck={false}
        />

        {format === 'json' && jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
        {saveError && <p className="text-xs text-destructive">{saveError}</p>}

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || (format === 'json' && jsonError !== null)}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
