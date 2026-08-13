import { useCallback, useRef } from 'react'
import { Save } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { languageFromFileName } from '@/lib/fileLanguage'
import type { FileTabState, WorkspaceTab } from '@/types/workspace'
import { useWorkspaceStore } from '@/store/workspaceStore'
import SqlEditor from '@/components/work/SqlEditor'
import ResultTable from '@/components/work/ResultTable'

interface FilePanelProps {
  tab: WorkspaceTab
}

/**
 * 文件编辑器标签页面板
 *
 * 工具栏（文件路径 + 保存按钮）+ Monaco 编辑器 + 结果区。
 * 由于是文件标签页，无数据库连接，不提供 SQL 补全和执行功能。
 */
export default function FilePanel({ tab }: FilePanelProps): React.JSX.Element {
  const state = tab.state as FileTabState
  const tabs = useWorkspaceStore((s) => s.tabs)
  const contentRef = useRef(state.content)

  const handleChange = useCallback(
    (value: string) => {
      contentRef.current = value
      // 更新 store 中该标签页的内容
      useWorkspaceStore.setState((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tab.id && t.type === 'file'
            ? { ...t, state: { ...(t.state as FileTabState), content: value } }
            : t
        )
      }))
    },
    [tab.id]
  )

  const handleSave = useCallback(async () => {
    const currentTab = tabs.find((t) => t.id === tab.id)
    if (!currentTab) return
    const currentState = currentTab.state as FileTabState | undefined
    if (!currentState?.filePath) return

    try {
      await window.api.fs.writeFile(currentState.filePath, contentRef.current)
    } catch {
      // 保存失败，静默处理
    }
  }, [tab.id, tabs])

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* 工具栏 */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="truncate text-xs text-muted-foreground">{state.filePath}</span>
        <div className="flex-1" />
        {!state.isBinary && (
          <Button size="sm" onClick={() => void handleSave()} title="保存 (Ctrl+S)">
            <Save className="size-3.5" />
            保存
          </Button>
        )}
      </div>

      {state.isBinary ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          不支持预览该文件（二进制文件）
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <Group orientation="vertical" className="h-full">
            <Panel id="file-editor" defaultSize="70" minSize="20">
              <div className="h-full">
                <SqlEditor
                  value={state.content}
                  onChange={handleChange}
                  onExecute={() => {}}
                  language={languageFromFileName(state.fileName)}
                  // 文件标签页无数据库连接，不提供补全
                />
              </div>
            </Panel>
            <Separator
              id="file-result-separator"
              className={cn(
                'h-1 shrink-0 bg-border data-separator:bg-border',
                'hover:bg-primary/50 data-separator-active:bg-primary'
              )}
            />
            <Panel id="file-result" defaultSize="30" minSize="15">
              <div className="h-full">
                <ResultTable result={null} loading={false} />
              </div>
            </Panel>
          </Group>
        </div>
      )}
    </div>
  )
}
