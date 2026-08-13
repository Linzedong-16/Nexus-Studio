# Phase 1 数据模型：顶部项目选择器与 VSCode 风格文件资源管理器

## 实体总览

| 实体                              | 对应 spec Key Entity | 归属层                                   |
| --------------------------------- | --------------------- | ---------------------------------------- |
| Project（激活项目根）             | 项目（Project）       | `projectStore` 状态（不持久化）           |
| RecentProjectEntry（最近项目记录） | 最近项目记录           | `ConfigStore.recentProjects`（持久化）    |
| FileNode（文件树节点）             | 文件树节点             | `projectStore.fileTree`（不持久化）       |
| FileTab（文件标签页）              | 文件标签页             | `workspaceStore` 既有 `WorkspaceTab` 的文件类型分支（不持久化内容，仅持久化标签结构） |

---

## 1. Project（激活项目根）

不作为独立命名类型，由 `projectStore` 的以下字段表达：

| 字段              | 类型             | 说明                                   |
| ----------------- | ---------------- | -------------------------------------- |
| `activeProjectPath` | `string \| null` | 当前激活项目的绝对路径；`null` 表示未打开任何项目 |
| `activeProjectName` | `string \| null` | 派生字段（`path.basename` 语义的字符串裁剪），供顶部入口展示 |

**校验规则**：`activeProjectPath` 变更时必须触发 `workspaceStore.closeFileTabsUnderPath(旧路径)`（FR-025），且必须重置 `fileTree`/`expandedPaths`/`selectedPath`（FR-012）。

---

## 2. RecentProjectEntry（最近项目记录）

```ts
/**
 * 「最近」列表中的一条项目文件夹历史记录
 */
interface RecentProjectEntry {
  /** 项目文件夹绝对路径，唯一标识 */
  path: string
  /** 显示名称（文件夹名） */
  name: string
  /** 最后一次被使用（激活）的时间戳（毫秒） */
  lastUsedAt: number
}
```

**归属**：`ConfigStore.recentProjects: RecentProjectEntry[]`（`src/renderer/src/types/ipc.ts`），持久化于 `electron-store`（`src/main/config/store.ts` 默认值新增 `recentProjects: []`）。

**校验规则**（对应 FR-005/006/007/008）：
- 按 `path` 去重：新增/激活某路径时，若已存在同 `path` 记录，先移除旧记录再插入到最前面（更新 `lastUsedAt`），而不是产生重复项。
- 上限 20 条：插入后若长度超过 20，移除末尾（最久未使用）的记录。
- 排序：数组顺序即最近使用顺序（下标 0 为最近），不再单独维护排序字段。
- 失效处理：激活某条记录前先校验路径存在性（`fsService.exists`）；不存在则从列表移除该记录并提示错误，不进行激活。

---

## 3. FileNode（文件树节点）——沿用并保持不变

```ts
/** 文件树节点（既有类型，本功能不修改结构） */
interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  /** 子节点；目录懒加载前为 undefined，加载后为数组（可为空数组表示空目录） */
  children?: FileNode[]
}
```

**说明**：选中态（`selectedPath`）与展开态（`expandedPaths: Set<string>`）不作为节点自身字段，继续沿用现状——保存在 `projectStore` 顶层状态中，通过路径关联，避免深层不可变更新的复杂度（与现有 `toggleExpand` 实现一致）。

**新增派生规则**：`fsService.readDir` 返回结果需在主进程侧过滤隐藏项（以 `.` 开头的条目，FR-009），排序规则为目录在前、文件在后，各自按名称排序（沿用现状）。

---

## 4. Store 状态与动作契约

### 4.1 `projectStore`（原 `fileExplorerStore.ts` 原地扩展）

