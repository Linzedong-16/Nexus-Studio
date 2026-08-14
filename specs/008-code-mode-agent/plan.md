# Implementation Plan: Code 模式 Agent 化改造

**Branch**: `008-code-mode-agent` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-code-mode-agent/spec.md`

## Summary

在现有 Code 模式（目前仅为对话 UI 骨架，`ConversationView.tsx` + `conversationStore`）背后，构建一套运行在主进程内的 ReAct Agent：将现有数据库能力（Schema 内省、DDL 查看、SQL 校验/格式化、查询执行）封装为一组输入/输出规范清晰的标准化工具；Agent 以 DeepSeek（通过 OpenAI 兼容协议接入）作为推理核心，按"解析指令→思考→选工具→调用→处理结果→生成回复"循环执行，当前阶段只支持单轮对话（一次指令得到一次完整回复），但状态结构和 IPC 契约为未来多轮对话预留扩展位；对会修改数据/结构的工具调用，循环在真正执行前暂停并等待用户显式确认后再继续。所有工具额外通过一个独立于对话界面的 IPC 入口暴露，并配套文档，供用户自行编写测试。

## Technical Context

**Language/Version**: TypeScript 5.9+（strict 模式，与现有代码库一致；主进程为 Node.js 运行时，渲染进程为浏览器运行时）

**Primary Dependencies**:

- `openai`（^4.x）— 复用官方 SDK 以 OpenAI 兼容协议接入 DeepSeek Chat Completions（含 tools/function-calling），符合宪法推荐技术栈"AI 集成：openai"
- `dotenv`（^16.x）— 在主进程启动时将 `.env` 加载进 `process.env`，实现"改配置文件即可切换密钥，无需重新构建"的可配置性要求（FR-008）
- `zod`（^3.x）— 为每个工具定义输入参数的运行时校验 schema，产出结构化、指出具体字段的校验错误（FR-013）
- `zod-to-json-schema`（^3.x）— 从同一份 zod schema 派生出提供给 DeepSeek function-calling 的 JSON Schema，避免"校验规则"与"提供给模型的工具说明"出现两份不同源、容易漂移的定义
- 复用既有依赖：`pg` / `mysql2`（经由现有 `driverManager`）、`sql-formatter`、`node-sql-parser`（主进程内新增等价的纯函数调用，逻辑与渲染进程 `lib/sqlFormat.ts`、`lib/sqlStatements.ts` 一致，但物理上分属不同进程，不可跨进程直接 import 渲染进程代码）

**Storage**: 本阶段无持久化需求。Agent 运行状态（`AgentRun`，见 data-model.md）保存在主进程内存中，仅存活于一次对话往返（含等待确认的中间态），应用重启或渲染进程刷新后即丢失；对话消息历史的持久化留给后续多轮对话阶段（预留数据结构，见 data-model.md 的 `AgentMessage`）。

**Testing**: 需求方明确"测试部分由用户自行实现"。本计划不引入测试框架，但通过 `agent:run-tool` IPC 通道提供绕开完整对话流程、单独调用任意工具的入口，并在 `specs/008-code-mode-agent/contracts/` 下提供完整的工具输入/输出契约文档，作为用户编写测试的依据（FR-012）。

**Target Platform**: Windows / macOS / Linux 桌面（Electron 39+，与现有应用一致）

**Project Type**: 桌面应用（Electron 三进程架构），本功能新增 `main` 进程模块 + `preload` 桥接 + `renderer` 服务/状态层，不引入新的顶层项目

**Performance Goals**: 无法给出与外部 DeepSeek API 延迟无关的硬性响应时间指标；以"循环步数上限"（默认 8 轮 思考-行动，可通过配置调整）作为可控的终止边界，避免无限等待；工具调用本身（数据库内省/执行/格式化/校验）应遵循现有查询执行的性能特征，不额外引入明显延迟。

**Constraints**:

- 宪法 I：DeepSeek 调用与全部工具执行只能发生在主进程；渲染进程只通过 `contextBridge` 暴露的受限 API 触发，不直接访问网络或数据库
- FR-008：DeepSeek API 密钥只能来自本地 `.env`，禁止硬编码或提交到版本库 → 需要在 `.gitignore` 中补充忽略 `.env`（当前仓库尚未忽略，将作为本功能的必要配套变更之一，在任务阶段落实）
- FR-005/FR-014：单轮对话与"修改类工具需显式确认"两者需协调——确认动作不是"新的自由指令"，而是对已提交指令中某一步骤的批准/拒绝，因此设计为同一次 `AgentRun` 内的"暂停-恢复"，而不是开启新一轮对话
- FR-004：Agent 循环必须有限定的终止条件（最终答案 / 达到最大工具调用次数 / 判定无法继续）

**Scale/Scope**: 单用户本地桌面场景；本阶段封装 11 个标准化工具（Schema 内省 6 个、SQL 校验/格式化/执行/说明计划 5 个，见 data-model.md 与 contracts/tool-catalog.md），覆盖 FR-001 确认范围内的全部操作类别。

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                        | 检查结果                         | 说明                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. 进程隔离与安全           | PASS                             | DeepSeek 客户端与全部工具执行代码位于 `src/main/ai/`，仅通过新增 `agent:*` IPC 通道（invoke/handle）暴露给渲染进程；密钥经 `.env` → `process.env` 加载，不写入 `electron-store`/不出现在渲染进程可达的任何对象中                 |
| II. TypeScript 全栈类型安全 | PASS                             | 工具输入/输出、IPC 请求/响应、`AgentRun`/`AgentMessage` 等状态均定义明确接口；`zod` schema 与其推导的 TS 类型（`z.infer`）保证运行时校验与静态类型一致，不使用 `any`                                                             |
| III. 组件化与关注点分离     | PASS                             | 渲染进程新增 `agentService`（服务层，唯一调用 `window.api.agent.*` 的位置）与 `agentStore`（Zustand，管理消息列表/当前运行状态），`ConversationView.tsx` 只消费 store，不直接触达 IPC                                            |
| IV. 数据库适配器模式        | PASS                             | 工具内部通过既有 `driverManager` 访问数据库，不新增、不绕过 `IDatabaseDriver` 适配器，新增数据库类型无需改动 Agent 工具层                                                                                                        |
| V. IPC 通信契约             | PASS                             | 新增通道遵循 `模块:操作` 命名（`agent:chat`、`agent:confirm-tool-call`、`agent:list-tools`、`agent:run-tool`），均为需要返回值的操作 → 统一使用 `invoke/handle`；主进程异常通过 throw 传递，渲染进程在 `agentService` 层统一捕获 |
| VI. 分阶段交付与向后兼容    | PASS                             | 与既定 Phase 4（AI 集成）路线一致；`.env`/Provider 抽象在密钥未配置时降级为明确的"未配置"提示，不影响 Phase 1-3 已交付功能                                                                                                       |
| VII. 中文文档与注释规范     | PASS                             | 计划产出物、后续实现的 JSDoc、思考过程均使用简体中文；对外暴露的工具函数需附带含 `@param`/`@returns`/`@throws`/`@example` 的中文 JSDoc                                                                                           |
| VIII. 依赖最小化            | 需说明（见 Complexity Tracking） | 新增 4 个依赖（`openai`/`dotenv`/`zod`/`zod-to-json-schema`），其中 `openai` 已在宪法推荐技术栈中列出；其余三项在 Complexity Tracking 中给出理由                                                                                 |

**结论**：无阻断性违规，`VIII` 项的新增依赖已在下方登记理由，进入 Phase 0。

## Project Structure

### Documentation (this feature)

```text
specs/008-code-mode-agent/
├── plan.md              # 本文件
├── research.md          # Phase 0 输出
├── data-model.md        # Phase 1 输出
├── quickstart.md        # Phase 1 输出
├── contracts/           # Phase 1 输出
│   ├── ipc-contract.md      # agent:* IPC 通道契约
│   └── tool-catalog.md      # 11 个标准化工具的输入/输出规范
└── tasks.md             # Phase 2 输出（由 /speckit-tasks 生成，非本命令）
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── ai/                          # 新增：Agent 相关能力，全部运行于主进程
│   │   ├── config.ts                # 加载 .env → DeepSeekConfig（含"未配置"判定）
│   │   ├── provider/
│   │   │   ├── IModelProvider.ts    # 模型提供方抽象接口（预留切换其他模型）
│   │   │   └── DeepSeekProvider.ts  # 基于 openai SDK + DeepSeek baseURL 的实现
│   │   ├── tools/
│   │   │   ├── types.ts             # ToolDefinition<TInput,TOutput> 类型 + zod→JSON Schema 派生
│   │   │   ├── registry.ts          # 工具注册表：list()/get(name)/invoke(name,args)
│   │   │   ├── schemaTools.ts       # schema.listDatabases/listSchemas/listTables/listColumns/listIndexes/getDdl
│   │   │   └── sqlTools.ts         # sql.validate/format/explain/executeReadOnly/executeWrite
│   │   ├── loop/
│   │   │   ├── AgentRun.ts          # AgentRun 状态机（running/paused_for_confirmation/completed/failed）
│   │   │   └── reactLoop.ts         # ReAct 循环：解析→思考→选工具→调用→处理结果→生成响应
│   │   └── index.ts
│   └── ipc/
│       └── agent.ts                  # 新增：注册 agent:chat / agent:confirm-tool-call / agent:list-tools / agent:run-tool
├── preload/
│   └── index.ts                      # 新增 agent 命名空间的桥接方法（复用现有 utils.ts 模式）
└── renderer/src/
    ├── services/
    │   └── agentService.ts           # 新增：唯一调用 window.api.agent.* 的服务层
    ├── store/
    │   └── conversationStore.ts      # 扩展：新增消息列表、当前 AgentRun 状态、发送/确认/中止方法
    ├── types/
    │   └── agent.ts                  # 新增：AgentMessage/ToolCallRecord/AgentRunStatus 等前端可见类型
    └── components/code/
        └── ConversationView.tsx      # 改造：接入 agentStore，渲染消息、工具调用轨迹与确认弹窗

