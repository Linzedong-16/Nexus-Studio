# 实现计划：结构树"添加"按钮与 SQL 模板

## 摘要

为 PostgreSQL 连接的结构树（ServerNode、DatabaseNode、TableNode、ModuleGroup）增加"添加"按钮，点击后打开预填充对应 SQL 模板的查询编辑器标签页，并实现执行成功后的自动刷新机制。

---

## 当前状态分析

### 结构树层级

- **ServerNode**: 服务器连接节点，展开后显示数据库列表
- **DatabaseNode**: 数据库节点，展开后显示 Schema 列表
- **SchemaNode**: Schema 节点，展开后显示模块分组（Tables/Views/Functions/Procedures）
- **ModuleGroup**: 模块分组（Tables/Views/Functions/Procedures），展开后显示具体条目
- **TableNode**: 表/视图条目节点，展开后显示 Columns/Indexes/Triggers

### 现有"添加"按钮

- 侧边栏已有"新建连接"按钮（`CirclePlus` 图标），调用 `addConnectionTab()`
- 结构树中目前**没有任何"添加/创建"按钮**

### 现有查询标签页机制

- `useWorkspaceStore.openQueryTab(payload)` 创建 query 标签页，参数包含 `defaultSql`
- 同一 `connectionId + database` 去重
- QueryPanel 使用 Monaco Editor 渲染 SQL，自带语法高亮和自动补全
- 执行通过 `queryService.execute()` 调用主进程，结果通过 `setQueryResult()` 写入 store

### connectionStore 刷新机制

- `loadDatabases(id, { force: true })` — 刷新数据库列表
- `loadModuleItems(id, db, schema, kind, { force: true })` — 刷新模块（tables/views/functions/procedures）

---

## 按钮映射与 SQL 模板

| 放置位置                 | 操作         | SQL 模板           |
| ------------------------ | ------------ | ------------------ |
| ServerNode               | 创建数据库   | `CREATE DATABASE`  |
| DatabaseNode             | 创建表       | `CREATE TABLE`     |
| TableNode (表)           | 添加表行     | `INSERT INTO`      |
| ModuleGroup (views)      | 创建视图     | `CREATE VIEW`      |
| ModuleGroup (procedures) | 创建存储过程 | `CREATE PROCEDURE` |
| ModuleGroup (functions)  | 创建函数     | `CREATE FUNCTION`  |

---

## 提议变更

### 1. 新增文件：`src/renderer/src/lib/sqlTemplates.ts`

**是什么**: SQL 模板常量与模板生成函数

**为什么**: 集中管理各类型 SQL 模板，避免硬编码分散在各组件中；模板生成函数根据上下文（schema、table 名）动态填充模板

**怎么做**:

```typescript
// 定义操作类型枚举
export type CreateActionKind =
  | 'createDatabase'
  | 'createTable'
  | 'insertRow'
  | 'createView'
  | 'createProcedure'
  | 'createFunction'

// 模板生成函数，接收上下文参数
export function getSqlTemplate(
  kind: CreateActionKind,
  context: {
    schema?: string
    table?: string
  }
): string
```

模板内容：

- `createDatabase`: `CREATE DATABASE database_name;\n`
- `createTable`: `CREATE TABLE ${schema}.table_name (\n  id SERIAL PRIMARY KEY,\n  ...\n);\n`
- `insertRow`: `INSERT INTO ${schema}.${table} (column1, column2)\nVALUES (value1, value2);\n`
- `createView`: `CREATE VIEW ${schema}.view_name AS\nSELECT ...;\n`
- `createProcedure`: `CREATE PROCEDURE ${schema}.procedure_name()\nLANGUAGE SQL\nAS $$\n  ...\n$$;\n`
- `createFunction`: `CREATE FUNCTION ${schema}.function_name()\nRETURNS ...\nLANGUAGE SQL\nAS $$\n  ...\n$$;\n`

### 2. 修改 `ServerNode.tsx`

**文件**: `src/renderer/src/components/schema/ServerNode.tsx`

**变更**:

- 在现有的 operation buttons 区域（RefreshCw、Unplug 旁）增加一个 `Plus` 图标按钮
- 点击时调用 `openQueryTab()` 打开带 `CREATE DATABASE` 模板的查询标签页
- 仅在 `status === 'connected'` 时显示

**关键代码**:

