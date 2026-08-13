# Plan: 文件资源管理器面板

## 摘要

在 Work 模式左侧面板中实现类似 VS Code 资源管理器风格的文件树面板，支持：

- 打开本地文件夹作为工作区根目录
- 懒加载 SQL 脚本文件树（区分 `.sql` 与其他文件）
- 新建 SQL 文件（根目录 + 子目录右键菜单）
- 在系统文件夹中定位文件
- 刷新工作区
- 双击 `.sql` 打开编辑器标签页（去重），持久化恢复

## 当前架构分析

```
AppShell
├── TitleBar
├── Sidebar (56-260px, 全局左侧导航)
│   ├── ModeSwitcher
│   ├── SidebarNav (菜单项: 新建连接/插件市场/自动化/ER 分析)
│   └── UserPanel
└── <main> → Outlet → WorkHomePage
    └── WorkspaceHome (react-resizable-panels)
        ├── Panel: SchemaTree (数据库结构树)
        ├── Separator
        └── Panel: WorkspaceArea
            ├── WorkspaceTabs
            └── WorkspacePanel (根据 tab.type 分发)
                ├── 'connection' → ConnectionForm
                ├── 'query' → QueryPanel
                ├── 'table' → DataBrowser
                └── 'er-analysis' → ERDiagram
```

### 关键文件

