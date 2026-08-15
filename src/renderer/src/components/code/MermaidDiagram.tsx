import { useEffect, useId, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { useThemeStore, type ThemeMode } from '@/store/themeStore'

/** 记录已初始化的主题，避免每次渲染都重新 initialize */
let initializedTheme: ThemeMode | null = null

function ensureInitialized(mode: ThemeMode): void {
  if (initializedTheme === mode) return
  mermaid.initialize({
    startOnLoad: false,
    theme: mode === 'dark' ? 'dark' : 'default',
    securityLevel: 'strict'
  })
  initializedTheme = mode
}

interface MermaidDiagramProps {
  code: string
}

/**
 * Mermaid 图表渲染组件
 *
 * 异步将 mermaid 源码渲染为 SVG；语法不完整或解析失败时回退为原始代码展示，
 * 不影响 Markdown 其余内容的渲染。
 *
 * 按主题缓存渲染结果：主题切换时优先复用缓存的 SVG，避免重复触发 mermaid 的
 * 布局计算；缓存未命中且非首次挂载/内容变化（即纯粹因主题切换导致）时，
 * 渲染会延后到浏览器空闲时执行，避免与主题切换过渡动画抢占主线程。
 */
export function MermaidDiagram({ code }: MermaidDiagramProps): React.ReactElement {
  const mode = useThemeStore((s) => s.mode)
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const diagramId = `mermaid-${rawId}`
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 防止旧渲染结果在 code/mode 变化后异步落地覆盖新结果
  const renderTokenRef = useRef(0)
  // 按主题缓存已渲染的 SVG：主题切换时优先复用，避免重复计算图表布局
  const svgCacheRef = useRef<Map<ThemeMode, string>>(new Map())
  // 记录上一次渲染所依据的源码，用于判断本次触发是内容变化还是纯主题切换
  const prevCodeRef = useRef<string | null>(null)

  useEffect(() => {
    const isContentChange = prevCodeRef.current !== null && prevCodeRef.current !== code
    prevCodeRef.current = code
    if (isContentChange) {
      // 图表源码变了，旧主题缓存已不对应当前内容
      svgCacheRef.current.clear()
    }

    const cached = svgCacheRef.current.get(mode)
    if (cached) {
      setSvg(cached)
      setError(null)
      return undefined
    }

    const token = ++renderTokenRef.current
    const doRender = (): void => {
      ensureInitialized(mode)
      mermaid
        .render(diagramId, code)
        .then((result) => {
          if (renderTokenRef.current === token) {
            svgCacheRef.current.set(mode, result.svg)
            setSvg(result.svg)
            setError(null)
          }
        })
        .catch((err: unknown) => {
          if (renderTokenRef.current === token) {
            setError(err instanceof Error ? err.message : '图表解析失败')
          }
        })
    }

    // 首次挂载或内容变化：立即渲染，尽快让用户看到图表
    // 纯主题切换触发的重渲染（该图表首次遇到这个新主题）：延后到浏览器空闲时执行，
    // 避免与主题切换过渡动画（View Transition 生成新状态截图）竞争主线程，导致动画卡顿
    const isPureThemeSwitch = !isContentChange && svgCacheRef.current.size > 0
    if (isPureThemeSwitch) {
      const idleId = requestIdleCallback(doRender, { timeout: 1000 })
      return () => cancelIdleCallback(idleId)
    }

    doRender()
    return undefined
  }, [code, mode, diagramId])

  if (error) {
    return (
      <div className="my-2 space-y-1.5">
        <p className="text-[10px] text-destructive">Mermaid 图表解析失败：{error}</p>
        <pre className="overflow-x-auto rounded-lg bg-[#0d1117] p-3 text-xs text-white/90">
          {code}
        </pre>
      </div>
    )
  }

  if (!svg) {
    return <div className="my-2 text-xs text-muted-foreground">图表渲染中…</div>
  }

  return (
    <div
      className="[&_svg]:max-w-full my-2 flex justify-center overflow-x-auto rounded-lg border border-border bg-background p-3"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
