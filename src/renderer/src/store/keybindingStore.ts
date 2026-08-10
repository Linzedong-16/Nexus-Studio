/**
 * 快捷键状态管理
 *
 * 数据源是主进程 JSON 文件而非 localStorage，因此不使用 zustand persist；
 * 每个改动动作在更新本地状态后立即调用 window.api.keybindings.saveAll 落盘。
 */
import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { ChordString, KeybindingActionId, KeybindingEntry } from '@/types/keybinding'

interface KeybindingStoreState {
  entries: KeybindingEntry[]
  loaded: boolean
  /** 当前处于录制态的条目 id；非 null 时全局分发器暂停响应 */
  recordingEntryId: string | null

  loadFromDisk: () => Promise<void>
  addEntry: (actionId: KeybindingActionId) => string
  updateEntryChords: (id: string, chords: ChordString[]) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  startRecording: (id: string) => void
  stopRecording: () => void
  resetDefaults: () => Promise<void>
}

export const useKeybindingStore = create<KeybindingStoreState>()((set, get) => ({
  entries: [],
  loaded: false,
  recordingEntryId: null,

  loadFromDisk: async () => {
    const entries = await window.api.keybindings.getAll()
    set({ entries, loaded: true })
  },

  addEntry: (actionId) => {
    const id = uuidv4()
    set((s) => ({ entries: [...s.entries, { id, actionId, chords: [] }] }))
    return id
  },

  updateEntryChords: async (id, chords) => {
    const nextEntries = get().entries.map((e) => (e.id === id ? { ...e, chords } : e))
    const saved = await window.api.keybindings.saveAll(nextEntries)
    set({ entries: saved })
  },

  removeEntry: async (id) => {
    const nextEntries = get().entries.filter((e) => e.id !== id)
    const saved = await window.api.keybindings.saveAll(nextEntries)
    set({ entries: saved })
  },

  startRecording: (id) => {
    set({ recordingEntryId: id })
  },

  stopRecording: () => {
    set({ recordingEntryId: null })
  },

  resetDefaults: async () => {
    const entries = await window.api.keybindings.resetDefaults()
    set({ entries })
  }
}))
