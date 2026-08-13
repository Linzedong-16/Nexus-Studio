# IPC 契约：文件系统操作扩展（`fs:*`）

本契约仅覆盖本功能新增/变更的通道；既有通道（`fs:pick-folder`、`fs:read-dir`、`fs:read-file`、`fs:write-file`、`fs:show-item`、`fs:file-exists`）保持不变，继续沿用现有实现。

约定：所有通道均为双向 `invoke`/`handle`；主进程发现错误（如路径不存在、名称冲突、非法嵌套）时 `throw`，渲染进程 `fsService` 捕获后转换为面向用户的提示，主进程处理器内部不包含任何 UI 逻辑（宪法 V）。

## 新增通道一览

| 通道                  | 对应 FR        | 入参                                        | 返回值                                    | 主要错误场景                                                               |
| --------------------- | -------------- | ------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| `fs:create-file`      | FR-013/019     | `parentDir: string, name: string`           | `string`（新建文件的绝对路径）            | `parentDir` 下已存在同名条目                                               |
| `fs:create-directory` | FR-013/019     | `parentDir: string, name: string`           | `string`（新建目录的绝对路径）            | `parentDir` 下已存在同名条目                                               |
| `fs:rename`           | FR-014/019/026 | `oldPath: string, newName: string`          | `string`（重命名后的绝对路径）            | 目标目录下已存在同名条目；`oldPath` 不存在                                 |
| `fs:delete`           | FR-015/024     | `path: string`                              | `void`                                    | `path` 不存在；移入回收站失败（系统级异常）                                |
| `fs:move`             | FR-017         | `sourcePath: string, targetDirPath: string` | `string`（移动后的绝对路径）              | 目标目录下已存在同名条目；`targetDirPath` 是 `sourcePath` 自身或其子孙目录 |
| `fs:read-file-safe`   | FR-020/021     | `path: string`                              | `{ isBinary: boolean; content?: string }` | `path` 不存在或无读取权限                                                  |

## 详细签名

### `fs:create-file`

```ts
/**
 * 在指定目录下创建一个空文件
 * @param parentDir 目标父目录绝对路径
 * @param name 新文件名（含扩展名）
 * @returns 新建文件的绝对路径
 * @throws 当 parentDir 下已存在同名文件/文件夹时抛出错误
 */
createFile(parentDir: string, name: string): Promise<string>
```

### `fs:create-directory`

```ts
/**
 * 在指定目录下创建一个空文件夹
 * @param parentDir 目标父目录绝对路径
 * @param name 新文件夹名
 * @returns 新建文件夹的绝对路径
 * @throws 当 parentDir 下已存在同名文件/文件夹时抛出错误
 */
createDirectory(parentDir: string, name: string): Promise<string>
```

### `fs:rename`

```ts
/**
 * 重命名文件或文件夹（同目录内改名，不跨目录）
 * @param oldPath 原绝对路径
 * @param newName 新名称（不含目录部分）
 * @returns 重命名后的绝对路径
 * @throws 当目标名称与同目录下已有条目冲突，或 oldPath 不存在时抛出错误
 */
rename(oldPath: string, newName: string): Promise<string>
```

### `fs:delete`

```ts
/**
 * 删除文件或文件夹（移入操作系统回收站/垃圾桶，可恢复）
 * @param path 待删除条目的绝对路径
 * @throws 当 path 不存在或系统级删除操作失败时抛出错误
 */
deleteItem(path: string): Promise<void>
```

### `fs:move`

```ts
/**
 * 将文件或文件夹移动到目标目录下（用于拖拽移动）
 * @param sourcePath 待移动条目的绝对路径
 * @param targetDirPath 目标父目录绝对路径
 * @returns 移动后的绝对路径
 * @throws 当目标目录下已存在同名条目，或 targetDirPath 是 sourcePath 自身/子孙目录时抛出错误
 */
moveItem(sourcePath: string, targetDirPath: string): Promise<string>
```

### `fs:read-file-safe`

```ts
/**
 * 安全读取文件：先探测是否为二进制文件，二进制文件不读取全文内容
 * @param path 文件绝对路径
 * @returns isBinary 为 true 时 content 字段省略；为 false 时 content 为完整文本内容
 * @throws 当 path 不存在或读取权限被拒绝时抛出错误
 */
readFileSafe(path: string): Promise<{ isBinary: boolean; content?: string }>
```

## `preload` 侧类型契约（`FileSystemApi` 增量）

```ts
interface FileSystemApi {
  // ……既有方法（pickFolder/readDir/readFile/writeFile/showItem/fileExists）保持不变
  createFile(parentDir: string, name: string): Promise<string>
  createDirectory(parentDir: string, name: string): Promise<string>
  rename(oldPath: string, newName: string): Promise<string>
  deleteItem(path: string): Promise<void>
  moveItem(sourcePath: string, targetDirPath: string): Promise<string>
  readFileSafe(path: string): Promise<{ isBinary: boolean; content?: string }>
}
```

## 复用的既有通道（配置持久化）

「最近项目」列表不新增专用通道，复用既有通用配置通道：

```ts
// 读取
const recentProjects = (await window.api.config.get('recentProjects')) as RecentProjectEntry[]
// 写入
await window.api.config.set('recentProjects', updatedList)
```

## 不通过 IPC 的操作

- **复制路径 / 复制相对路径**：渲染进程直接调用 `navigator.clipboard.writeText()`，不经过主进程（详见 [research.md](../research.md) 决策 3）。
