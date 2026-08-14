import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.min.css'

/** 各 Markdown 元素的样式映射，复用项目既有的 shadcn 设计令牌，未引入 @tailwindcss/typography */
const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-[15px] font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-2.5 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-accent/50">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="px-2.5 py-1.5 text-left font-medium text-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="px-2.5 py-1.5">{children}</td>,
  code: ({ className, children, ...props }) => {
    const isInline = !className?.includes('language-')
    if (isInline) {
      return (
        <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]" {...props}>
          {children}
        </code>
      )
    }
    return (
      <code className={`${className ?? ''} font-mono text-xs`} {...props}>
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-[#0d1117] p-3 text-xs">{children}</pre>
  )
}

/**
 * Markdown 渲染器
 *
 * 使用 react-markdown + remark-gfm（表格/删除线/任务列表等 GFM 扩展）+
 * rehype-highlight（代码块语法高亮）渲染 Agent 回复内容。
 */
function MarkdownRenderer({
  content,
  isStreaming
}: {
  content: string
  isStreaming?: boolean
}): React.ReactElement {
  return (
    <div className="text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block h-4 w-0.5 animate-pulse bg-primary align-middle" />
      )}
    </div>
  )
}

export default MarkdownRenderer