```tsx
import { Plus } from 'lucide-react'
import { getSqlTemplate } from '@/lib/sqlTemplates'

// 在 ServerNode 的操作按钮区域新增：
;<Plus
  className="size-3 text-muted-foreground hover:text-foreground"
  onClick={(e) => {
    e.stopPropagation()
    openQueryTab({
      connectionId,
      connectionName: conn.config.name,
      database: conn.activeDatabase ?? conn.databases?.[0]?.name ?? 'postgres',
      schema: undefined,
      defaultSql: getSqlTemplate('createDatabase', {})
    })
  }}
  title="创建数据库"
/>
```

注意：需要引入 `useWorkspaceStore` 的 `openQueryTab`。

### 3. 修改 `DatabaseNode.tsx`

**文件**: `src/renderer/src/components/schema/DatabaseNode.tsx`

**变更**:

- 在现有的 RefreshCw 和 DropdownMenu 之间增加一个 `Plus` 图标按钮
- 仅在 `expanded` 时显示（与其他操作按钮一致）
- 点击时打开带 `CREATE TABLE` 模板的查询标签页

**关键代码**:

```tsx
import { Plus } from 'lucide-react'
import { getSqlTemplate } from '@/lib/sqlTemplates'

// 在 DatabaseNode 的操作按钮区域新增：
;<Plus
  className="size-3 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
  onClick={(e) => {
    e.stopPropagation()
    openQueryTab({
      connectionId,
      connectionName,
      database: database.name,
      schema: node?.schemas?.[0]?.name ?? 'public',
      defaultSql: getSqlTemplate('createTable', { schema: node?.schemas?.[0]?.name ?? 'public' })
    })
  }}
  title="创建表"
/>
```

注意：`openQueryTab` 需要从 `useWorkspaceStore` 获取。

### 4. 修改 `TableNode.tsx`

**文件**: `src/renderer/src/components/schema/TableNode.tsx`

**变更**:

- 仅为 `type === 'table'` 的表增加 `Plus` 按钮（视图不添加）
- 在 RefreshCw 按钮旁边增加
- 仅在 `expanded` 时显示
- 点击时打开带 `INSERT INTO` 模板的查询标签页

**关键代码**:

```tsx
import { Plus } from 'lucide-react'
import { getSqlTemplate } from '@/lib/sqlTemplates'
import { useWorkspaceStore } from '@/store/workspaceStore'

// 在 TableNode 的操作按钮区域新增（仅 table 类型）：
{
  table.type === 'table' && expanded && (
    <Plus
      className="size-3 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
      onClick={(e) => {
        e.stopPropagation()
        useWorkspaceStore.getState().openQueryTab({
          connectionId,
          connectionName,
          database,
          schema,
          defaultSql: getSqlTemplate('insertRow', { schema, table: table.name })
        })
      }}
      title="添加行"
    />
  )
}
```

### 5. 修改 `ModuleGroup.tsx`

**文件**: `src/renderer/src/components/schema/ModuleGroup.tsx`

**变更**:

- 为 `views`、`functions`、`procedures` 模块分组各增加一个 `Plus` 按钮
- 在标题行右侧，与 RefreshCw 同行
- 仅在 `expanded` 时显示
- 点击时打开对应模板的查询标签页

**关键代码**:

```tsx
import { Plus } from 'lucide-react'
import { getSqlTemplate } from '@/lib/sqlTemplates'

// 在标题行按钮区域新增（在 RefreshCw 之前）：
{
  expanded && moduleKind !== 'tables' && moduleKind !== 'query' && (
    <Plus
      className="size-3 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
      onClick={(e) => {
        e.stopPropagation()
        const actionKind =
          moduleKind === 'views'
            ? 'createView'
            : moduleKind === 'procedures'
              ? 'createProcedure'
              : 'createFunction'
        openQueryTab({
          connectionId,
          connectionName,
          database,
          schema,
          defaultSql: getSqlTemplate(actionKind, { schema })
        })
      }}
      title={`创建${MODULE_LABEL[moduleKind]}`}
    />
  )
}
```

### 6. 修改 `QueryPanel.tsx` — 执行成功后自动刷新

**文件**: `src/renderer/src/components/work/QueryPanel.tsx`

**内容**:

- 在执行成功（`runQuery` 中 catch 之前）后，解析 SQL 判断创建类型
- 根据类型调用 `connectionStore` 中对应的 force refresh 方法

**关键代码**:

