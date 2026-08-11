/**
 * 快捷键跨进程共享类型
 *
 * 与 src/renderer/src/types/ipc.ts 同类角色：在主进程（config/keybindingsStore.ts,
 * ipc/keybindings.ts）与渲染进程（store/keybindingStore.ts, preload）间共享。
 */

/** 归一化后的单段快捷键字符串，固定修饰键顺序，如 "Ctrl+B"、"Ctrl+Shift+B" */
export type ChordString = string

/** 内置动作 id；`(string & {})` 允许未来扩展而不破坏字面量补全 */
export type KeybindingActionId =
  | 'shell.toggleSidebar'
  | 'shell.openSearch'
  | 'shell.toggleSchemaTree'
  | 'shell.toggleLogPanel'
  | 'workspace.closeAllTabs'
  | (string & {})

/** 一条快捷键映射；chords 长度为 1 表示单段快捷键，长度为 2 表示两段式（如 Ctrl+K, Ctrl+W） */
export interface KeybindingEntry {
  id: string
  actionId: KeybindingActionId
  chords: ChordString[]
}

export interface KeybindingsFile {
  version: 1
  entries: KeybindingEntry[]
}
