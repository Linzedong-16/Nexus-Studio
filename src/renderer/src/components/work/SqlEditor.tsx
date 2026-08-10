import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import '@/lib/monaco'

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  onExecute: () => void
}

/**
 * SQL 编辑器（Monaco）
 *
 * 使用 @monaco-editor/react，PostgreSQL 语言高亮，
 * 注册 Ctrl/Cmd+Enter 执行快捷键。
 */
export default function SqlEditor({
  value,
  onChange,
  onExecute
}: SqlEditorProps): React.JSX.Element {
  const executeRef = useRef(onExecute)

  useEffect(() => {
    executeRef.current = onExecute
  }, [onExecute])

  const handleMount: OnMount = (editorInstance, monaco) => {
    editorInstance.addAction({
      id: 'execute-sql',
      label: '执行 SQL',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => executeRef.current()
    })
  }

  return (
    <Editor
      height="100%"
      language="pgsql"
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
        quickSuggestions: true
      }}
    />
  )
}
