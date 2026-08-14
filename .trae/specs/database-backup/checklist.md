# Checklist

- [x] `db:backup-database` IPC 通道正确注册，参数校验完整
- [x] preload 层正确暴露 `backupDatabase` API，类型声明同步更新
- [x] `queryService.backupDatabase` 方法签名正确
- [x] BackupDialog 组件渲染正常，目录选择器可正常唤起
- [x] 备份执行中按钮禁用 + 显示加载态
- [x] 备份失败后错误信息显示正常，可重试
- [x] 备份成功后显示成功提示和文件路径
- [x] DatabaseNode 三点菜单中"数据库备份"项可见（Work 模式）
- [x] Code 模式下不显示"数据库备份"菜单项
- [x] TypeScript 编译无错误
