import { Moon, Sun } from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'
import { runThemeTransition } from '@/lib/theme/viewTransition'

interface ThemeToggleButtonProps {
  className?: string
}

/**
 * 亮暗模式切换按钮：点击位置作为扩散动画圆心（FR-005）
 */
export default function ThemeToggleButton({
  className = ''
}: ThemeToggleButtonProps): React.JSX.Element {
  const mode = useThemeStore((s) => s.mode)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    runThemeTransition(x, y, () => useThemeStore.getState().toggle())
  }

  return (
    <button
      type="button"
      title={mode === 'dark' ? '切换到浅色模式' : '切换到暗色模式'}
      aria-label={mode === 'dark' ? '切换到浅色模式' : '切换到暗色模式'}
      onClick={handleClick}
      className={className}
    >
      {mode === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  )
}
