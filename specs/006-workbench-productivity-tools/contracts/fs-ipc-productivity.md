# IPC 契约：文件系统对话框（导出保存 / 导入选择）

**Feature**: `006-workbench-productivity-tools` | **关联文件**: `src/main/ipc/fs.ts`、`src/preload/index.ts`、`src/preload/index.d.ts`

## 现状

`fs:*` 通道（`src/main/ipc/fs.ts`）已有 `fs:pick-folder`（仅支持选择目录，用于任务调度器的导出目录选择等场景），但没有：

- 选择"保存文件路径"的对话框（导出查询结果需要，FR-006）。
- 按扩展名过滤、选择"已存在的单个文件"的对话框（导入需要，FR-022）。

## 改造后

新增两个 IPC 通道，均复用 `fs:pick-folder` 已建立的 `createIPCHandler` + Electron `dialog` 实现风格：

| 通道                | 参数                                                                           | 返回                      | 说明                                                                                           |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `fs:pick-save-file` | `(defaultFileName: string, filters: { name: string; extensions: string[] }[])` | `Promise<string \| null>` | 对应 `dialog.showSaveDialog`；用户取消时返回 `null`。对应 FR-006                               |
| `fs:pick-open-file` | `(filters: { name: string; extensions: string[] }[])`                          | `Promise<string \| null>` | 对应 `dialog.showOpenDialog({ properties: ['openFile'] })`；用户取消时返回 `null`。对应 FR-022 |

### 使用方式示例

- 导出 CSV：`fs:pick-save-file('export.csv', [{ name: 'CSV', extensions: ['csv'] }])`
- 导出 JSON：`fs:pick-save-file('export.json', [{ name: 'JSON', extensions: ['json'] }])`
- 导入选择文件：`fs:pick-open-file([{ name: '数据文件', extensions: ['csv', 'json', 'sql'] }])`

### 覆盖确认（Edge Case：导出文件已存在于目标路径）

`dialog.showSaveDialog` 在原生系统对话框层面已经内置"文件已存在时询问是否覆盖"的行为（Windows/macOS 原生对话框标准行为），因此不需要在应用层额外实现覆盖确认逻辑；用户在系统对话框中选择覆盖后返回的路径即为最终写入路径。

## 渲染进程 Service 层新增方法（`src/renderer/src/services/fsService.ts`）

```typescript
async pickSaveFile(defaultFileName: string, filters: { name: string; extensions: string[] }[]): Promise<string | null>
async pickOpenFile(filters: { name: string; extensions: string[] }[]): Promise<string | null>
```

风格与现有 `pickFolder`/`readFile`/`writeFile` 等方法一致。

## 错误契约

| 场景             | 触发条件                                      | 行为                                                                                                                                                                     |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 用户取消对话框   | 用户点击取消/关闭对话框                       | 返回 `null`，调用方（导出/导入发起组件）视为"用户中止操作"，不提示错误                                                                                                   |
| 写入导出文件失败 | 磁盘空间不足、目标路径权限不足（对应 FR-011） | `fs:write-file` 现有错误已能覆盖此场景，无需新增通道；导出流程捕获该错误后提示具体原因，并不产生不完整文件（若写入过程中失败，视为整体失败，不做部分写入后的"尽力而为"） |
