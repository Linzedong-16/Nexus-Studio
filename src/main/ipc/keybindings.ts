import { createIPCHandler } from './utils'
import { keybindingsStore, DEFAULT_KEYBINDINGS } from '../config/keybindingsStore'
import type { KeybindingEntry } from '../../renderer/src/types/keybinding'

/**
 * 快捷键配置 IPC 处理器
 *
 * 全量读写（而非按条目增删改）：条目数量很少，且冲突校验本身就需要看到全集，
 * 全量 saveAll 最简单，避免引入 ID 竞争和局部合并逻辑。
 */

/** 校验条目集合内部无冲突：不同 action 的 chords 完全相同，或一条是另一条的严格前缀 */
function findConflict(entries: KeybindingEntry[]): string | null {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]
      const b = entries[j]
      if (a.actionId === b.actionId) continue
      const shorter = a.chords.length <= b.chords.length ? a.chords : b.chords
      const longer = a.chords.length <= b.chords.length ? b.chords : a.chords
      const isPrefix = shorter.every((chord, idx) => chord === longer[idx])
      if (isPrefix && shorter.length > 0) {
        return `快捷键「${shorter.join(', ')}」与「${longer.join(', ')}」存在冲突`
      }
    }
  }
  return null
}

export function registerKeybindingsIPC(): void {
  createIPCHandler<[], KeybindingEntry[]>('keybindings:get-all', async () => {
    return keybindingsStore.get('entries')
  })

  createIPCHandler<[KeybindingEntry[]], KeybindingEntry[]>(
    'keybindings:save-all',
    async (entries) => {
      const conflict = findConflict(entries)
      if (conflict) {
        throw new Error(conflict)
      }
      keybindingsStore.set('entries', entries)
      return entries
    }
  )

  createIPCHandler<[], KeybindingEntry[]>('keybindings:reset-defaults', async () => {
    keybindingsStore.set('entries', DEFAULT_KEYBINDINGS)
    return DEFAULT_KEYBINDINGS
  })
}
