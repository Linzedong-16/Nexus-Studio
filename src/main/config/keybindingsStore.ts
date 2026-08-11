/**
 * 快捷键持久化
 *
 * 与 configStore（src/main/config/store.ts）同用 electron-store，
 * 区别仅在于 cwd 指向 resolveKeybindingsPath() 解析出的目录（见该文件注释）。
 */
import Store from 'electron-store'
import { dirname, basename } from 'path'
import { resolveKeybindingsPath } from './keybindingsPath'
import type { KeybindingEntry, KeybindingsFile } from '../../renderer/src/types/keybinding'

export const DEFAULT_KEYBINDINGS: KeybindingEntry[] = [
  { id: 'default-toggle-sidebar', actionId: 'shell.toggleSidebar', chords: ['Ctrl+B'] },
  { id: 'default-open-search', actionId: 'shell.openSearch', chords: ['Ctrl+F'] },
  {
    id: 'default-close-all-tabs',
    actionId: 'workspace.closeAllTabs',
    chords: ['Ctrl+K', 'Ctrl+W']
  },
  {
    id: 'default-toggle-schema-tree',
    actionId: 'shell.toggleSchemaTree',
    chords: ['Ctrl+Shift+B']
  },
  {
    id: 'default-toggle-log-panel',
    actionId: 'shell.toggleLogPanel',
    chords: ['Ctrl+J']
  }
]

const defaults: KeybindingsFile = {
  version: 1,
  entries: DEFAULT_KEYBINDINGS
}

function createStore(path: string): Store<KeybindingsFile> {
  return new Store<KeybindingsFile>({
    cwd: dirname(path),
    name: basename(path, '.json'),
    defaults,
    clearInvalidConfig: true
  })
}

function initStore(): Store<KeybindingsFile> {
  const path = resolveKeybindingsPath()
  try {
    return createStore(path)
  } catch {
    // 安装目录在探测可写之后到实际写入之间变为不可写，回退到用户数据目录避免启动崩溃
    return new Store<KeybindingsFile>({
      name: 'keybindings',
      defaults,
      clearInvalidConfig: true
    })
  }
}

export const keybindingsStore = initStore()

// 迁移：electron-store 的 defaults 只在文件不存在时生效，
// 老用户已持久化的 entries 不会自动获得后续新增的默认快捷键，需在启动时补齐
function backfillMissingDefaults(): void {
  const entries = keybindingsStore.get('entries')
  const existingActionIds = new Set(entries.map((e) => e.actionId))
  const missing = DEFAULT_KEYBINDINGS.filter((d) => !existingActionIds.has(d.actionId))
  if (missing.length > 0) {
    keybindingsStore.set('entries', [...entries, ...missing])
  }
}
backfillMissingDefaults()
