import { useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2
} from 'lucide-react'
import type { FileNode } from '@/types/fileExplorer'
import { useFileExplorerStore, isSelfOrDescendant } from '@/store/fileExplorerStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { fsService } from '@/services/fsService'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  /** 打开文件/拖拽移动等操作失败时的错误上报回调 */
  onError: (message: string) => void
}

/** 判断是否为 SQL 文件 */
function isSqlFile(name: string): boolean {
  return name.endsWith('.sql')
}

interface TreeItemInputProps {
  depth: number
  icon: React.ReactNode
  defaultValue?: string
  onConfirm: (value: string) => Promise<void>
  onCancel: () => void
}

/**
 * 树节点命名编辑行（重命名 / 新建文件 / 新建文件夹 共用）
 *
 * Enter/失焦确认，Escape 取消；确认失败时保留编辑态并展示行内错误。
 */
export function TreeItemInput({
  depth,
  icon,
  defaultValue = '',
  onConfirm,
  onCancel
}: TreeItemInputProps): React.JSX.Element {
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState<string | null>(null)
  const skipBlurRef = useRef(false)

  const handleCancel = (): void => {
    skipBlurRef.current = true
    onCancel()
  }

  const handleConfirm = async (): Promise<void> => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false
      return
    }
    const name = value.trim()
    if (!name) {
      onCancel()
      return
    }
    try {
      await onConfirm(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    }
  }

  return (
    <div
      className="flex items-center gap-1 py-0.5 pr-2 text-[13px]"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="w-3 shrink-0" />
      {icon}
      <input
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void handleConfirm()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            handleCancel()
          }
        }}
        onBlur={() => void handleConfirm()}
        className="min-w-0 flex-1 rounded border border-primary bg-background px-1 text-[13px] outline-none"
      />
      {error && <span className="shrink-0 truncate text-destructive">{error}</span>}
    </div>
  )
}

/**
 * 文件/目录树节点
 *
 * 目录：点击展开/折叠，右键菜单支持新建文件/文件夹、重命名、删除、复制路径/相对路径、在系统文件夹显示；
 * 支持作为拖拽移动的放置目标。
 * 文件：单击尝试打开（二进制文件提示不支持预览且不新增标签页），右键菜单同上（除新建）；
 * 文件与目录均可作为拖拽移动的拖拽源，单选态高亮当前选中节点。
 */
