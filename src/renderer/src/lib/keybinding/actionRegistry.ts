/**
 * 快捷键动作注册表
 *
 * run() 内部通过 getState() 在调用时取最新状态，而非在模块加载时解构，
 * 避免闭包捕获到过期的 store 引用。
 */
import { useShellStore } from '@/store/shellStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import type { KeybindingActionId } from '@/types/keybinding'

export interface KeybindingAction {
  id: KeybindingActionId
  label: string
  run: () => void
}

export function getActionRegistry(): KeybindingAction[] {
  return [
    {
      id: 'shell.toggleSidebar',
      label: '折叠/展开侧边栏',
      run: () => useShellStore.getState().toggleSidebar()
    },
    {
      id: 'shell.openSearch',
      label: '全局搜索',
      run: () => useShellStore.getState().setSearchOpen(true)
    },
    {
      id: 'shell.toggleSchemaTree',
      label: '折叠/展开结构树面板',
      run: () => useShellStore.getState().toggleSchemaTree()
    },
    {
      id: 'workspace.closeAllTabs',
      label: '关闭所有标签页',
      run: () => useWorkspaceStore.getState().closeAllTabs()
    }
  ]
}

export function getActionLabel(actionId: KeybindingActionId): string {
  return getActionRegistry().find((a) => a.id === actionId)?.label ?? actionId
}
