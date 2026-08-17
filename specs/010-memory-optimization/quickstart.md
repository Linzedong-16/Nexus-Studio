# Quickstart: 内存占用优化功能验证

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/db-ipc.md](./contracts/db-ipc.md)

本项目未引入自动化测试框架（见 CLAUDE.md 测试策略），以下为实现完成后的手动验证步骤，对应 spec.md 的四个 User Story 与 SC-001~SC-007。验证前需先完成质量门禁：

```bash
pnpm run typecheck
pnpm run lint
pnpm run format
```

## 前置准备

1. `pnpm dev` 启动应用。
2. 准备一个测试用的 PostgreSQL 或 MySQL 连接，且其中至少一张表拥有超过 10 万行数据（可用如下 SQL 快速生成测试表）：

   ```sql
   -- PostgreSQL 示例
   CREATE TABLE memory_test AS
   SELECT generate_series(1, 120000) AS id, md5(random()::text) AS payload;
   ```

## 场景 1：查询结果行数上限（对应 User Story 1 / SC-001 / SC-002）

1. 打开一个查询标签页，执行 `SELECT * FROM memory_test;`（不加 `LIMIT`）。
2. **预期**：结果区域正常展示，不出现明显卡顿；结果顶部/底部出现"结果已截断至 5 万行，共 120000 行，可通过导出获取完整数据"一类提示。
3. 执行 `SELECT COUNT(*) FROM memory_test;`。
4. **预期**：返回单行结果，不出现任何截断提示（对应 Edge Cases 第一条，聚合查询不受截断影响）。
5. 在截断提示中点击导出（CSV 或 JSON），选择保存路径。
6. **预期**：导出文件包含完整 120000 行数据，行数与 `SELECT COUNT(*)` 结果一致（对应 FR-003/SC-002）。
7. 将查询改为 `SELECT * FROM memory_test LIMIT 100;` 重新执行。
8. **预期**：结果正常完整展示，无截断提示（对应 Acceptance Scenario 2）。

## 场景 2：标签页非激活释放（对应 User Story 2 / SC-003 / SC-004）

1. 依次打开 5 个查询标签页，各自执行一次返回较多数据的查询（如场景 1 的全表查询）。
2. 切换到第 5 个标签页，保持停留（可通过临时将 `INACTIVE_RELEASE_MS` 调小到测试可接受的时长，或耐心等待默认 10 分钟）。
3. **预期**：等待超过非激活阈值后，切回第 1~4 个标签页，均出现"结果已释放，点击重新执行"提示；第 5 个（当前激活）标签页结果始终可用，不受影响（对应 Acceptance Scenario 3 / FR-005）。
4. 点击提示中的"重新执行"按钮。
5. **预期**：一次点击内重新获得该标签页的查询结果（对应 SC-004），无需重新输入 SQL。

## 场景 3：连接池按数据库释放（对应 User Story 3 / SC-005）

1. 在同一连接下打开两个不同数据库（`db_a`、`db_b`）各自的标签页并执行查询。
2. 关闭 `db_a` 下的全部标签页，保留 `db_b` 的标签页。
3. **预期**：`db_b` 的标签页仍可正常查询，不受影响（对应 Acceptance Scenario 2 / FR-008）；可通过应用日志面板（`DbLogEntry`）或调试工具观察到 `db_a` 对应连接池已被释放的痕迹。
4. 重新打开 `db_a` 的一个标签页并执行查询。
5. **预期**：查询正常返回，无需用户手动重新配置连接（对应 FR-009 / Acceptance Scenario 3）。

## 场景 4：对话轮次提示（对应 User Story 4 / SC-006 / SC-007）

1. 切换到 Code 模式，新建一个对话，与 AI 助手连续完成 39 轮交互。
2. **预期**：对话界面底部不出现任何轮次提示（对应 FR-014）。
3. 完成第 40 轮交互。
4. **预期**：对话界面最底部出现"当前对话已进行较多轮次，建议新建对话"提示，且不遮挡输入框（对应 FR-010/SC-006）。
5. 忽略提示，继续发送第 41 轮指令。
6. **预期**：指令正常处理，无任何功能限制或响应变慢（对应 FR-011/SC-007），提示保持展示。
7. 点击提示中的"新建对话"。
8. **预期**：创建并切换到新的空白对话，原对话历史在对话列表中完整可查；新对话轮次计数从零开始，未再出现提示（对应 FR-012/FR-013）。

## 回归检查

- 确认既有的"schema 浏览"、"ER 图分析"、"DDL 查看"等复用 `db:query`/`driverManager.query` 的功能未受 `truncated` 字段新增影响（这些场景通常查询行数很少，不会触发截断，但需确认其 UI 未对 `QueryResult` 做穷尽性字段检查而报错）。
- 确认应用整体关闭时，仍能通过既有 `disconnect()`/`disconnectAll()` 一次性清理所有连接池，不受本次"按数据库释放"改动影响（对应 Edge Cases 第四条）。
