/**
 * 项目 / 文件资源管理器状态管理
 *
 * 管理顶部项目选择（当前激活项目、最近项目列表）与 VSCode 风格文件树
 * （懒加载、展开态、选中态、增删改查、拖拽移动）。
 * 瞬态 store：`recentProjects` 为持久化配置（`ConfigStore`）的内存副本，其余状态不持久化。
 */
import { create } from 'zustand'
import type { FileNode, RecentProjectEntry } from '@/types/fileExplorer'
import { fsService } from '@/services/fsService'
import { configService } from '@/services/configService'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useTreeExpandStore } from '@/store/treeExpandStore'

/** 「最近项目」列表上限 */
const MAX_RECENT_PROJECTS = 20

/** 取路径最后一个分隔符（`/` 或 `\`）位置 */
function lastSepIndex(p: string): number {
  return Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
}

/** 取路径的末段名称 */
function basenameOfPath(p: string): string {
  const idx = lastSepIndex(p)
  return idx === -1 ? p : p.slice(idx + 1)
}

/** 取路径的父目录部分 */
function dirnameOfPath(p: string): string {
  const idx = lastSepIndex(p)
  return idx === -1 ? p : p.slice(0, idx)
}

/** 取路径的层级深度（分隔符数量），用于按浅到深顺序恢复展开态 */
function pathDepth(p: string): number {
  return p.split(/[/\\]/).filter(Boolean).length
}

/** 判断 targetPath 是否为 sourcePath 自身或其子孙路径 */
export function isSelfOrDescendant(sourcePath: string, targetPath: string): boolean {
  if (targetPath === sourcePath) return true
  return targetPath.startsWith(`${sourcePath}/`) || targetPath.startsWith(`${sourcePath}\\`)
}

interface FileExplorerStoreState {
  /** 当前激活项目根路径；null 表示未打开任何项目 */
  activeProjectPath: string | null
  /** 当前激活项目名称（路径末段），供顶部入口展示 */
  activeProjectName: string | null
  /** 文件树缓存（根目录直接子项起） */
  fileTree: FileNode[]
  /** 加载中 */
  loading: boolean
  /** 已展开的目录路径集合 */
  expandedPaths: Set<string>
  /** 当前选中的文件/文件夹路径 */
  selectedPath: string | null
  /** 正在重命名编辑态的节点路径 */
  renamingPath: string | null
  /** 正在新建命名编辑态：父目录路径 + 新建类型 */
  creatingIn: { parentDir: string; type: 'file' | 'folder' } | null
  /** 待确认删除的节点路径（驱动删除确认弹窗） */
  deleteConfirmPath: string | null
  /** 拖拽中的源节点路径（驱动 droppable 的非法目标禁用态） */
  dragSourcePath: string | null
  /** 最近项目列表（从 ConfigStore 加载的内存副本，按最近使用排序） */
  recentProjects: RecentProjectEntry[]

  /** 应用启动/挂载时加载「最近」列表 */
  loadRecentProjects: () => Promise<void>
  /** 打开文件夹：唤起系统目录选择器并激活选中的文件夹为当前项目 */
  openFolder: () => Promise<void>
  /** 激活「最近」列表中的一条记录为当前项目；路径失效时移除该记录并抛错 */
  openRecentProject: (path: string) => Promise<void>
  /** 关闭当前工作区（激活项目置空，联动关闭其下全部文件标签页） */
  closeWorkspace: () => void
  /** 切换目录展开/折叠；首次展开时懒加载子节点 */
  toggleExpand: (dirPath: string) => Promise<void>
  /** 设置当前选中节点 */
  setSelected: (path: string | null) => void
  /** 在指定目录下新建文件；名称冲突时抛错 */
  createFile: (parentDir: string, name: string) => Promise<void>
  /** 在指定目录下新建文件夹；名称冲突时抛错 */
  createFolder: (parentDir: string, name: string) => Promise<void>
  /** 重命名文件/文件夹；同时触发 workspaceStore.renameFileTab 联动 */
  rename: (oldPath: string, newName: string) => Promise<void>
  /** 删除文件/文件夹（移入回收站）；同时触发 workspaceStore.closeFileTabsUnderPath 联动 */
  remove: (path: string) => Promise<void>
  /** 拖拽移动文件/文件夹到目标目录；名称冲突或非法嵌套时抛错 */
  move: (sourcePath: string, targetDirPath: string) => Promise<void>
  /** 进入指定节点的重命名编辑态 */
  startRename: (path: string) => void
  /** 取消重命名编辑态 */
  cancelRename: () => void
  /** 进入指定目录下的新建命名编辑态（确保该目录已展开） */
  startCreate: (parentDir: string, type: 'file' | 'folder') => Promise<void>
  /** 取消新建命名编辑态 */
  cancelCreate: () => void
  /** 请求删除指定节点（打开删除确认弹窗） */
  requestDelete: (path: string) => void
  /** 取消删除确认弹窗 */
  cancelDeleteConfirm: () => void
  /** 设置当前拖拽中的源节点路径 */
  setDragSourcePath: (path: string | null) => void
}