| 文件                                                                                                                  | 角色                                     |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [WorkspaceHome.tsx](file:///d:/coding/project/desktop/DB-client/src/renderer/src/components/work/WorkspaceHome.tsx)   | 左 SchemaTree + 右标签页区的布局         |
| [SchemaTree.tsx](file:///d:/coding/project/desktop/DB-client/src/renderer/src/components/schema/SchemaTree.tsx)       | 数据库结构树面板（含标题栏）             |
| [WorkspacePanel.tsx](file:///d:/coding/project/desktop/DB-client/src/renderer/src/components/work/WorkspacePanel.tsx) | 根据 `tab.type` 分发渲染                 |
| [QueryPanel.tsx](file:///d:/coding/project/desktop/DB-client/src/renderer/src/components/work/QueryPanel.tsx)         | SQL 查询标签页（Monaco 编辑器 + 结果表） |
| [SqlEditor.tsx](file:///d:/coding/project/desktop/DB-client/src/renderer/src/components/work/SqlEditor.tsx)           | Monaco 编辑器封装                        |
| [types/workspace.ts](file:///d:/coding/project/desktop/DB-client/src/renderer/src/types/workspace.ts)                 | 标签页类型定义                           |
| [store/workspaceStore.ts](file:///d:/coding/project/desktop/DB-client/src/renderer/src/store/workspaceStore.ts)       | 标签页状态管理                           |
| [preload/index.ts](file:///d:/coding/project/desktop/DB-client/src/preload/index.ts)                                  | IPC 通道注册                             |
| [preload/index.d.ts](file:///d:/coding/project/desktop/DB-client/src/preload/index.d.ts)                              | IPC 类型声明                             |
| [main/ipc/index.ts](file:///d:/coding/project/desktop/DB-client/src/main/ipc/index.ts)                                | 主进程 IPC 注册入口                      |
| [modes.tsx](file:///d:/coding/project/desktop/DB-client/src/renderer/src/config/modes.tsx)                            | Work 模式菜单组配置                      |

### IPC 通信模式

- 主进程：`createIPCHandler(channel, handler)` 注册 handler
- 预加载：`createInvoke<TArgs, TResult>(channel)` 生成类型安全的调用函数
- API 声明：`src/preload/index.d.ts` 的 `Api` 接口
- 命名规范：`module:operation`（如 `db:connect`、`app:get-versions`）

### 组件模式

- shadcn/ui 风格组件（Radix UI 基座 + TailwindCSS v4）
- 右键菜单使用 `@radix-ui/react-context-menu`（已安装）
- 滚动区使用 `ScrollArea` 组件
- 树节点展开/折叠使用 `ChevronDown`/`ChevronRight` 图标

## 变更方案

### 1. 新增类型：`src/renderer/src/types/fileExplorer.ts`

```ts
/** 文件树节点 */
export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

/** 文件资源管理器状态 */
export interface FileExplorerState {
  /** 工作区根目录路径（null 表示未打开文件夹） */
  workspacePath: string | null
  /** 文件树缓存 */
  fileTree: FileNode[]
  /** 加载中 */
  loading: boolean
  /** 已展开的目录路径集合 */
  expandedPaths: Set<string>
}
```

### 2. 新增标签页类型：修改 `src/renderer/src/types/workspace.ts`

**`WorkspaceTabType`** 新增 `'file'`：

```ts
export type WorkspaceTabType = 'connection' | 'query' | 'table' | 'er-analysis' | 'file'
```

**新增 `FileTabState`**：

```ts
/** 文件标签页载荷 */
export interface FileTabState {
  /** 文件绝对路径 */
  filePath: string
  /** 文件名（用于标题） */
  fileName: string
  /** 文件内容 */
  content: string
}
```

**新增 `OpenFileTabPayload`**：

```ts
/** 打开文件标签页的参数 */
export interface OpenFileTabPayload {
  filePath: string
  fileName: string
  content: string
}
```

**`WorkspaceState`** 新增方法：

```ts
/** 打开文件标签页（同文件路径去重） */
openFileTab: (payload: OpenFileTabPayload) => string
```

### 3. 新增 IPC 模块：`src/main/ipc/fs.ts`

注册以下 IPC 通道（均使用 `fs:` 命名空间）：

| 通道             | 功能                         | 实现                     |
| ---------------- | ---------------------------- | ------------------------ |
| `fs:pick-folder` | 唤起系统目录选择器           | `dialog.showOpenDialog`  |
| `fs:read-dir`    | 读取目录内容（排除隐藏文件） | `fs.readdir` + `fs.stat` |
| `fs:read-file`   | 读取文件内容（UTF-8）        | `fs.readFile`            |
| `fs:write-file`  | 写入文件内容                 | `fs.writeFile`           |
| `fs:show-item`   | 在系统文件管理器中定位       | `shell.showItemInFolder` |
| `fs:file-exists` | 检查文件是否存在             | `fs.existsSync`          |

### 4. 修改预加载：`src/preload/index.ts` + `src/preload/index.d.ts`

**`index.d.ts`** 新增 `FileSystemApi` 接口：

```ts
export interface FileSystemApi {
  pickFolder(): Promise<string | null>
  readDir(dirPath: string): Promise<FileNode[]>
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  showItemInFolder(filePath: string): Promise<void>
  fileExists(filePath: string): Promise<boolean>
}
```

**`Api`** 接口新增：

```ts
fs: FileSystemApi
```

**`index.ts`** 新增 `fs` 工厂：

```ts
fs: {
  pickFolder: createInvoke<[], string | null>('fs:pick-folder'),
  readDir: createInvoke<[string], FileNode[]>('fs:read-dir'),
  readFile: createInvoke<[string], string>('fs:read-file'),
  writeFile: createInvoke<[string, string], void>('fs:write-file'),
  showItemInFolder: createInvoke<[string], void>('fs:show-item'),
  fileExists: createInvoke<[string], boolean>('fs:file-exists')
}
```

### 5. 新增状态管理：`src/renderer/src/store/fileExplorerStore.ts`

Zustand store（不持久化，瞬态）：

```ts
interface FileExplorerStoreState {
  workspacePath: string | null
  fileTree: FileNode[]
  loading: boolean
  expandedPaths: Set<string>

  openFolder: () => Promise<void>
  refreshTree: () => Promise<void>
  toggleExpand: (path: string) => void
  loadChildren: (dirPath: string) => Promise<FileNode[]>
  createSqlFile: (parentDir: string, baseName: string) => Promise<string | null>
  closeWorkspace: () => void
}
```

**懒加载机制**：

- `openFolder`：调用 `fs:pick-folder` 获取路径 → 调用 `loadChildren` 加载根目录 → 存到 `fileTree`
- `toggleExpand`：切换 `expandedPaths` 集合；若目录未加载子节点则调用 `loadChildren`
- `loadChildren`：调用 `fs:read-dir` 获取目录内容 → 过滤隐藏文件 → 排序（目录在前，文件在后，按名称字母序）

### 6. 新建文件组件

#### 6.1 `src/renderer/src/components/file/FileExplorer.tsx`

文件资源管理器主面板，结构对标 `SchemaTree.tsx`：

```
┌─────────────────────────────────┐
│ 文件资源管理器  [+文件夹] [📄SQL] [🔄] │  ← 标题栏
├─────────────────────────────────┤
│ 📁 src/                         │  ← 文件树（ScrollArea）
│   📁 components/                │
│     📄 App.tsx.sql              │
│     📄 index.tsx.sql            │
│   📄 main.sql                   │
│ 📁 public/                      │
│   📄 package.json               │  ← 普通文件（灰色图标）
└─────────────────────────────────┘
```

- 标题栏按钮：`+文件夹`（打开文件夹）、`+SQL`（新建 SQL 文件）、`🔄`（刷新）
- 头部不显示文件夹路径，仅显示"文件资源管理器"标题
- 未打开文件夹时显示空态引导

#### 6.2 `src/renderer/src/components/file/FileTreeNode.tsx`

单个文件/目录节点：

- 目录：点击展开/折叠，显示 `ChevronDown`/`ChevronRight` + `Folder` 图标
- SQL 文件：`FileCode` 图标 + 文件名
- 其他文件：`File` 图标（灰色）+ 文件名
- 右键菜单（目录）：新建 SQL 脚本、在系统文件夹显示
- 右键菜单（文件）：在系统文件夹显示
- 双击 SQL 文件：调用 `openFileTab` 打开编辑器标签页

#### 6.3 `src/renderer/src/components/file/FilePanel.tsx`

文件编辑器标签页面板，对标 `QueryPanel.tsx`：

```
┌─────────────────────────────────┐
│ [文件图标] /path/to/file.sql    │  ← 工具栏
│                          [保存]  │
├─────────────────────────────────┤
│ Monaco Editor (pgsql)           │  ← 编辑器
├─────────────────────────────────┤
│ ResultTable (可执行 SQL)        │  ← 结果区
└─────────────────────────────────┘
```

- 使用 `SqlEditor` 组件（Monaco 编辑器，pgsql 语法高亮）
- 由于是文件标签页（无数据库连接），不需要 SQL 补全和 `Ctrl+Enter` 执行
- 支持 `Ctrl+S` 保存到文件系统
- 显示文件路径作为工具栏信息

### 7. 修改 `src/renderer/src/store/workspaceStore.ts`

**新增 `openFileTab`**（同文件路径去重）：

```ts
openFileTab: (payload: OpenFileTabPayload) => {
  let newId = ''
  set((state) => {
    const existing = state.tabs.find((t) => {
      if (t.type !== 'file') return false
      const s = t.state as FileTabState | undefined
      return s?.filePath === payload.filePath
    })
    if (existing) {
      newId = existing.id
      return { activeTabId: existing.id }
    }
    newId = uuidv4()
    const newTab: WorkspaceTab = {
      id: newId,
      type: 'file',
      title: payload.fileName,
      closable: true,
      pinned: false,
      state: {
        filePath: payload.filePath,
        fileName: payload.fileName,
        content: payload.content
      }
    }
    return {
      tabs: [...state.tabs, newTab],
      activeTabId: newId
    }
  })
  return newId
}
```

**持久化文件标签页**：修改 `sanitizeForPersist`，文件标签页保留 `filePath` 和 `fileName`，剥离 `content`。下次启动时通过 `migrate` 恢复——读取文件内容填充 `content`。

**`migrate` 增强**：启动时对 `type === 'file'` 的标签页，尝试通过 `fs:read-file` 恢复文件内容；若文件不存在则跳过该标签页。

### 8. 修改 `src/renderer/src/components/work/WorkspacePanel.tsx`

新增 `file` 类型分支：

```tsx
{
  activeTab?.type === 'file' && <FilePanel tab={activeTab} />
}
```

### 9. 修改 `src/renderer/src/components/work/WorkspaceHome.tsx`

左侧面板改为可切换的标签页式面板：

```
┌──────────────────────────────────┐
│ [数据库结构] [文件资源管理器]      │  ← 标签切换
├──────────────────────────────────┤
│ SchemaTree / FileExplorer        │
└──────────────────────────────────┘
```

使用 `shellStore` 新增 `leftPanelTab: 'schema' | 'files'` 状态来控制。

### 10. 修改 `src/renderer/src/store/shellStore.ts`

新增：

```ts
leftPanelTab: 'schema' | 'files'
setLeftPanelTab: (tab: 'schema' | 'files') => void
```

### 11. 修改 `src/renderer/src/config/modes.tsx`

在 Work 模式的 `menuGroups` 中新增"文件资源管理器"菜单项，点击切换到文件面板。

### 12. 修改 `src/main/ipc/index.ts`

注册新的 `fs` IPC 模块：

```ts
import { registerFsIPC } from './fs'
// 在 registerAllIPC 中调用
registerFsIPC()
```

## 文件清单

### 新增文件

| 文件                                                | 说明                   |
| --------------------------------------------------- | ---------------------- |
| `src/main/ipc/fs.ts`                                | 文件系统 IPC 处理器    |
| `src/renderer/src/types/fileExplorer.ts`            | 文件资源管理器类型定义 |
| `src/renderer/src/store/fileExplorerStore.ts`       | 文件资源管理器状态管理 |
| `src/renderer/src/components/file/FileExplorer.tsx` | 文件资源管理器主面板   |
| `src/renderer/src/components/file/FileTreeNode.tsx` | 文件/目录树节点        |
| `src/renderer/src/components/file/FilePanel.tsx`    | 文件编辑器标签页面板   |

### 修改文件

| 文件                                                  | 变更                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/renderer/src/types/workspace.ts`                 | 新增 `'file'` 类型、`FileTabState`、`OpenFileTabPayload`、`openFileTab` 方法签名 |
| `src/renderer/src/store/workspaceStore.ts`            | 实现 `openFileTab`，修改 `sanitizeForPersist` 和 `migrate` 持久化文件标签页      |
| `src/renderer/src/store/shellStore.ts`                | 新增 `leftPanelTab` 状态                                                         |
| `src/renderer/src/types/shell.ts`                     | 新增 `leftPanelTab` 和对应方法类型                                               |
| `src/renderer/src/config/modes.tsx`                   | 新增文件资源管理器菜单项                                                         |
| `src/renderer/src/components/work/WorkspaceHome.tsx`  | 左侧面板改为标签页切换                                                           |
| `src/renderer/src/components/work/WorkspacePanel.tsx` | 新增 `'file'` 类型渲染分支                                                       |
| `src/preload/index.ts`                                | 新增 `fs` API 工厂                                                               |
| `src/preload/index.d.ts`                              | 新增 `FileSystemApi` 接口                                                        |
| `src/main/ipc/index.ts`                               | 注册 `registerFsIPC`                                                             |

## 行为定义

| 操作                             | 行为                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| 点击「+ 文件夹」按钮             | 唤起系统目录选择器 → 选中后设为工作区根目录 → 加载文件树    |
| 展开目录                         | 调用 `fs:read-dir` 懒加载子节点                             |
| 点击目录名                       | 切换展开/折叠                                               |
| 双击 `.sql` 文件                 | 读取文件内容 → `openFileTab` 打开编辑器标签页（同路径去重） |
| 双击其他文件                     | 无操作（暂不支持编辑）                                      |
| 右键目录 → 新建 SQL 脚本         | 弹出输入框 → 创建文件（冲突时追加 `(1)` 后缀）              |
| 右键文件/目录 → 在系统文件夹显示 | 调用 `shell.showItemInFolder`                               |
| 右键空白区域 → 新建 SQL 脚本     | 在根目录创建                                                |
| 点击「刷新」按钮                 | 清空目录缓存 → 重新扫描根目录                               |
| 点击「+SQL」按钮                 | 在根目录创建 SQL 脚本                                       |
| `Ctrl+S` 保存文件                | 将编辑器内容写入文件系统                                    |
| 关闭文件标签页                   | 未保存内容提示？—— 暂不做脏检测，直接关闭                   |
| 应用重启                         | 文件标签页路径持久化，启动时恢复（读取文件内容填充）        |

## 验证步骤

1. `pnpm run typecheck` — 0 错误
2. `pnpm run lint` — 0 错误 0 警告
3. `pnpm run format` — 格式一致
4. 手动测试：
   - 点击「+ 文件夹」→ 选中本地目录 → 文件树正确显示，忽略 `.git` 等隐藏文件
   - 展开子目录 → 懒加载正常
   - 双击 `.sql` 文件 → 打开编辑器标签页，内容正确
   - 再次双击同一个文件 → 切换到已有标签页（去重）
   - 右键目录 → 新建 SQL 脚本 → 文件创建成功
   - 右键文件 → 在系统文件夹显示 → 系统资源管理器打开并定位
   - 刷新按钮 → 文件树重新加载
   - 关闭并重启应用 → 文件标签页恢复
