# 契约：IPC 通道 `db:get-er-diagram-data`

**层级**：主进程 IPC 处理器 ↔ 预加载脚本 ↔ 渲染进程 Service

对应 [data-model.md](../data-model.md) 一、二节；决策依据见 [research.md](../research.md) R-005/R-007。

## 请求

| 参数           | 类型       | 必填 | 说明                                                                                                           |
| -------------- | ---------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| `connectionId` | `string`   | 是   | 目标连接 ID，用于 `DriverManager` 定位已连接的驱动实例                                                         |
| `database`     | `string`   | 是   | 目标数据库名                                                                                                   |
| `schemas`      | `string[]` | 是   | 需要覆盖的 schema 列表，由调用方先行调用 `getSchemas` 得到；不可为空数组（渲染层在数组为空时不应发起本次调用） |

## 响应

成功：`Promise<ErDiagramData>`（见 data-model.md 一节）。

失败：Promise reject，`error.message` 为可读中文错误信息，覆盖以下已知场景：

| 场景                       | 错误信息示例                           |
| -------------------------- | -------------------------------------- |
| 驱动未实现该能力（FR-020） | `当前数据库类型暂不支持 ER 分析`       |
| 连接不存在/已断开          | `连接不存在或已断开，请重新连接后再试` |
| SQL 执行失败（权限不足等） | 原样透出驱动层抛出的数据库错误信息     |

## 主进程侧实现契约

### `IDatabaseDriver`（`src/main/db/core/IDatabaseDriver.ts`）新增可选方法

```typescript
getErDiagramData?(database: string, schemas: string[]): Promise<ErDiagramData>
```

- 未实现该方法的驱动视为"不支持 ER 分析"。
- 实现时必须保证：整个数据库的表结构 + 外键关系通过**固定 2 次**数据库往返获取（1 次表+列元数据、1 次外键关系），不得对 `schemas` 或表名做循环发起独立查询。

### `DriverManager`（`src/main/db/core/DriverManager.ts`）新增方法

```typescript
async getErDiagramData(connectionId: string, database: string, schemas: string[]): Promise<ErDiagramData> {
  const driver = this.getDriver(connectionId) // 复用现有定位/校验逻辑
  if (!driver.getErDiagramData) {
    throw new Error('当前数据库类型暂不支持 ER 分析')
  }
  return driver.getErDiagramData(database, schemas)
}
```

### IPC 处理器（`src/main/ipc/db.ts`）新增

```typescript
createIPCHandler<[string, string, string[]], ErDiagramData>(
  'db:get-er-diagram-data',
  async (connectionId, database, schemas) =>
    driverManager.getErDiagramData(connectionId, database, schemas)
)
```

## 预加载脚本契约（`src/preload/index.ts`）

```typescript
getErDiagramData: createInvoke<[string, string, string[]], ErDiagramData>('db:get-er-diagram-data')
```

挂载于 `api.db.getErDiagramData`，与现有 `api.db.getColumns` 等同级。

## 渲染进程 Service 契约（`src/renderer/src/services/queryService.ts`）新增

```typescript
async function getErDiagramData(
  connectionId: string,
  database: string,
  schemas: string[]
): Promise<ErDiagramData> {
  return window.api.db.getErDiagramData(connectionId, database, schemas)
}
```

薄封装，不在 Service 层做重试/缓存（与 `queryService` 现有方法风格一致）。

## PostgreSQL 驱动 SQL 契约（`src/main/db/driver/pg/PostgreSQLDriver.ts`）

### 查询一：表 + 列（一次性覆盖多 schema）

```sql
SELECT
  c.table_schema  AS schema,
  c.table_name    AS name,
  c.column_name   AS "columnName",
  c.data_type     AS "dataType",
  (c.is_nullable = 'YES') AS nullable,
  c.column_default AS "defaultValue",
  c.ordinal_position AS "ordinalPosition",
  t.table_type    AS "tableType",
  obj_description(pgc.oid, 'pg_class') AS "tableComment",
  pgd.description AS "columnComment",
  EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = c.table_schema
      AND tc.table_name = c.table_name
      AND kcu.column_name = c.column_name
  ) AS "isPrimaryKey"
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
LEFT JOIN pg_catalog.pg_class pgc
  ON pgc.relname = c.table_name
  AND pgc.relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = c.table_schema)
LEFT JOIN pg_catalog.pg_description pgd
  ON pgd.objoid = pgc.oid AND pgd.objsubid = c.ordinal_position
WHERE c.table_schema = ANY($1)
ORDER BY c.table_schema, c.table_name, c.ordinal_position
```

驱动实现内按 `schema.name` 分组聚合为 `ErDiagramTable[]`，同组内按 `ordinalPosition` 顺序生成 `columns: ColumnInfo[]`。

### 查询二：外键关系（一次性覆盖多 schema）

```sql
SELECT
  tc.constraint_name AS "constraintName",
  tc.table_schema     AS "sourceSchema",
  tc.table_name       AS "sourceTable",
  kcu.column_name     AS "sourceColumn",
  kcu.ordinal_position AS "ordinalPosition",
  ccu.table_schema    AS "targetSchema",
  ccu.table_name      AS "targetTable",
  ccu.column_name     AS "targetColumn",
  rc.update_rule      AS "updateRule",
  rc.delete_rule      AS "deleteRule"
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name AND tc.constraint_schema = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
  AND rc.unique_constraint_schema = ccu.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = ANY($1)
ORDER BY tc.constraint_name, kcu.ordinal_position
```

驱动实现内按 `constraintName` 分组聚合 `sourceColumns`/`targetColumns`（多列外键场景），生成 `ForeignKeyInfo[]`。

两条查询均只接受一个参数 `$1 = schemas`（`string[]`，经 `pg` 驱动自动映射为数组类型），与现有 `getIndexes` 中已使用的 `ensureArray()` 风格一致处理返回的数组字段。
