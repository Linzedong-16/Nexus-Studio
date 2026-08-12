# SQL 自动补全 Spec

## Why
当前 SQL 编辑器仅提供语法高亮，缺少 schema-aware 自动补全能力。用户在编写 SQL 时需要手动输入表名、列名、函数名，效率低且易出错。需实现类似主流数据库客户端（DataGrip、DBeaver）的智能补全，且架构上需要支持多数据库类型扩展。

## What Changes
- 新增 SQL 补全配置模块，按数据库类型分离关键字、内置函数、数据类型
- 新增 Monaco CompletionItemProvider，注册到 pgsql 语言
- SqlEditor 接收连接上下文（connectionId、database、schema），从 connectionStore 获取已加载的 schema 元数据
- 补全项按优先级排序：列名 > 表名 > Schema 名 > 函数 > 关键字 > 数据类型
- 补全项显示图标区分类型（表、列、函数、关键字等）

## Impact
- Affected specs: 无（新功能）
- Affected code:
  - `src/renderer/src/lib/monaco.ts` — 注册补全提供者
  - `src/renderer/src/lib/monaco/completionProvider.ts` — **新建**，补全逻辑
  - `src/renderer/src/lib/monaco/sqlConfig.ts` — **新建**，按数据库类型的 SQL 关键字/函数/类型配置
  - `src/renderer/src/components/work/SqlEditor.tsx` — 接收连接上下文 prop，在 onMount 时注册补全
  - `src/renderer/src/components/work/QueryPanel.tsx` — 传递 connectionId/database/schema 给 SqlEditor

## ADDED Requirements

### Requirement: SQL 关键字与内置函数按数据库类型分离配置
系统 SHALL 提供按 `DatabaseType` 分离的 SQL 关键字、内置函数、数据类型配置，新增数据库类型时只需新增一条配置记录。

#### Scenario: 获取 PostgreSQL 补全配置
- **WHEN** 系统获取 `postgresql` 类型的补全配置
- **THEN** 返回包含 PostgreSQL 关键字（SELECT、FROM、WHERE 等）、内置函数（COUNT、SUM、NOW 等）、数据类型（INTEGER、VARCHAR、TEXT 等）的配置对象

#### Scenario: 扩展新数据库类型
- **WHEN** 开发者新增 `mysql` 类型的补全配置
- **THEN** 仅需在 `sqlConfig.ts` 中添加一条 `mysql` 配置项，无需修改补全提供者逻辑

### Requirement: Schema-aware 补全
系统 SHALL 在 SQL 编辑器光标位置提供 schema-aware 的自动补全建议，包括已连接数据库中的表名、列名、Schema 名、视图名、函数名、存储过程名。

#### Scenario: 补全表名
- **WHEN** 用户在 SQL 编辑器中输入 `FROM ` 或 `JOIN `
- **THEN** 系统从 connectionStore 中获取当前数据库下已加载 Schema 的所有表名和视图名，作为补全建议

#### Scenario: 补全列名
- **WHEN** 用户在 SQL 编辑器中输入 `SELECT ` 或 `WHERE ` 后
- **THEN** 系统从 connectionStore 中获取当前数据库下已加载 Schema 的所有表的列名，作为补全建议

#### Scenario: 补全 Schema 名
- **WHEN** 用户在 SQL 编辑器中输入表限定名 `schema.` 或光标在合适位置
- **THEN** 系统提供当前数据库下已加载的 Schema 名列表

#### Scenario: 补全函数名
- **WHEN** 用户在 SQL 编辑器中输入 `SELECT ` 后开始输入函数名
- **THEN** 系统提供当前数据库类型的聚合函数和标量函数名

#### Scenario: 无连接时仅提供关键字补全
- **WHEN** 查询标签页无有效连接上下文（connectionId 为空或连接未建立）
- **THEN** 系统仅提供 SQL 关键字和数据类型补全，不提供 schema 元数据补全

### Requirement: 补全项类型识别与图标
系统 SHALL 为不同类型的补全项提供不同的 Monaco CompletionItemKind 和图标区分。

#### Scenario: 补全项类型区分
- **WHEN** 补全列表展示
- **THEN** 表名显示为 `Class` 图标、列名显示为 `Field` 图标、函数显示为 `Function` 图标、关键字显示为 `Keyword` 图标、Schema 名显示为 `Module` 图标、数据类型显示为 `Struct` 图标

### Requirement: 补全项排序
系统 SHALL 按以下优先级排序补全项：列名 > 表名 > Schema 名 > 函数 > 关键字 > 数据类型。

#### Scenario: 补全项排序
- **WHEN** 用户触发补全
- **THEN** 列名排在最前，数据类型排在最后，同类型内按字母序排列

### Requirement: SqlEditor 连接上下文传递
SqlEditor 组件 SHALL 接收 `connectionId`、`database`、`schema` prop，并在 Monaco 编辑器挂载时注册补全提供者。

#### Scenario: 编辑器挂载时注册补全
- **WHEN** SqlEditor 的 Monaco 编辑器完成挂载
- **THEN** 系统调用 `registerCompletionProvider(monaco, connectionId, database, schema)` 注册补全提供者

#### Scenario: 连接上下文变化时更新补全数据
- **WHEN** 用户在同一个查询标签页中切换了数据库或 schema
- **THEN** 补全提供者从 connectionStore 中读取最新的 schema 元数据