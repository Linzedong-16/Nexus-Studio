# Implementation Plan: 内存占用优化：查询结果与对话历史管控

**Branch**: `010-memory-optimization` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-memory-optimization/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

本功能治理应用内存占用的四个来源（对应 spec.md 的 User Story 1~4）：

1. **查询结果无行数上限**：驱动层为 `runQuery` 返回结果新增硬性行数上限（默认 5 万行），超限时截断并标记 `truncated`；渲染层据此提示用户，并新增一条独立于预览结果的全量导出 IPC 通道，保证导出不受截断影响。
2. **非激活标签页结果长期驻留**：`workspaceStore` 为每个标签页新增"最后激活时间"追踪，并在后台以定时扫描的方式，将连续非激活超过默认时长（10 分钟）的标签页结果释放（仅保留恢复查询所需的 SQL/筛选条件），激活态标签页永不释放。
3. **连接池不随标签页关闭释放**：驱动层新增按数据库维度释放连接池的方法，`DriverManager`/IPC 层新增转发通道；关闭标签页时检测该数据库是否仍被其他标签页引用，无引用则释放对应连接池，重新访问时自动按需重建。
4. **单对话历史无上限提示**：不改变历史存储本身（用户明确要求保留完整历史、仅提示而非截断），在对话面板读取当前对话的轮次数，达到默认阈值（40 轮）后在对话底部展示不可自动消失的引导提示，提供"新建对话"入口。

技术方案遵循"改动集中、不引入新依赖"的原则：沿用现有 `pg`/`mysql2` 一次性查询 API（先物化再裁剪，而非引入流式查询库），复用 Zustand store 现有的按 ID 索引结构（不使用 WeakMap，理由见 research.md），复用现有 `services/` 封装模式新增 IPC 调用。

## Technical Context

**Language/Version**: TypeScript 5.9（strict 模式），Node.js（Electron 39 内置运行时）

**Primary Dependencies**: Electron 39.2.6、React 19.2.1、Zustand 5.0.14、pg 8.23.0、mysql2 3.15.3、electron-store 8.2.0、Tailwind CSS 4、shadcn/ui（Radix）

**Storage**: 数据库结果与对话历史均为内存态运行数据，不持久化到磁盘（`electron-store` 仅持久化工作区布局与连接配置，`sanitizeForPersist` 已排除 `result` 字段）；本功能不新增持久化存储

**Testing**: 项目当前未引入自动化测试框架（遵循 CLAUDE.md 测试策略），验证方式为 quickstart.md 中的手动验证步骤

**Target Platform**: 桌面应用（Windows / macOS / Linux），Electron 三层架构（主进程 / 预加载 / 渲染进程）

**Project Type**: desktop-app（Electron 单体应用，主进程与渲染进程分层）

**Performance Goals**:

- 执行返回十万行以上的查询时，响应耗时与内存峰值应与执行恰好 5 万行的查询处于同一量级（对应 SC-001）
- 标签页结果释放/重新查询的用户可感知操作在一次点击内完成（对应 SC-004）

**Constraints**:

- 不得引入新的运行时依赖（如流式查询库、定时任务库），行数上限与非激活释放均基于现有 `pg`/`mysql2` API 与 `setInterval`/时间戳比较实现
- 数据库密码等敏感信息处理方式不变；本功能不涉及新增敏感数据
- 所有新增 IPC 通道必须遵循 `模块:操作` kebab-case 命名（宪法 V）
- 不得为查询结果上限、标签页释放时长、对话轮次阈值提供用户配置入口（spec.md Assumptions 明确固定为系统内置默认值）

**Scale/Scope**:

- 涉及主进程：2 个数据库驱动类（`PostgreSQLDriver`、`MySQLDriver`）、`IDatabaseDriver` 接口、`DriverManager`、`src/main/ipc/db.ts`
- 涉及渲染进程：`workspaceStore.ts`、`conversationStore.ts`（只读，不改动）、`ResultTable.tsx`、`ConversationPanel.tsx`（或对话消息展示组件）、`services/queryService.ts`（新增方法）
- 不涉及新页面、新路由，均为既有模块内的行为增强

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                        | 评估                                                                                                                                                                                                     | 结论                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| I. 进程隔离与安全边界       | 行数截断、连接池释放均在主进程驱动层完成；渲染进程仅通过既有 `contextBridge` 暴露的 `window.api.db.*` 调用，不新增任何渲染进程直接访问 Node.js API 的路径                                                | ✅ 通过                                 |
| II. TypeScript 类型安全优先 | 新增字段（`QueryResult.truncated`、`WorkspaceTab.lastActiveAt`/`resultReleased`）与新增方法签名均需显式类型，不使用 `any`；`IDatabaseDriver` 新增的 `releaseDatabase` 为可选接口方法，两个驱动类均需实现 | ✅ 通过（设计阶段需保证落地时无 `any`） |
| III. 组件化与关注点分离     | 渲染进程组件（`ResultTable.tsx`、对话面板）不得直接调用 `window.api`，新增调用统一经 `services/queryService.ts` 封装                                                                                     | ✅ 通过                                 |
| IV. 数据库适配器模式一致性  | `releaseDatabase` 作为 `IDatabaseDriver` 接口的新增可选方法，PostgreSQL/MySQL 两个驱动均需对称实现，保持适配器模式不被破坏                                                                               | ✅ 通过                                 |
| V. IPC 通信契约明确性       | 新增通道：`db:release-database`、`db:export-query-result`，均为 `模块:操作` kebab-case；`db:query` 返回值扩展 `truncated` 字段，不改变现有参数签名（向后兼容）                                           | ✅ 通过                                 |
| VI. 安全存储敏感信息        | 本功能不涉及新增敏感信息存储                                                                                                                                                                             | ✅ 不适用                               |
| VII. SQL 参数化查询         | 新增的全量导出通道复用现有参数化查询路径（`driver.query(database, sql, params)`），不新增字符串拼接 SQL                                                                                                  | ✅ 通过                                 |
| VIII. 依赖最小化            | 不引入流式查询库（如 `pg-query-stream`）、不引入新的调度/缓存库；行数上限用数组 `slice`，非激活释放用现有 `setInterval`，对话提示为纯 UI 判断                                                            | ✅ 通过                                 |

**结论**：无违规项，Complexity Tracking 章节保持空白（无需记录）。

## Project Structure

### Documentation (this feature)

```text
specs/010-memory-optimization/
├── plan.md              # 本文件（/speckit-plan 输出）
├── research.md          # Phase 0 输出
├── data-model.md        # Phase 1 输出
├── quickstart.md        # Phase 1 输出
├── contracts/           # Phase 1 输出：新增/修改的 IPC 契约
│   └── db-ipc.md
└── checklists/
    └── requirements.md  # /speckit-specify 阶段已生成
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── db/
│   │   ├── core/
│   │   │   ├── IDatabaseDriver.ts     # 新增 releaseDatabase?() 接口方法
│   │   │   ├── DriverManager.ts       # 新增 releaseDatabase() 转发方法
│   │   │   └── resultLimits.ts        # 【新增文件】MAX_RESULT_ROWS 常量 + truncateRows() 共享工具
│   │   └── driver/
│   │       ├── pg/PostgreSQLDriver.ts     # runQuery 接入截断；新增 releaseDatabase 实现
│   │       └── mysql/MySQLDriver.ts       # runQuery 接入截断；新增 releaseDatabase 实现
│   ├── ipc/
│   │   └── db.ts                      # 新增 db:release-database、db:export-query-result 通道
│   └── utils/
│       └── resultExport.ts            # 【新增文件】主进程侧 CSV/JSON 序列化（供导出通道使用，不依赖渲染进程代码）
│
└── renderer/src/
    ├── store/
    │   └── workspaceStore.ts          # WorkspaceTab 新增 lastActiveAt/resultReleased；新增非激活扫描定时器；closeTab 系列新增按数据库引用计数释放逻辑
    ├── services/
    │   └── queryService.ts            # 新增 releaseDatabase()、exportQueryResult() 方法
    ├── components/
    │   ├── work/
    │   │   └── ResultTable.tsx        # 截断提示条；handleExport 按 truncated 分流至新导出通道
    │   └── ai/
    │       └── ConversationPanel.tsx（或对应对话消息区组件）  # 新增轮次阈值提示条
    └── types/
        ├── ipc.ts                     # QueryResult 新增 truncated: boolean
        └── workspace.ts                # WorkspaceTab 新增 lastActiveAt?: number、resultReleased?: boolean
```

**Structure Decision**：沿用项目既有的主进程 / 预加载 / 渲染进程三层目录结构，不新增顶层目录。仅新增两个工具文件（`src/main/db/core/resultLimits.ts` 用于 PostgreSQL/MySQL 驱动共享行数截断逻辑，避免重复实现；`src/main/utils/resultExport.ts` 用于主进程侧序列化导出结果，避免主进程反向依赖渲染进程的 `lib/exportFormat.ts`），其余均为既有文件内的增量修改。

## Complexity Tracking

> Constitution Check 无违规项，本节留空。