export const useFileExplorerStore = create<FileExplorerStoreState>()((set, get) => {
  /** 递归更新树中指定路径节点的 children（不可变更新） */
  const updateNodeChildren = (
    nodes: FileNode[],
    targetPath: string,
    children: FileNode[]
  ): FileNode[] => {
    return nodes.map((node) => {
      if (node.path === targetPath) {
        return { ...node, children }
      }
      if (node.children) {
        return { ...node, children: updateNodeChildren(node.children, targetPath, children) }
      }
      return node
    })
  }

  /** 递归从树中移除指定路径的节点（不可变更新） */
  const removeNode = (nodes: FileNode[], targetPath: string): FileNode[] => {
    return nodes
      .filter((node) => node.path !== targetPath)
      .map((node) =>
        node.children ? { ...node, children: removeNode(node.children, targetPath) } : node
      )
  }

  /** 刷新指定目录的直接子项；目录为项目根时替换 fileTree 顶层，否则更新对应节点的 children */
  const refreshDir = async (dirPath: string): Promise<void> => {
    const children = await fsService.readDir(dirPath)
    set((s) => ({
      fileTree:
        dirPath === get().activeProjectPath
          ? children
          : updateNodeChildren(s.fileTree, dirPath, children)
    }))
  }

  /** 在树中查找指定路径的节点 */
  const findNode = (nodes: FileNode[], target: string): FileNode | null => {
    for (const n of nodes) {
      if (n.path === target) return n
      if (n.children) {
        const found = findNode(n.children, target)
        if (found) return found
      }
    }
    return null
  }

  /** 将当前展开路径集合写入 treeExpandStore，供跨页面/跨重启恢复 */
  const persistExpandedPaths = (): void => {
    const projectPath = get().activeProjectPath
    if (!projectPath) return
    useTreeExpandStore.getState().setFileExpandedPaths(projectPath, Array.from(get().expandedPaths))
  }

  /** 确保目录已展开：项目根始终视为已加载；其余目录首次展开时懒加载子节点，失败时回滚展开态 */
  const ensureExpanded = async (dirPath: string): Promise<void> => {
    if (dirPath === get().activeProjectPath) return
    const { expandedPaths, fileTree } = get()
    if (expandedPaths.has(dirPath)) return
    const next = new Set(expandedPaths)
    next.add(dirPath)
    set({ expandedPaths: next })
    persistExpandedPaths()

    const node = findNode(fileTree, dirPath)
    if (node && !node.children) {
      try {
        const children = await fsService.readDir(dirPath)
        set((s) => ({ fileTree: updateNodeChildren(s.fileTree, dirPath, children) }))
      } catch {
        const rollback = new Set(get().expandedPaths)
        rollback.delete(dirPath)
        set({ expandedPaths: rollback })
        persistExpandedPaths()
      }
    }
  }

  /** 恢复指定项目上次持久化的展开路径：按层级从浅到深依次展开，确保父目录先加载出子节点 */
  const restoreExpandedPaths = async (projectPath: string): Promise<void> => {
    const persisted = useTreeExpandStore.getState().filePaths[projectPath]
    if (!persisted || persisted.length === 0) return
    const sorted = [...persisted].sort((a, b) => pathDepth(a) - pathDepth(b))
    for (const dirPath of sorted) {
      await ensureExpanded(dirPath)
    }
  }

  /** 将路径更新/插入「最近项目」列表最前，去重、超限裁剪、持久化 */
  const touchRecentProject = async (path: string): Promise<void> => {
    const existing = get().recentProjects.filter((r) => r.path !== path)
    const entry: RecentProjectEntry = {
      path,
      name: basenameOfPath(path),
      lastUsedAt: Date.now()
    }
    const next = [entry, ...existing].slice(0, MAX_RECENT_PROJECTS)
    set({ recentProjects: next })
    await configService.setRecentProjects(next)
  }

  /** 激活指定路径为当前项目：关闭旧项目文件标签页、重置树状态、加载根目录、更新最近列表 */
  const activateProject = async (path: string): Promise<void> => {
    const previousPath = get().activeProjectPath
    if (previousPath) {
      useWorkspaceStore.getState().closeFileTabsUnderPath(previousPath)
    }
    set({
      activeProjectPath: path,
      activeProjectName: basenameOfPath(path),
      fileTree: [],
      expandedPaths: new Set<string>(),
      selectedPath: null,
      renamingPath: null,
      creatingIn: null,
      deleteConfirmPath: null,
      loading: true
    })
    try {
      const root = await fsService.readDir(path)
      set({ fileTree: root, loading: false })
      await restoreExpandedPaths(path)
    } catch {
      set({ loading: false })
    }
    await touchRecentProject(path)
  }

  return {
    activeProjectPath: null,
    activeProjectName: null,
    fileTree: [],
    loading: false,
    expandedPaths: new Set<string>(),
    selectedPath: null,
    renamingPath: null,
    creatingIn: null,
    deleteConfirmPath: null,
    dragSourcePath: null,
    recentProjects: [],

    loadRecentProjects: async () => {
      const list = await configService.getRecentProjects()
      set({ recentProjects: list })
    },

    openFolder: async () => {
      const path = await fsService.pickFolder()
      if (!path) return
      await activateProject(path)
    },

    openRecentProject: async (path) => {
      const exists = await fsService.fileExists(path)
      if (!exists) {
        const next = get().recentProjects.filter((r) => r.path !== path)
        set({ recentProjects: next })
        await configService.setRecentProjects(next)
        throw new Error('该项目文件夹已不存在')
      }
      await activateProject(path)
    },

    closeWorkspace: () => {
      const previousPath = get().activeProjectPath
      if (previousPath) {
        useWorkspaceStore.getState().closeFileTabsUnderPath(previousPath)
      }
      set({
        activeProjectPath: null,
        activeProjectName: null,
        fileTree: [],
        expandedPaths: new Set<string>(),
        selectedPath: null,
        renamingPath: null,
        creatingIn: null,
        deleteConfirmPath: null
      })
    },

    toggleExpand: async (dirPath) => {
      const isExpanded = get().expandedPaths.has(dirPath)
      if (isExpanded) {
        const next = new Set(get().expandedPaths)
        next.delete(dirPath)
        set({ expandedPaths: next })
        persistExpandedPaths()
        return
      }
      await ensureExpanded(dirPath)
    },

    setSelected: (path) => {
      set({ selectedPath: path })
    },

    createFile: async (parentDir, name) => {
      await fsService.createFile(parentDir, name)
      await refreshDir(parentDir)
    },

    createFolder: async (parentDir, name) => {
      await fsService.createDirectory(parentDir, name)
      await refreshDir(parentDir)
    },

    rename: async (oldPath, newName) => {
      const newPath = await fsService.rename(oldPath, newName)
      await refreshDir(dirnameOfPath(oldPath))
      useWorkspaceStore.getState().renameFileTab(oldPath, newPath)
      if (get().selectedPath === oldPath) set({ selectedPath: newPath })
    },

    remove: async (path) => {
      await fsService.deleteItem(path)
      set((s) => ({
        fileTree: path === get().activeProjectPath ? [] : removeNode(s.fileTree, path)
      }))
      useWorkspaceStore.getState().closeFileTabsUnderPath(path)
      if (get().selectedPath === path) set({ selectedPath: null })
    },

    move: async (sourcePath, targetDirPath) => {
      if (isSelfOrDescendant(sourcePath, targetDirPath)) {
        throw new Error('不能移动到自身或其子目录下')
      }
      await fsService.moveItem(sourcePath, targetDirPath)
      await refreshDir(dirnameOfPath(sourcePath))
      await refreshDir(targetDirPath)
    },

    startRename: (path) => {
      set({ renamingPath: path, selectedPath: path })
    },

    cancelRename: () => {
      set({ renamingPath: null })
    },

    startCreate: async (parentDir, type) => {
      await ensureExpanded(parentDir)
      set({ creatingIn: { parentDir, type } })
    },

    cancelCreate: () => {
      set({ creatingIn: null })
    },

    requestDelete: (path) => {
      set({ deleteConfirmPath: path, selectedPath: path })
    },

    cancelDeleteConfirm: () => {
      set({ deleteConfirmPath: null })
    },

    setDragSourcePath: (path) => {
      set({ dragSourcePath: path })
    }
  }
})
