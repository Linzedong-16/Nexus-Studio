/**
 * 快捷键归一化工具
 *
 * normalizeChord 依赖 e.key（而非 e.code），非 US 键盘布局下可能产生与预期不同的
 * chord 字符串——这是已知的 v1 限制，暂不在本次范围内解决。
 */
import type { ChordString } from '@/types/keybinding'

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

/** 部分按键的展示名归一化，未命中的单字符键统一转大写 */
const KEY_LABEL_OVERRIDES: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Escape',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete'
}

/** 归一化单次按键事件为固定顺序的 chord 字符串；纯修饰键按下返回 null */
export function normalizeChord(e: KeyboardEvent): ChordString | null {
  if (MODIFIER_KEYS.has(e.key)) return null

  const key = KEY_LABEL_OVERRIDES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  parts.push(key)

  return parts.join('+')
}

/** 判断当前焦点元素是否是文本输入场景（不应触发全局快捷键分发） */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  // Monaco（SQL 编辑器）自身处理快捷键（如 Ctrl+F），不应被全局分发器抢先截获
  if (el.closest('.monaco-editor')) return true
  return false
}
