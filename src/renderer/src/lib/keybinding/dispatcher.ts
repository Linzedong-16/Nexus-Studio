/**
 * 全局快捷键分发器
 *
 * 单一 capture-phase keydown 监听器；维护一个跨按键的 chord 缓冲区，
 * 按前缀匹配全部条目的 chords 数组，支持 VS Code 风格的两段式快捷键
 * （如 Ctrl+K, Ctrl+W）。歧义（同序列绑定不同 action / 序列互为前缀）
 * 在保存时（渲染进程录制 UI + 主进程 IPC）已被拒绝，运行时无需处理。
 */
import { useKeybindingStore } from '@/store/keybindingStore'
import { getActionRegistry } from './actionRegistry'
import { normalizeChord, isTypingTarget } from './chord'
import type { ChordString } from '@/types/keybinding'

const CHORD_TIMEOUT_MS = 1500

export function installGlobalKeybindingDispatcher(): () => void {
  let pendingChords: ChordString[] = []
  let pendingTimer: ReturnType<typeof setTimeout> | null = null

  const clearPending = (): void => {
    pendingChords = []
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }
  }

  const handler = (e: KeyboardEvent): void => {
    if (useKeybindingStore.getState().recordingEntryId !== null) return
    if (isTypingTarget(document.activeElement)) return

    const chord = normalizeChord(e)
    if (chord === null) return

    pendingChords = [...pendingChords, chord]
    if (pendingTimer !== null) clearTimeout(pendingTimer)

    const entries = useKeybindingStore.getState().entries
    const candidates = entries.filter(
      (entry) =>
        entry.chords.length >= pendingChords.length &&
        pendingChords.every((c, i) => entry.chords[i] === c)
    )

    if (candidates.length === 0) {
      clearPending()
      return
    }

    const exactMatch = candidates.find((entry) => entry.chords.length === pendingChords.length)
    if (exactMatch) {
      e.preventDefault()
      const action = getActionRegistry().find((a) => a.id === exactMatch.actionId)
      action?.run()
      clearPending()
      return
    }

    // 是更长序列的严格前缀（如刚按下 Ctrl+K），阻止事件泄漏，等待下一段
    e.preventDefault()
    pendingTimer = setTimeout(clearPending, CHORD_TIMEOUT_MS)
  }

  document.addEventListener('keydown', handler, true)
  return () => {
    document.removeEventListener('keydown', handler, true)
    clearPending()
  }
}
