import { useEffect, useId, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { useThemeStore } from '@/store/themeStore'

/** 记录已初始化的主题，避免每次渲染都重新 initialize */
let initializedTheme: 'light' | 'dark' | null = null

function ensureInitialized(mode: 'light' | 'dark'): void {
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
 */
export function MermaidDiagram({ code }: MermaidDiagramProps): React.ReactElement {
  const mode = useThemeStore((s) => s.mode)
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const diagramId = `mermaid-${rawId}`
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 防止旧渲染结果在 code/mode 变化后异步落地覆盖新结果
  const renderTokenRef = useRef(0)

  useEffect(() => {
    const token = ++renderTokenRef.current
    ensureInitialized(mode)
    mermaid
      .render(diagramId, code)
      .then((result) => {
        if (renderTokenRef.current === token) {
          setSvg(result.svg)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (renderTokenRef.current === token) {
          setError(err instanceof Error ? err.message : '图表解析失败')
        }
      })
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