export default function FileTreeNode({
  node,
  depth,
  onError
}: FileTreeNodeProps): React.JSX.Element {
  const expandedPaths = useFileExplorerStore((s) => s.expandedPaths)
  const toggleExpand = useFileExplorerStore((s) => s.toggleExpand)
  const selectedPath = useFileExplorerStore((s) => s.selectedPath)
  const setSelected = useFileExplorerStore((s) => s.setSelected)
  const activeProjectPath = useFileExplorerStore((s) => s.activeProjectPath)
  const renamingPath = useFileExplorerStore((s) => s.renamingPath)
  const startRename = useFileExplorerStore((s) => s.startRename)
  const cancelRename = useFileExplorerStore((s) => s.cancelRename)
  const creatingIn = useFileExplorerStore((s) => s.creatingIn)
  const startCreate = useFileExplorerStore((s) => s.startCreate)
  const cancelCreate = useFileExplorerStore((s) => s.cancelCreate)
  const requestDelete = useFileExplorerStore((s) => s.requestDelete)
  const rename = useFileExplorerStore((s) => s.rename)
  const createFile = useFileExplorerStore((s) => s.createFile)
  const createFolder = useFileExplorerStore((s) => s.createFolder)
  const dragSourcePath = useFileExplorerStore((s) => s.dragSourcePath)

  const isExpanded = expandedPaths.has(node.path)
  const isSelected = selectedPath === node.path
  const isRenaming = renamingPath === node.path
  const isCreatingChild = node.isDirectory && creatingIn?.parentDir === node.path

  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: node.path })
  const isInvalidDropTarget =
    !node.isDirectory || (dragSourcePath !== null && isSelfOrDescendant(dragSourcePath, node.path))
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: node.path,
    disabled: isInvalidDropTarget
  })

  const handleClick = async (): Promise<void> => {
    setSelected(node.path)
    if (node.isDirectory) {
      await toggleExpand(node.path)
      return
    }
    try {
      const result = await fsService.readFileSafe(node.path)
      if (result.isBinary) {
        onError('不支持预览该文件（二进制文件）')
        return
      }
      useWorkspaceStore.getState().openFileTab({
        filePath: node.path,
        fileName: node.name,
        content: result.content ?? ''
      })
    } catch (err) {
      onError(err instanceof Error ? err.message : '打开文件失败')
    }
  }

  const handleShowInFolder = async (): Promise<void> => {
    await fsService.showItemInFolder(node.path)
  }

  const handleCopyPath = async (): Promise<void> => {
    await navigator.clipboard.writeText(node.path)
  }

  const handleCopyRelativePath = async (): Promise<void> => {
    if (!activeProjectPath) {
      await navigator.clipboard.writeText(node.path)
      return
    }
    let relative = node.path
    if (relative === activeProjectPath) {
      relative = ''
    } else if (
      relative.startsWith(`${activeProjectPath}/`) ||
      relative.startsWith(`${activeProjectPath}\\`)
    ) {
      relative = relative.slice(activeProjectPath.length + 1)
    }
    await navigator.clipboard.writeText(relative)
  }

  const handleRenameConfirm = async (name: string): Promise<void> => {
    if (name !== node.name) {
      await rename(node.path, name)
    }
    cancelRename()
  }

  const handleCreateConfirm = async (name: string): Promise<void> => {
    if (creatingIn?.type === 'folder') {
      await createFolder(node.path, name)
    } else {
      await createFile(node.path, name)
    }
    cancelCreate()
  }

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {isRenaming ? (
            <TreeItemInput
              depth={depth}
              defaultValue={node.name}
              icon={
                node.isDirectory ? (
                  <Folder className="size-3.5 shrink-0 text-amber-500" />
                ) : isSqlFile(node.name) ? (
                  <FileCode className="size-3.5 shrink-0 text-blue-500" />
                ) : (
                  <File className="size-3.5 shrink-0 text-muted-foreground/50" />
                )
              }
              onConfirm={handleRenameConfirm}
              onCancel={cancelRename}
            />
          ) : (
            <div
              ref={(el) => {
                setDragRef(el)
                setDropRef(el)
              }}
              {...attributes}
              {...listeners}
              className={cn(
                'group flex cursor-pointer items-center gap-1 px-2 py-0.5 text-[13px]',
                isSelected ? 'bg-accent text-foreground' : 'hover:bg-accent/50',
                isOver && !isInvalidDropTarget && 'bg-primary/10 outline outline-primary/50'
              )}
              style={{ paddingLeft: depth > 0 ? `${depth * 16 + 8}px` : undefined }}
              onClick={() => void handleClick()}
            >
              {/* 展开/折叠箭头（仅目录） */}
              {node.isDirectory ? (
                isExpanded ? (
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                )
              ) : (
                <span className="w-3 shrink-0" />
              )}

              {/* 图标 */}
              {node.isDirectory ? (
                isExpanded ? (
                  <FolderOpen className="size-3.5 shrink-0 text-amber-500" />
                ) : (
                  <Folder className="size-3.5 shrink-0 text-amber-500" />
                )
              ) : isSqlFile(node.name) ? (
                <FileCode className="size-3.5 shrink-0 text-blue-500" />
              ) : (
                <File className="size-3.5 shrink-0 text-muted-foreground/50" />
              )}

              <span className="truncate">{node.name}</span>
            </div>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {node.isDirectory && (
            <>
              <ContextMenuItem onClick={() => void startCreate(node.path, 'file')}>
                <FilePlus className="size-3.5" />
                新建文件
              </ContextMenuItem>
              <ContextMenuItem onClick={() => void startCreate(node.path, 'folder')}>
                <FolderPlus className="size-3.5" />
                新建文件夹
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onClick={() => startRename(node.path)}>
            <Pencil className="size-3.5" />
            重命名
          </ContextMenuItem>
          <ContextMenuItem onClick={() => requestDelete(node.path)}>
            <Trash2 className="size-3.5" />
            删除
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => void handleCopyPath()}>复制路径</ContextMenuItem>
          <ContextMenuItem onClick={() => void handleCopyRelativePath()}>
            复制相对路径
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => void handleShowInFolder()}>
            <Folder className="size-3.5" />
            在系统文件夹显示
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* 新建文件/文件夹命名编辑行（作为子级第一项展示） */}
      {isCreatingChild && (
        <TreeItemInput
          depth={depth + 1}
          icon={
            creatingIn?.type === 'folder' ? (
              <Folder className="size-3.5 shrink-0 text-amber-500" />
            ) : (
              <File className="size-3.5 shrink-0 text-muted-foreground/50" />
            )
          }
          onConfirm={handleCreateConfirm}
          onCancel={cancelCreate}
        />
      )}

      {/* 子节点 */}
      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} onError={onError} />
          ))}
        </div>
      )}
    </div>
  )
}
