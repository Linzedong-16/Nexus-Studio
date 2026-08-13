# Tasks

- [x] Task 1: 创建 SQL 补全配置模块（sqlConfig.ts）
  - [x] 定义 `SqlCompletionConfig` 接口（keywords、functions、dataTypes、snippets）
  - [x] 实现 `SQL_COMPLETION_CONFIG` 按 DatabaseType 索引的配置表
  - [x] 填充 PostgreSQL 完整关键字（DML、DDL、DCL）、内置函数（聚合函数、窗口函数、数学函数、字符串函数、日期函数、JSON 函数等）、数据类型、代码片段（SELECT、INSERT、UPDATE、CREATE TABLE 等）

- [x] Task 2: 创建 Monaco 补全提供者（completionProvider.ts）
  - [x] 实现 `registerCompletionProvider(monaco, options)` 函数
  - [x] 从 connectionStore 读取已加载的 schema 元数据（数据库列表、Schema 列表、表/视图、列、函数、存储过程）
  - [x] 实现上下文感知补全逻辑（FROM 子句后补全表名，SELECT 后补全列名，schema. 后补全表名等）
  - [x] 按优先级排序补全项（列名 > 表名 > Schema > 函数 > 关键字 > 数据类型）
  - [x] 为每种补全项设置正确的 CompletionItemKind 和 detail 信息

- [x] Task 3: 在 monaco.ts 中集成补全模块
  - [x] 导出 `registerCompletionProvider` 供 SqlEditor 调用
  - [x] 确保补全模块与现有 Monaco 引导逻辑兼容

- [x] Task 4: SqlEditor 组件接收连接上下文并注册补全
  - [x] 新增 `connectionId`、`database`、`schema` prop
  - [x] 在 `handleMount` 中调用 `registerCompletionProvider`
  - [x] 确保 prop 变化时补全数据能跟随更新（使用 ref 保持最新引用）

- [x] Task 5: QueryPanel 传递连接上下文
  - [x] 从 tab.state 中提取 connectionId、database、schema，传递给 SqlEditor

- [x] Task 6: typecheck + lint 验证
  - [x] 运行 `pnpm run typecheck`，确保 0 错误
  - [x] 运行 `pnpm run lint`，确保 0 错误/警告

# Task Dependencies

- Task 2 依赖 Task 1（补全提供者需要配置模块）
- Task 3 依赖 Task 2（集成需要补全提供者完成）
- Task 4 依赖 Task 3（SqlEditor 需要可用的补全注册函数）
- Task 5 依赖 Task 4（QueryPanel 需要 SqlEditor 新 prop）
- Task 6 依赖 Task 5（验证需要全部代码完成）
