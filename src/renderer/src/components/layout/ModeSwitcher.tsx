import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { MODES, resolveModeByPath, preloadPage } from '@/config/modes'
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

  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const [indicator, setIndicator] = useState({ pos: 0, size: 0 })

  const measure = useCallback((): void => {
    const el = tabRefs.current.get(activeMode.id)
    if (el) {
      setIndicator(
        collapsed
          ? { pos: el.offsetTop, size: el.offsetHeight }
          : { pos: el.offsetLeft, size: el.offsetWidth }
      )
    }
  }, [activeMode.id, collapsed])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  // 展开态标签宽度为 flex-1，依赖侧边栏容器宽度；容器折叠/展开经 CSS transition
  // 渐变宽度（Sidebar.tsx），上面的 layoutEffect 在过渡刚开始时就完成测量，读到的
  // 还是过渡中间态的容器宽度。用 ResizeObserver 在容器实际尺寸变化期间持续校正，
  // 过渡结束时自动收敛到正确的最终尺寸。
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [measure])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex rounded-lg bg-muted p-0.5',
        collapsed ? 'flex-col items-center gap-0.5' : 'items-center'
      )}
    >
      {/* 滑动指示块：位移用 translate3d 交合成层处理（每次切换都会触发，值得预建层）
          尺寸仍走原生 width/height ——绝对定位的独立盒子，改尺寸不影响外部布局，
          回流成本本就很低；若改成 scaleX/scaleY 模拟尺寸，圆角会被非等比拉伸变形 */}
      <span
        aria-hidden
        className={cn(
          'absolute rounded-md bg-background shadow-sm transition-[transform,width,height] duration-150 ease-out will-change-transform',
          collapsed ? 'inset-x-0.5 top-0' : 'inset-y-0.5 left-0'
        )}
        style={
          collapsed
            ? { transform: `translate3d(0, ${indicator.pos}px, 0)`, height: indicator.size }
            : { transform: `translate3d(${indicator.pos}px, 0, 0)`, width: indicator.size }
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
            onClick={() => {
              preloadPage(mode.id)
              navigate(mode.basePath)
            }}
            onMouseEnter={() => preloadPage(mode.id)}
            className={cn(
              'relative z-10 flex items-center rounded-md transition-colors',
              collapsed
                ? 'size-9 justify-center'
                : 'flex-1 justify-center gap-1 px-3 py-1 text-[13px]',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {mode.icon ? (
              active ? (
                <mode.icon
                  className={cn('animate-mode-icon-in', collapsed ? 'size-4' : 'size-3.5')}
                />
              ) : collapsed ? (
                <mode.icon className="size-4" />
              ) : null
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