```tsx
import { useConnectionStore } from '@/store/connectionStore'

// 在 runQuery 的 try 块中，setQueryResult 之后：
const sql = state.sql.trim().toUpperCase()
const connStore = useConnectionStore.getState()

if (sql.startsWith('CREATE DATABASE')) {
  void connStore.loadDatabases(state.connectionId, { force: true })
} else if (sql.startsWith('CREATE TABLE')) {
  if (state.schema) {
    void connStore.loadModuleItems(state.connectionId, state.database, state.schema, 'tables', {
      force: true
    })
  }
} else if (sql.startsWith('CREATE VIEW')) {
  if (state.schema) {
    void connStore.loadModuleItems(state.connectionId, state.database, state.schema, 'views', {
      force: true
    })
  }
} else if (sql.startsWith('CREATE PROCEDURE')) {
  if (state.schema) {
    void connStore.loadModuleItems(state.connectionId, state.database, state.schema, 'procedures', {
      force: true
    })
  }
} else if (sql.startsWith('CREATE FUNCTION')) {
  if (state.schema) {
    void connStore.loadModuleItems(state.connectionId, state.database, state.schema, 'functions', {
      force: true
    })
  }
}
```

### 7. 修改 `QueryPanel.tsx` — 执行成功/失败反馈

**文件**: `src/renderer/src/components/work/QueryPanel.tsx`

**内容**:

- 现有的 `ResultTable` 组件已经处理了成功（显示结果表格）和失败（显示错误信息）两种状态，无需额外改动
- 对于 CREATE/INSERT 等非查询语句，PostgreSQL 返回的 `rowCount` 为 `null` 或 `0`，`ResultTable` 会显示"无结果"或受影响的命令标签（如 "CREATE TABLE"），这已经是合理的反馈

---

## 假设与决策

1. **按钮映射**: 6 个按钮对应 6 个 SQL 模板，映射关系如上表所示
2. **Schema 默认值**: 创建表时，如果 DatabaseNode 已有 Schema 列表，默认使用第一个 Schema；否则使用 `public`
3. **DatabaseNode 的 activeDatabase**: 创建数据库的按钮在 ServerNode 上，需要选择一个数据库来打开查询标签页（因为 query tab 需要 database 参数），使用 `activeDatabase` 或第一个数据库
4. **自动刷新粒度为模块级**: 创建表/视图/函数/存储过程后刷新整个模块列表，而非单条记录
5. **按钮样式**: 遵循现有 pattern（`opacity-0 group-hover:opacity-100`），仅在 hover 时显示
6. **SQL 语法高亮**: Monaco Editor 已内置 `pgsql` 语言支持，无需额外配置
7. **SQL 格式化**: 当前项目不包含 SQL 格式化功能，计划中不新增（超出需求范围）

---

## 涉及文件清单

| 文件                                                  | 操作     | 说明                                         |
| ----------------------------------------------------- | -------- | -------------------------------------------- |
| `src/renderer/src/lib/sqlTemplates.ts`                | **新增** | SQL 模板常量与生成函数                       |
| `src/renderer/src/components/schema/ServerNode.tsx`   | 修改     | 增加"添加"按钮（创建数据库）                 |
| `src/renderer/src/components/schema/DatabaseNode.tsx` | 修改     | 增加"添加"按钮（创建表），引入 openQueryTab  |
| `src/renderer/src/components/schema/TableNode.tsx`    | 修改     | 增加"添加"按钮（插入行），仅 table 类型      |
| `src/renderer/src/components/schema/ModuleGroup.tsx`  | 修改     | 为 views/procedures/functions 增加"添加"按钮 |
| `src/renderer/src/components/work/QueryPanel.tsx`     | 修改     | 执行成功后自动刷新对应数据列表               |

---

## 验证步骤

1. 连接 PostgreSQL 服务器，展开 ServerNode
2. 验证 ServerNode 有 Plus 按钮 → 点击后打开带 `CREATE DATABASE` 模板的查询标签页
3. 展开 DatabaseNode → 验证有 Plus 按钮 → 点击后打开带 `CREATE TABLE` 模板的查询标签页
4. 展开 Schema → Tables → 展开一个表 → 验证表节点有 Plus 按钮 → 点击后打开带 `INSERT INTO` 模板的查询标签页
5. 展开 Views 模块 → 验证有 Plus 按钮 → 点击后打开带 `CREATE VIEW` 模板的查询标签页
6. 展开 Procedures 模块 → 验证有 Plus 按钮 → 点击后打开带 `CREATE PROCEDURE` 模板的查询标签页
7. 展开 Functions 模块 → 验证有 Plus 按钮 → 点击后打开带 `CREATE FUNCTION` 模板的查询标签页
8. 修改模板 SQL 并执行 → 验证执行成功/失败反馈正常显示
9. 执行 CREATE TABLE 成功后 → 验证 Tables 列表自动刷新
10. 执行 CREATE VIEW 成功后 → 验证 Views 列表自动刷新