.env.example                          # 新增：DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL 占位
.gitignore                            # 补充忽略 .env（现状缺失，属于本功能必要配套变更）
docs/agent-tools.md                   # 新增：面向"用户自行编写测试"的工具调用文档入口（链接至 contracts/tool-catalog.md 内容整理版）
```

**Structure Decision**: 沿用现有 Electron 三进程目录结构（`src/main` / `src/preload` / `src/renderer`），Agent 相关代码集中在 `src/main/ai/` 新目录下，不新建顶层项目；渲染进程侧改造限定在 `code/` 相关组件与既有 `services/`、`store/` 目录内，符合宪法 III 的关注点分离要求。

## Complexity Tracking

> 依据宪法 VIII/Governance #6："任何超出推荐技术栈的方案或引入新依赖，必须提供充分的理由说明"

| 新增依赖             | 为什么需要                                                                                                                                                                     | 更简单的替代方案为何不采用                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dotenv`             | 需要在主进程运行时（而非构建期）加载 `.env`，使用户"改密钥不用重新构建"（FR-008 可配置性要求）；零依赖、纯 JS，体积极小                                                        | 依赖 electron-vite/Vite 的构建期 `import.meta.env` 会将密钥内联进产物，且修改后必须重新构建才能生效，不满足"配置即可用"的要求；手写 `.env` 解析器属于重复实现一个已被广泛验证的极简方案，收益不明显 |
| `zod`                | 需要为 11 个工具的输入参数提供运行时校验，并在参数缺失/类型错误时返回"指出具体字段"的错误（FR-013）；同时其类型可通过 `z.infer` 直接复用为 TS 类型，符合宪法 II 的类型安全要求 | 手写校验函数难以保证 11 个工具的错误信息格式一致，且无法自动派生 TS 类型，长期维护成本更高                                                                                                          |
| `zod-to-json-schema` | 需要把同一份 zod schema 转换为 DeepSeek function-calling 所需的 JSON Schema，避免"校验用的 schema"与"讲给模型的工具说明"出现两份手写定义而逐渐漂移                             | 手写并维护两套等价的 schema（zod 用于校验、JSON Schema 字面量用于告知模型）容易在迭代中失去同步，属于可预见的重复劳动                                                                               |

