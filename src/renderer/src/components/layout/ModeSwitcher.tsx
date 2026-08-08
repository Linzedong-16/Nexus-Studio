import { useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { MODES, resolveModeByPath } from '@/config/modes'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ModeSwitcherProps {
  /** 折叠态：纵向图标列（Work/Design 无图标时回退首字母），标签入 tooltip */
  collapsed?: boolean
}

/**
 * 分段式模式切换器（FR-005）
 * - 激活态由路由 URL 推导（唯一事实源），点击 = navigate(basePath)
 * - 指示块经 ref 测量激活标签位置，transform + size 过渡滑动（research.md R-005）
 */
export default function ModeSwitcher({ collapsed = false }: ModeSwitcherProps): React.JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const activeMode = resolveModeByPath(location.pathname)

  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const [indicator, setIndicator] = useState({ pos: 0, size: 0 })

  useLayoutEffect(() => {
    const el = tabRefs.current.get(activeMode.id)
    if (el) {
      setIndicator(
        collapsed
          ? { pos: el.offsetTop, size: el.offsetHeight }
          : { pos: el.offsetLeft, size: el.offsetWidth }
      )
    }
  }, [activeMode.id, collapsed])

  return (
    <div
      className={cn(
        'relative flex rounded-lg bg-muted p-0.5',
        collapsed ? 'flex-col items-center gap-0.5' : 'items-center'
      )}
    >
      {/* 滑动指示块 */}
      <span
        aria-hidden
        className={cn(
          'absolute rounded-md bg-background shadow-sm transition-[transform,width,height] duration-200 ease-out',
          collapsed ? 'inset-x-0.5 top-0' : 'inset-y-0.5 left-0'
        )}
        style={
          collapsed
            ? { transform: `translateY(${indicator.pos}px)`, height: indicator.size }
            : { transform: `translateX(${indicator.pos}px)`, width: indicator.size }
        }
      />
      {MODES.map((mode) => {
        const active = mode.id === activeMode.id
        const button = (
          <button
            key={mode.id}
            ref={(el) => {
              if (el) {
                tabRefs.current.set(mode.id, el)
              } else {
                tabRefs.current.delete(mode.id)
              }
            }}
            onClick={() => navigate(mode.basePath)}
            className={cn(
              'relative z-10 flex items-center rounded-md transition-colors',
              collapsed
                ? 'size-9 justify-center'
                : 'flex-1 justify-center gap-1 px-3 py-1 text-[13px]',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {mode.icon ? (
              <mode.icon className={collapsed ? 'size-4' : 'size-3.5'} />
            ) : collapsed ? (
              <span className="text-xs font-medium">{mode.label[0]}</span>
            ) : null}
            {!collapsed && mode.label}
          </button>
        )
        return collapsed ? (
          <Tooltip key={mode.id}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right">{mode.label}</TooltipContent>
          </Tooltip>
        ) : (
          button
        )
      })}
    </div>
  )
}
