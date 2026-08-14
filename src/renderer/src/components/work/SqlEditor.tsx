import { useEffect, useRef, useState } from 'react'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import Editor, { type OnMount } from '@monaco-editor/react'
import { WandSparkles } from 'lucide-react'
import '@/lib/monaco'
import { registerCompletionProvider } from '@/lib/monaco'
import { formatSql } from '@/lib/sqlFormat'
import { useThemeStore } from '@/store/themeStore'
import { useConnectionStore } from '@/store/connectionStore'

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  onExecute: () => void
  /** 数据库连接 ID（用于补全上下文） */
  connectionId?: string
  /** 当前查询作用的数据库（用于补全上下文） */
  database?: string
  /** 当前查询作用的 Schema（用于补全上下文） */
  schema?: string
  /** Monaco language id，默认 `pgsql`；仅 `pgsql` 时注册 SQL 补全提供者 */
  language?: string
}

/**
 * SQL 编辑器（Monaco）
 *
 * 使用 @monaco-editor/react，PostgreSQL 语言高亮，
 * 注册 Ctrl/Cmd+Enter 执行快捷键，并提供 schema-aware 自动补全。
 */
export default function SqlEditor({
  value,
  onChange,
  onExecute,
  connectionId,
  database,
  schema,
  language = 'pgsql'
}: SqlEditorProps): React.JSX.Element {
  const mode = useThemeStore((s) => s.mode)
  const dbType = useConnectionStore(
    (s) => (connectionId ? s.connections[connectionId]?.config.type : undefined) ?? 'postgresql'
  )
  const executeRef = useRef(onExecute)
  // 保持连接上下文的引用，供补全提供者闭包使用
  const ctxRef = useRef({ connectionId, database, schema })
  const dbTypeRef = useRef(dbType)
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null)
  const [formatHint, setFormatHint] = useState<string | null>(null)
  const canFormat = language === 'pgsql'

  useEffect(() => {
    executeRef.current = onExecute
  }, [onExecute])

  useEffect(() => {
    ctxRef.current = { connectionId, database, schema }
    dbTypeRef.current = dbType
  }, [connectionId, database, schema, dbType])

  // 主动预加载当前数据库的 schema/表名，避免依赖用户先手动展开结构树才有表名补全
  useEffect(() => {
    if (!connectionId || !database) return
    const store = useConnectionStore.getState()
    void store.loadSchemas(connectionId, database).then(() => {
      const schemas =
        useConnectionStore.getState().connections[connectionId]?.databaseNodes?.[database]
          ?.schemas ?? []
      for (const s of schemas) {
        void store.loadModuleItems(connectionId, database, s.name, 'tables')
        void store.loadModuleItems(connectionId, database, s.name, 'views')
      }
    })
  }, [connectionId, database])

  /** 格式化当前 SQL：通过 executeEdits + pushUndoStop 写回，保证是单步可撤销操作（Ctrl+Z 还原） */
  const handleFormat = (): void => {
    const editorInstance = editorRef.current
    const model = editorInstance?.getModel()
    if (!editorInstance || !model) return
    const result = formatSql(editorInstance.getValue(), dbTypeRef.current)
    if (result.error) {
      setFormatHint('无法格式化')
      return
    }
    setFormatHint(null)
    editorInstance.executeEdits('sql-format', [
      { range: model.getFullModelRange(), text: result.text }
    ])
    editorInstance.pushUndoStop()
  }

  const handleMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance

    editorInstance.addAction({
      id: 'execute-sql',
      label: '执行 SQL',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => executeRef.current()
    })

    if (canFormat) {
      editorInstance.addAction({
        id: 'format-sql',
        label: '格式化 SQL',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        run: () => handleFormat()
      })
    }

    // 仅 PostgreSQL SQL 编辑场景注册补全提供者
    if (language !== 'pgsql') return

    const disposeCompletion = registerCompletionProvider(monaco, {
      dbType: dbTypeRef.current,
      getContext: () => ctxRef.current
    })

    // 编辑器销毁时取消注册
    editorInstance.onDidDispose(() => {
      disposeCompletion()
    })
  }

  return (
    <div className="relative h-full">
      <Editor
        height="100%"
        language={language}
        theme={mode === 'dark' ? 'vs-dark' : 'vs'}
        value={value}
        onChange={(val) => onChange(val ?? '')}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          wordWrap: 'off',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          suggest: { showKeywords: true, showSnippets: true },
          quickSuggestions: true,
          // 编辑器被包裹在 react-resizable-panels 的 Panel（overflow: hidden）内，
          // 补全等悬浮层默认按编辑器容器定位会被祖先裁剪导致完全不可见，需脱离裁剪按视口定位
          fixedOverflowWidgets: true
        }}
      />
      {canFormat && (
        <div className="absolute top-2 right-4 z-10 flex items-center gap-2">
          {formatHint && (
            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
              {formatHint}
            </span>
          )}
          <button
            type="button"
            title="格式化 SQL (Shift+Alt+F)"
            onClick={handleFormat}
            className="flex size-7 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
          >
            <WandSparkles className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
