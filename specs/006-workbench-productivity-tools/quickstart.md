# Quickstart: 工作台效率工具集（导出/DDL/格式化/复制/导入）

**Feature**: `006-workbench-productivity-tools` | **Date**: 2026-08-13

本仓库没有配置自动化测试框架（`package.json` 无 `test` 脚本），沿用 feature 005 建立的验证方式：`pnpm dev` 手动走查 + `pnpm typecheck`/`pnpm lint`/`pnpm format` 静态检查作为质量门槛。以下按 spec.md 的 5 个用户故事给出可独立执行的手动验证步骤，每一步引用对应的 Acceptance Scenario。

## 前置条件

```bash
pnpm install
pnpm dev
```

在应用中已建立至少一个可正常连接的 PostgreSQL 连接，且该连接下存在：

- 至少一张普通表（含主键、至少一个索引）。
- 至少一个视图。
- 一张用于导入测试的空表或可安全追加数据的表（列结构已知）。

## User Story 1 — 查看表 / 视图的 DDL（P1）

1. 在左侧导航树右键任意一张表 → 选择"查看 DDL"。
   - 对照 Acceptance Scenario 1.1：应展示包含列定义、约束、索引的完整建表语句，1 秒内出现（SC-001）。
2. 点击弹窗内的复制按钮，粘贴到文本编辑器验证内容完整（Acceptance Scenario 1.3）。
3. 对导航树中的一个视图重复第 1 步，验证展示的是 `CREATE OR REPLACE VIEW ... AS ...` 定义（Acceptance Scenario 1.2）。
4. 使用一个权限受限的连接（或临时撤销当前角色对该表的权限）重复第 1 步，验证展示明确错误提示而非空白/崩溃（Acceptance Scenario 1.4）。

## User Story 2 — 导出查询结果为 CSV / JSON（P2）

1. 在查询面板执行一条返回若干行、且至少一个字段包含逗号/换行/引号、至少一个字段为 NULL 的 SELECT 语句。
2. 在结果表格右键 → "导出为 CSV"，选择保存位置，用文本编辑器打开验证：表头行存在、特殊字符正确转义、NULL 表现为空字段（Acceptance Scenario 2.1, 2.3）。
3. 对同一结果重复选择"导出为 JSON"，验证生成的文件是对象数组，字段名与结果列名一致，NULL 字段为 JSON `null`（Acceptance Scenario 2.2, 2.3）。
4. 执行一条返回 0 行的查询，重复导出 CSV/JSON，验证生成只含表头/空数组的文件而不报错（Acceptance Scenario 2.4）。
5. 执行一条返回较多行（数千行级别）的查询并导出，观察导出过程中界面是否仍可交互、是否有进行中状态提示（Acceptance Scenario 2.5）。

## User Story 3 — 复制选中行为 INSERT / JSON / CSV（P3）

1. 打开一张表的数据浏览视图，勾选 1 行 → 右键"复制为 JSON" → 粘贴到文本编辑器，验证为该行的 JSON 对象（Acceptance Scenario 3.1）。
2. 勾选多行 → "复制为 CSV"，粘贴验证为不含表头、逗号分隔、行顺序与表格一致（Acceptance Scenario 3.2）。
3. 在数据浏览视图（来源表可确定）中勾选行 → "复制为 INSERT"，粘贴验证语句使用真实表名且可直接在该表所在数据库执行（Acceptance Scenario 3.3）。
4. 在查询面板执行一条多表 JOIN 查询，勾选结果行 → "复制为 INSERT"，验证生成语句使用占位符表名并有提示核对（Acceptance Scenario 3.4）。
5. 不勾选任何行，验证"复制为…"菜单项处于禁用或有"请先选择行"提示（Acceptance Scenario 3.5）。

## User Story 4 — SQL 编辑器一键格式化（P4）

1. 在 SQL 编辑器中粘贴一条无缩进、关键字大小写混乱的单行 SQL，触发格式化，验证输出统一缩进/换行/关键字风格（Acceptance Scenario 4.1）。
2. 粘贴多条以分号分隔的语句，触发格式化，验证每条语句独立格式化且语句间分隔保留（Acceptance Scenario 4.2）。
3. 将格式化前后的 SQL 分别在查询面板执行，对比结果集完全一致，验证语义未改变（对应 SC-004）。
4. 粘贴一段有意构造的语法错误 SQL，触发格式化，验证提示"无法格式化"且原文本不变（Acceptance Scenario 4.3）。
5. 格式化一次后执行标准撤销快捷键（Ctrl+Z），验证恢复为格式化前文本（Acceptance Scenario 4.4）。

## User Story 5 — 导入 CSV / JSON / SQL 文件到表（P5）

1. 准备一个列名与目标表完全匹配的小型 CSV 文件（5~10 行），触发导入向导 → 选择目标表 → 选择该 CSV 文件 → 确认导入，验证表中新增对应行数且字段值正确（Acceptance Scenario 5.1）。
2. 准备一个字段名匹配的 JSON 对象数组文件，重复导入流程，验证同样正确写入（Acceptance Scenario 5.2）。
3. 准备一个包含 3~5 条 INSERT/UPDATE 语句的 `.sql` 文件，重复导入流程，验证按顺序执行并报告结果（Acceptance Scenario 5.3）。
4. 准备一个字段名与目标表列名不完全一致的 CSV 文件，进入导入向导，验证出现列映射步骤，且未映射的必填列被提示（Acceptance Scenario 5.4）。
5. 准备一个包含至少一行会违反目标表唯一约束/非空约束的 CSV 文件，执行导入，验证：导入中止、之前已写入的行被回滚（用 SELECT 确认表数据量与导入前一致）、并报告具体失败行号和原因（Acceptance Scenario 5.5，对应 SC-005）。
6. 使用一个空文件或内容无法解析的文件（如损坏的 JSON）尝试导入，验证在写入任何数据前提示文件无效（Acceptance Scenario 5.6）。

## 静态检查门槛

每个用户故事验证完成后，运行：

```bash
pnpm typecheck
pnpm lint
pnpm format
```

三者全部通过后方可视为该用户故事"可交付"。
