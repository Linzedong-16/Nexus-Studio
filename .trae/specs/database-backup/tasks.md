# Tasks

- [x] Task 1: 新增 IPC 通道 `db:backup-database` 复用 pg_dump 逻辑
  - [x] 在 `src/main/ipc/db.ts` 中注册 `db:backup-database` 处理器，接收 `{ connectionId, database, exportDir, pgDumpPath? }` 参数
  - [x] 从 `configStore` 读取连接配置，解密密码，拼装 pg_dump 命令参数
  - [x] 通过 `child_process.execFile` 执行 pg_dump，返回成功/失败结果
  - [x] 在 `src/preload/index.ts` 中暴露 `backupDatabase` API
  - [x] 在 `src/renderer/src/services/queryService.ts` 中添加 `backupDatabase` 方法

- [x] Task 2: 创建备份配置对话框组件 `BackupDialog.tsx`
  - [x] 使用 Radix UI Dialog 组件，包含标题"数据库备份"
  - [x] 显示当前数据库名（只读）
  - [x] 导出目录输入框 + "选择目录"按钮（调用 `fs:pick-folder`）
  - [x] pg_dump 路径输入框（可选，placeholder 提示"留空自动探测 PATH"）
  - [x] "开始备份"按钮 + 取消按钮
  - [x] 加载态：备份中显示 spinner + 禁用按钮
  - [x] 错误态：显示错误信息，允许重试
  - [x] 成功态：提示"备份完成"并显示文件路径

- [x] Task 3: DatabaseNode 三点菜单新增"数据库备份"入口
  - [x] 在 `DropdownMenuContent` 中新增 `DropdownMenuItem`，图标使用 `HardDrive`（lucide-react）
  - [x] 点击后打开 BackupDialog
  - [x] 仅在 Work 模式下显示（避免 Code 模式下出现无关操作）

# Task Dependencies
- Task 2 依赖 Task 1（对话框组件需要调用 IPC 通道）
- Task 3 依赖 Task 2（三点菜单需要引用对话框组件）
