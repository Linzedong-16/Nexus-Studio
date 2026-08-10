import { useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useKeybindingStore } from '@/store/keybindingStore'
import { getActionLabel, getActionRegistry } from '@/lib/keybinding/actionRegistry'
import KeybindingRecorderCell from './KeybindingRecorderCell'

/**
 * 快捷键设置表格：展示全部映射，支持新增与双击修改（KeybindingRecorderCell）
 */
export default function KeybindingsTab(): React.JSX.Element {
  const entries = useKeybindingStore((s) => s.entries)
  const startRecording = useKeybindingStore((s) => s.startRecording)
  const addEntry = useKeybindingStore((s) => s.addEntry)
  const removeEntry = useKeybindingStore((s) => s.removeEntry)
  const resetDefaults = useKeybindingStore((s) => s.resetDefaults)

  const [pendingActionId, setPendingActionId] = useState<string>('')

  const handleAdd = (): void => {
    if (!pendingActionId) return
    const id = addEntry(pendingActionId)
    setPendingActionId('')
    startRecording(id)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={pendingActionId} onValueChange={setPendingActionId}>
            <SelectTrigger size="sm" className="w-48">
              <SelectValue placeholder="选择要绑定的操作…" />
            </SelectTrigger>
            <SelectContent>
              {getActionRegistry().map((action) => (
                <SelectItem key={action.id} value={action.id}>
                  {action.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={!pendingActionId} onClick={handleAdd}>
            <Plus className="size-3.5" />
            添加快捷键映射
          </Button>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void resetDefaults()}>
          <RotateCcw className="size-3.5" />
          恢复默认
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>操作</TableHead>
            <TableHead>快捷键</TableHead>
            <TableHead className="w-9" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-[13px]">{getActionLabel(entry.actionId)}</TableCell>
              <TableCell>
                <KeybindingRecorderCell
                  entry={entry}
                  otherEntries={entries.filter((e) => e.id !== entry.id)}
                />
              </TableCell>
              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  title="删除"
                  onClick={() => void removeEntry(entry.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                暂无快捷键映射
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