```ts
interface ProjectStoreState {
  /** 当前激活项目根路径；null 表示未打开任何项目 */
  activeProjectPath: string | null
  /** 文件树缓存（根目录直接子项起） */
  fileTree: FileNode[]
  /** 加载中 */
  loading: boolean
  /** 已展开的目录路径集合 */
  expandedPaths: Set<string>
  /** 当前选中的文件/文件夹路径 */
  selectedPath: string | null
  /** 最近项目列表（从 ConfigStore 加载的内存副本，按最近使用排序） */
  recentProjects: RecentProjectEntry[]

  /** 应用启动/挂载时加载「最近」列表 */
  loadRecentProjects(): Promise<void>
  /** 打开文件夹：唤起系统目录选择器并激活选中的文件夹为当前项目 */
  openFolder(): Promise<void>
  /** 激活「最近」列表中的一条记录为当前项目；路径失效时移除该记录并提示错误 */
  openRecentProject(path: string): Promise<void>
  /** 关闭当前工作区（激活项目置空，联动关闭其下全部文件标签页） */
  closeWorkspace(): void
  /** 切换目录展开/折叠；首次展开时懒加载子节点（沿用现状） */
  toggleExpand(dirPath: string): Promise<void>
  /** 设置当前选中节点 */
  setSelected(path: string | null): void
  /** 在指定目录下新建文件；名称冲突时抛错 */
  createFile(parentDir: string, name: string): Promise<void>
  /** 在指定目录下新建文件夹；名称冲突时抛错 */
  createFolder(parentDir: string, name: string): Promise<void>
  /** 重命名文件/文件夹；同时触发 workspaceStore.renameFileTab 联动 */
  rename(oldPath: string, newName: string): Promise<void>
  /** 删除文件/文件夹（移入回收站）；同时触发 workspaceStore.closeFileTabsUnderPath 联动 */
  remove(path: string): Promise<void>
  /** 拖拽移动文件/文件夹到目标目录；名称冲突或非法嵌套时抛错 */
  move(sourcePath: string, targetDirPath: string): Promise<void>
}
```

**关键流程**（均对应 spec 中的 FR/Acceptance Scenario，供 `/speckit-tasks` 拆解为具体任务）：

- `openFolder()` / `openRecentProject()` 末尾统一调用一个内部 `activateProject(path)`：`workspaceStore.closeFileTabsUnderPath(get().activeProjectPath)` → 重置 `fileTree`/`expandedPaths`/`selectedPath` → 设置新 `activeProjectPath` → 加载根目录直接子项 → 更新并持久化 `recentProjects`（经 `configService`）。
- `rename(oldPath, newName)`：调用 `fsService.rename` 得到 `newPath` → 刷新父目录节点的 `children` → `workspaceStore.renameFileTab(oldPath, newPath)` → 若 `oldPath === selectedPath` 则同步更新为 `newPath`。
- `remove(path)`：调用 `fsService.delete` → 从 `fileTree` 中移除对应节点 → `workspaceStore.closeFileTabsUnderPath(path)` → 若 `path === selectedPath` 则清空选中。
- `move(sourcePath, targetDirPath)`：客户端先校验 `targetDirPath` 不等于且不是 `sourcePath` 的子孙路径（FR-017 边界），通过后调用 `fsService.move` → 刷新源目录与目标目录两侧节点。

### 4.2 `workspaceStore` 新增动作

```ts
interface WorkspaceStoreNewActions {
  /**
   * 关闭所有属于指定路径（文件本身，或目录及其下全部内容）的文件标签页
   * 匹配规则：tab.filePath === rootPath 或 tab.filePath 以 `${rootPath}${分隔符}` 为前缀
   */
  closeFileTabsUnderPath(rootPath: string): void

  /**
   * 将匹配旧路径（文件本身，或目录及其下全部内容）的文件标签页更新为新路径
   * 更新 filePath 与标题（title），不改变标签页的其他状态（内容/未保存标记）
   */
  renameFileTab(oldPath: string, newPath: string): void
}
```

**调用时机**：
- `closeFileTabsUnderPath` ← 项目切换时（旧 `activeProjectPath`）、删除文件/文件夹时（被删除路径）。
- `renameFileTab` ← 重命名文件/文件夹时（旧路径 → 新路径）。

---

## 5. 类型文件改动清单

| 文件                                              | 改动                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `src/renderer/src/types/fileExplorer.ts`          | 新增 `RecentProjectEntry` 接口；`FileNode` 保持不变                  |
| `src/renderer/src/types/ipc.ts`                   | `ConfigStore` 新增 `recentProjects: RecentProjectEntry[]`；`FileSystemApi` 补充新方法签名（见 [contracts/fs-ipc.md](./contracts/fs-ipc.md)） |
| `src/renderer/src/types/workspace.ts`             | 补充 `closeFileTabsUnderPath`/`renameFileTab` 的动作类型签名          |
| `src/main/config/store.ts`                        | `defaults` 新增 `recentProjects: []`                                 |
