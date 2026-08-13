import { useState } from 'react'
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  File as FileIcon,
  Folder,
  FolderPlus
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useFileExplorerStore } from '@/store/fileExplorerStore'
import FileTreeNode, { TreeItemInput } from './FileTreeNode'

/** 取路径的末段名称，仅用于删除确认弹窗展示 */
function basenameOfPath(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return idx === -1 ? p : p.slice(idx + 1)
}

/**
 * 文件资源管理器主面板
 *
 * 可折叠根节点标题（展示项目名，整体折叠/展开树内容，不影响各子目录 expandedPaths）+
 * 文件树（ScrollArea，DndContext 承载拖拽移动）+ F2/Delete 快捷键 + 删除确认弹窗。
 */
export default function FileExplorer(): React.JSX.Element {
  const activeProjectPath = useFileExplorerStore((s) => s.activeProjectPath)
  const activeProjectName = useFileExplorerStore((s) => s.activeProjectName)
  const fileTree = useFileExplorerStore((s) => s.fileTree)
  const loading = useFileExplorerStore((s) => s.loading)
  const selectedPath = useFileExplorerStore((s) => s.selectedPath)
  const startRename = useFileExplorerStore((s) => s.startRename)
  const creatingIn = useFileExplorerStore((s) => s.creatingIn)
  const startCreate = useFileExplorerStore((s) => s.startCreate)
  const cancelCreate = useFileExplorerStore((s) => s.cancelCreate)
  const createFile = useFileExplorerStore((s) => s.createFile)
  const createFolder = useFileExplorerStore((s) => s.createFolder)
  const deleteConfirmPath = useFileExplorerStore((s) => s.deleteConfirmPath)
  const requestDelete = useFileExplorerStore((s) => s.requestDelete)
  const cancelDeleteConfirm = useFileExplorerStore((s) => s.cancelDeleteConfirm)
  const remove = useFileExplorerStore((s) => s.remove)
  const move = useFileExplorerStore((s) => s.move)
  const setDragSourcePath = useFileExplorerStore((s) => s.setDragSourcePath)

  const [rootExpanded, setRootExpanded] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)

  // 切换项目时重置根节点折叠态，避免新项目在折叠态下打开导致树被误隐藏
  const [prevProjectPath, setPrevProjectPath] = useState(activeProjectPath)
  if (activeProjectPath !== prevProjectPath) {
    setPrevProjectPath(activeProjectPath)
    setRootExpanded(true)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  )

  const handleDragStart = (event: DragStartEvent): void => {
    setDragSourcePath(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    setDragSourcePath(null)
    if (!over || active.id === over.id) return
    const sourcePath = active.id as string
    const targetDirPath = over.id as string
    void (async () => {
      try {
        await move(sourcePath, targetDirPath)
      } catch (err) {
        setActionError(err instanceof Error ? err.message : '移动失败')
      }
    })()
  }

  const handleDragCancel = (): void => {
    setDragSourcePath(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (!selectedPath) return
    if (e.key === 'F2') {
      e.preventDefault()
      startRename(selectedPath)
    } else if (e.key === 'Delete') {
      e.preventDefault()
      requestDelete(selectedPath)
    }
  }

  const handleRootCreateConfirm = async (name: string): Promise<void> => {
    if (!activeProjectPath) return
    if (creatingIn?.type === 'folder') {
      await createFolder(activeProjectPath, name)
    } else {
      await createFile(activeProjectPath, name)
    }
    cancelCreate()
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteConfirmPath) return
    try {
      await remove(deleteConfirmPath)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '删除失败')
    } finally {
      cancelDeleteConfirm()
    }
  }

  const isCreatingAtRoot = creatingIn?.parentDir === activeProjectPath

  return (
    <div className="flex h-full flex-col">
      {/* 根节点标题：整体折叠/展开 + 新建文件/文件夹 */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        <button
          type="button"
          title={rootExpanded ? '折叠' : '展开'}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => setRootExpanded((v) => !v)}
        >
          {rootExpanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <span className="flex-1 truncate text-xs font-medium text-muted-foreground">
          {activeProjectName}
        </span>
        <button
          type="button"
          title="新建文件"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => activeProjectPath && void startCreate(activeProjectPath, 'file')}
        >
          <FilePlus className="size-3.5" />
        </button>
        <button
          type="button"
          title="新建文件夹"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => activeProjectPath && void startCreate(activeProjectPath, 'folder')}
        >
          <FolderPlus className="size-3.5" />
        </button>
      </div>

      {actionError && (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive">
          {actionError}
        </div>
      )}

      <div className="min-h-0 flex-1" tabIndex={0} onKeyDown={handleKeyDown}>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <ScrollArea className="h-full">
            {rootExpanded &&
              (loading ? (
                <div className="p-4 text-center text-xs text-muted-foreground">加载中…</div>
              ) : (
                <div className="py-1">
                  {isCreatingAtRoot && (
                    <TreeItemInput
                      depth={0}
                      icon={
                        creatingIn?.type === 'folder' ? (
                          <Folder className="size-3.5 shrink-0 text-amber-500" />
                        ) : (
                          <FileIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
                        )
                      }
                      onConfirm={handleRootCreateConfirm}
                      onCancel={cancelCreate}
                    />
                  )}
                  {fileTree.length === 0 && !isCreatingAtRoot ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">文件夹为空</div>
                  ) : (
                    fileTree.map((node) => (
                      <FileTreeNode
                        key={node.path}
                        node={node}
                        depth={0}
                        onError={setActionError}
                      />
                    ))
                  )}
                </div>
              ))}
          </ScrollArea>
        </DndContext>
      </div>

      <Dialog
        open={deleteConfirmPath !== null}
        onOpenChange={(open) => {
          if (!open) cancelDeleteConfirm()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除确认</DialogTitle>
            <DialogDescription>
              确定要删除{deleteConfirmPath ? ` “${basenameOfPath(deleteConfirmPath)}” ` : ''}
              吗？该操作会将其移入系统回收站。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDeleteConfirm}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleConfirmDelete()}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
