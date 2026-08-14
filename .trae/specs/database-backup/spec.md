# 数据库备份 Spec

## Why
当前 DatabaseNode 的三点菜单（`MoreHorizontal`）仅包含"ER 分析"，缺乏数据库备份入口。`pg_dump` 逻辑已在 `TaskScheduler` 中实现，但只能通过定时任务间接触发，用户需要右键直接备份数据库。

## What Changes
- DatabaseNode 三点菜单新增"数据库备份"菜单项
- 点击后弹出备份配置对话框：选择导出目录、可选指定 pg_dump 路径
- 新增 IPC 通道 `db:backup-database` 调用现有 pg_dump 逻辑
- 备份完成后显示成功/失败提示

## Impact
- Affected specs: 无
- Affected code: `DatabaseNode.tsx`、`src/main/ipc/db.ts`、`src/preload/index.ts`、`src/renderer/src/services/queryService.ts`

## ADDED Requirements
### Requirement: 数据库备份菜单项
DatabaseNode 的三点菜单中 SHALL 新增"数据库备份"选项。

#### Scenario: 点击备份菜单项
- **WHEN** 用户在 DatabaseNode 右侧三点菜单中点击"数据库备份"
- **THEN** 弹出备份配置对话框，默认导出目录为空，pg_dump 路径为空（自动探测 PATH）

### Requirement: 备份配置对话框
系统 SHALL 提供备份配置对话框，包含导出目录选择（系统目录选择器）和可选的 pg_dump 路径。

#### Scenario: 选择导出目录
- **WHEN** 用户点击"选择目录"按钮
- **THEN** 弹出系统原生目录选择器，选中后路径回填到输入框

#### Scenario: 执行备份
- **WHEN** 用户填写导出目录后点击"开始备份"
- **THEN** 调用 `db:backup-database` IPC 执行 pg_dump，输出文件命名为 `dump-{database}-{timestamp}.sql`，完成后显示成功提示

#### Scenario: 备份失败
- **WHEN** pg_dump 执行失败
- **THEN** 对话框内显示错误信息，用户可重试
