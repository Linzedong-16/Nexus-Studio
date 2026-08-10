import { useState } from 'react'
import { cn } from '@/lib/utils'
import { KeyChips } from '@/components/ui/kbd'
import { useKeybindingStore } from '@/store/keybindingStore'
import { normalizeChord } from '@/lib/keybinding/chord'
import type { KeybindingEntry } from '@/types/keybinding'

const MAX_CHORDS = 2

interface KeybindingRecorderCellProps {
  entry: KeybindingEntry
  /** entries 中 conflict 校验需要看到全集，因此由父组件传入除自身以外的所有条目 */
  otherEntries: KeybindingEntry[]
}

function findConflictMessage(chords: string[], otherEntries: KeybindingEntry[]): string | null {
  for (const other of otherEntries) {
    const shorter = chords.length <= other.chords.length ? chords : other.chords
    const longer = chords.length <= other.chords.length ? other.chords : chords
    if (shorter.length === 0) continue
    const isPrefix = shorter.every((chord, idx) => chord === longer[idx])
    if (isPrefix) {
      return `与「${other.chords.join(', ')}」冲突`
    }
  }
  return null
}

/**
 * 双击进入录制态的快捷键单元格
 * 用可 focus 的 div 而非 input 捕获按键，避免 IME 干扰组合键；
 * Enter 确认 / Escape 取消（若取消时条目本身尚无 chords，说明是刚 addEntry 的新行，直接移除）
 * 已知限制：Enter/Escape 被保留为确认/取消操作，无法通过本录制器录制裸 Enter/Escape 快捷键
 */
export default function KeybindingRecorderCell({
  entry,
  otherEntries
}: KeybindingRecorderCellProps): React.JSX.Element {
  const recordingEntryId = useKeybindingStore((s) => s.recordingEntryId)
  const startRecording = useKeybindingStore((s) => s.startRecording)
  const stopRecording = useKeybindingStore((s) => s.stopRecording)
  const updateEntryChords = useKeybindingStore((s) => s.updateEntryChords)
  const removeEntry = useKeybindingStore((s) => s.removeEntry)

  const [draft, setDraft] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const isRecording = recordingEntryId === entry.id

  const beginRecording = (): void => {
    setDraft([])
    setError(null)
    startRecording(entry.id)
  }

  const cancelRecording = (): void => {
    // 防止 confirmRecording 成功后录制态 div 被卸载触发的 blur 重复处理（此时 recordingEntryId 已被清空）
    if (useKeybindingStore.getState().recordingEntryId !== entry.id) return
    stopRecording()
    setDraft([])
    setError(null)
    if (entry.chords.length === 0) {
      void removeEntry(entry.id)
    }
  }

  const confirmRecording = (): void => {
    if (draft.length === 0) return
    const conflict = findConflictMessage(draft, otherEntries)
    if (conflict) {
      setError(conflict)
      return
    }
    void updateEntryChords(entry.id, draft).then(() => {
      stopRecording()
      setDraft([])
      setError(null)
    })
  }

  const handleKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      cancelRecording()
      return
    }
    if (e.key === 'Enter') {
      confirmRecording()
      return
    }

    const chord = normalizeChord(e.nativeEvent)
    if (chord === null) return
    setError(null)
    setDraft((prev) => (prev.length >= MAX_CHORDS ? prev : [...prev, chord]))
  }

  if (!isRecording) {
    return (
      <div
        role="button"
        tabIndex={0}
        onDoubleClick={beginRecording}
        title="双击修改快捷键"
        className="flex h-7 w-fit min-w-24 cursor-pointer items-center rounded-md px-1.5 hover:bg-accent"
      >
        <KeyChips chords={entry.chords} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        role="textbox"
        tabIndex={0}
        autoFocus
        onKeyDownCapture={handleKeyDownCapture}
        onBlur={cancelRecording}
        className={cn(
          'flex h-7 w-fit min-w-32 items-center rounded-md border border-primary bg-primary/5 px-1.5 outline-none'
        )}
      >
        {draft.length > 0 ? (
          <KeyChips chords={draft} />
        ) : (
          <span className="text-xs text-muted-foreground">按下新组合键…</span>
        )}
      </div>
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : (
        <span className="text-[11px] text-muted-foreground">Enter 确认 · Escape 取消</span>
      )}
    </div>
  )
}
