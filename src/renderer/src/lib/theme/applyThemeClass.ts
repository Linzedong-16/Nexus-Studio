import { useThemeStore, type ThemeMode } from '@/store/themeStore'

/**
 * 根据主题模式增删 <html> 的 dark class，驱动 main.css 中 :root / .dark 令牌切换
 */
export function applyThemeClass(mode: ThemeMode): void {
  document.documentElement.classList.toggle('dark', mode === 'dark')
}

// 启动时立即同步一次，避免默认浅色 class 与已持久化的暗色偏好之间出现闪烁（FOUC）
applyThemeClass(useThemeStore.getState().mode)

// 后续每次 mode 变化都同步 class
useThemeStore.subscribe((state) => {
  applyThemeClass(state.mode)
})