（`openai` 已在宪法"推荐技术栈"表中列出，用于对接 DeepSeek 的 OpenAI 兼容协议，无需额外理由。）

## Post-Design Constitution Check

_完成 Phase 0（research.md）与 Phase 1（data-model.md / contracts / quickstart.md）设计后的复查。_

- **I. 进程隔离与安全**：`data-model.md` 中 `ModelProviderConfig` 明确标注"仅存在于主进程，任何字段不通过 IPC 传递给渲染进程"；`contracts/ipc-contract.md` 的四个通道均不返回密钥或原始网络凭据。PASS。
- **II. TypeScript 全栈类型安全**：`data-model.md` 每个实体均给出完整字段类型；`AgentToolDefinition.inputSchema` 与派生 JSON Schema 同源（research.md §4），无 `any`。PASS。
- **IV. 数据库适配器模式**：`tool-catalog.md` 中全部 11 个工具的"底层依赖"均指向既有 `driverManager.*` 方法，未新增绕过适配器的数据库访问路径。PASS。
- **V. IPC 通信契约**：`contracts/ipc-contract.md` 的 4 个通道命名、invoke/handle 用法、错误传递方式与既有 `db:*`/`utils.ts` 模式一致。PASS。
- **VI. 分阶段交付**：`quickstart.md` 第 3 步验证了密钥未配置时的降级路径，确认不影响已交付功能。PASS。
- **VIII. 依赖最小化**：Phase 1 设计未引入 Complexity Tracking 之外的新依赖。PASS（结论不变）。

**结论**：设计阶段未引入新的宪法违规，Post-Design 复查通过，可进入 `/speckit-tasks`。
