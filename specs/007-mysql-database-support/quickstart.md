# 快速验证指南：MySQL 数据库连接支持

**输入**：[spec.md](./spec.md) 各用户故事的 Independent Test、[contracts/db-ipc-mysql.md](./contracts/db-ipc-mysql.md)
**目的**：提供可直接执行的手动验证步骤，逐条对照 spec.md 的用户故事验证功能是否达成预期，替代自动化测试（本项目当前无测试框架，见 plan.md Technical Context）。

## 前置条件

- 本地或可访问的 MySQL 5.7+ 或 8.0 实例，具备一个非 root 但有基本读权限的测试账号，以及至少一个包含若干表（含主键、索引、外键、触发器、存储过程/函数）的测试数据库
- 已安装 `mysqldump`（用于验证 User Story 6），或明确知道其不存在以验证"未检测到"分支
- 项目依赖已安装（`pnpm install`，包含新增的 `mysql2`）
- 通过 `pnpm run typecheck` 与 `pnpm run lint` 零错误（宪法"自测验证流程"前置门槛）
- 启动应用：`pnpm run dev`

## 验证步骤

### Step 0：类型与代码质量门槛

```bash
pnpm run typecheck
pnpm run lint
```

**预期**：均以退出码 0 结束，无任何错误或警告。

### Step 1（User Story 1 / P1）：新建并连接 MySQL 数据库

1. 打开"新建连接"对话框，数据库类型下拉中选择"MySQL"
   - **预期**：端口输入框自动填充为 `3306`
2. 填写真实可达的 MySQL 实例信息（主机、用户名、密码），点击"测试连接"
   - **预期**：几秒内显示连接成功，包含服务器版本号（如 `8.0.36`）与延迟毫秒数
3. 故意填写错误密码，再次点击"测试连接"
   - **预期**：显示明确的失败原因文本（如认证失败），不出现界面无响应或崩溃
4. 保存连接，在连接列表中双击该连接建立连接
   - **预期**：导航树展示该账号可访问的全部数据库（含 `information_schema`/`mysql` 等系统库，见 research.md §4）

对应 FR-001、FR-002、FR-003；SC-001（2 分钟内完成整套流程）。

### Step 2（User Story 2 / P1）：浏览结构并执行查询

1. 展开一个包含若干表的数据库，展开其下的 schema 节点（应与数据库同名）
   - **预期**：列出全部表与视图，二者图标/标记可区分
2. 点击某张表，查看列定义面板
   - **预期**：每列展示名称、数据类型、可空性、默认值、主键标记、注释，与直接执行 `DESCRIBE <table>` 或 `SHOW FULL COLUMNS FROM <table>` 得到的信息一致
3. 在 SQL 编辑器中执行 `SELECT * FROM <table> LIMIT 10;`
   - **预期**：展示结果集、字段信息、行数与执行耗时
4. 执行一条语法错误的语句（如 `SELET 1;`）
   - **预期**：展示 MySQL 返回的原始错误信息（如 `You have an error in your SQL syntax`），不崩溃

对应 FR-004、FR-005、FR-009；SC-002。

### Step 3（User Story 3 / P2）：索引、触发器、例程、DDL、用户权限

1. 查看一张有索引的表的"索引"面板，与 `SHOW INDEX FROM <table>` 的输出核对名称、唯一性、包含列
2. 查看一张有触发器的表的"触发器"面板，与 `SHOW CREATE TRIGGER <name>` 输出核对定义文本；确认启用状态显示为"已启用"
3. 查看数据库的"存储过程/函数"面板，与 `information_schema.ROUTINES` 核对名称、参数签名、返回类型（函数）
4. 右键某表选择"查看 DDL"，与 `SHOW CREATE TABLE <table>` 输出核对；对某视图执行同样操作，与 `SHOW CREATE VIEW <view>` 核对；均验证"一键复制"按钮可用
5. 查看服务器级"用户/权限"面板，与 `SELECT User, Host, Super_priv, account_locked, max_user_connections FROM mysql.user;` 核对每一行

对应 FR-006、FR-007、FR-008、FR-010、FR-017；SC-002。

### Step 4（User Story 4 / P3）：数据导入

1. 按行导入：准备若干行与目标表列数匹配的数据，执行导入
   - **预期**：全部写入成功，报告成功行数
2. 构造一行字段数不匹配或违反约束（如唯一键冲突）的数据，执行导入
   - **预期**：全部回滚（可通过 `SELECT COUNT(*)` 核对表未变化），系统报告出错的具体行号与原因
3. 按 SQL 语句导入：提供多条 `INSERT` 语句执行，验证成功计数；构造中途失败的语句集合，验证整体回滚且报告失败语句序号

对应 FR-011、FR-012。

### Step 5（User Story 5 / P3）：ER 图生成

1. 选择包含外键关系的若干表，触发"生成 ER 图"
   - **预期**：展示全部选中表的结构（列名、类型、主键标记），外键连线与实际 `SHOW CREATE TABLE` 中的 `FOREIGN KEY` 定义一致
2. 选择使用 MyISAM 引擎（或其他不支持外键的引擎）建的表，触发生成
   - **预期**：正常展示表结构，无连线，不报错

对应 FR-013。

### Step 6（User Story 6 / P4）：备份

1. 确保本机 `mysqldump` 可用，触发"备份数据库"，指定导出目录
   - **预期**：目录下生成 `dump-<database>-<timestamp>.sql` 文件，提示成功；用文本编辑器打开确认内容为有效 SQL
2. 临时将 `mysqldump` 从 PATH 移除（或在未安装的环境测试），触发备份且不手动指定路径
   - **预期**：提示"未找到 mysqldump"，并提供手动指定路径的输入框；手动指定正确路径后重试成功
3. 故意使用无导出权限的账号触发备份
   - **预期**：展示具体错误原因（非静默失败）

对应 FR-014。

### Step 7：跨类型界面区分与错误提示（SC-004、SC-005、FR-015、FR-016）

1. 同时保有一个 PostgreSQL 连接与一个 MySQL 连接于连接列表中
   - **预期**：3 秒内可通过图标/文字标识区分二者类型
2. 对一个已删除权限的数据库对象尝试查看（如撤销某表的 `SELECT` 权限后查看其列），
   - **预期**：展示明确错误提示，而非空白或崩溃

## 完成标准

以上 Step 0–7 全部按预期通过，即视为本功能实现完毕，可进入 `/speckit-tasks` → `/speckit-implement` 阶段。任何步骤失败应回溯到对应 FR 编号与 [data-model.md](./data-model.md) / [contracts/db-ipc-mysql.md](./contracts/db-ipc-mysql.md) 中的相关章节排查实现偏差。
