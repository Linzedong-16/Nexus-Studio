# Research: Code 模式 Agent 化改造

本文件汇总实现前需要确定的技术决策，解决 Technical Context 中不能直接给出默认值的问题。规格本身没有残留 `[NEEDS CLARIFICATION]`（已在 `/speckit-specify` 阶段与用户确认），这里的"研究任务"是把已确认的产品决策落到具体的技术方案上。

## 1. DeepSeek 接入方式

- **Decision**: 使用官方 `openai` SDK，将 `baseURL` 指向 DeepSeek 的 OpenAI 兼容端点（`https://api.deepseek.com`），`apiKey` 取自 `.env` 中的 `DEEPSEEK_API_KEY`；对话请求使用 Chat Completions 接口并携带 `tools`（function-calling）参数把工具目录传给模型。
- **Rationale**: DeepSeek 官方文档明确其 API 与 OpenAI Chat Completions 协议兼容，`openai` SDK 已在项目宪法的"推荐技术栈"中列出，复用它可以零改动地对接任何未来同样兼容该协议的模型（如切换到其他兼容供应商），且避免额外引入一个专属 SDK。
- **Alternatives considered**:
  - 直接用 `fetch` 手写 HTTP 调用：省掉一个依赖，但需要自行实现流式解析、函数调用参数拼装、错误重试等 SDK 已处理好的细节，维护成本更高。
  - `@anthropic-ai/sdk`：协议与 DeepSeek 不兼容，且宪法把它列为备选而非首选，本阶段不涉及 Anthropic 模型，故不采用。

## 2. 模型提供方的可替换抽象

- **Decision**: 定义 `IModelProvider` 接口（`chat(messages, tools): Promise<ModelResponse>`），`DeepSeekProvider` 是其唯一实现；Agent 循环只依赖接口，不直接引用 `openai` 或 DeepSeek 特有字段。
- **Rationale**: 呼应 FR-007"模型调用方式 MUST 通过可替换的抽象方式接入"，且与既有架构文档（`doc/01-技术架构方案.md` 4.5 节）中已经规划好的策略模式（`IAIProvider` → `OpenAIProvider`/`AnthropicProvider`/`OllamaProvider`）保持命名与结构一致，减少未来对齐成本。
- **Alternatives considered**: 直接在 Agent 循环里调用 `openai` 客户端——实现更快，但会让"更换模型"演变成一次侵入式重构，违背预留接口的既定原则。

## 3. 环境配置加载（`.env`）

- **Decision**: 主进程启动时（`app.whenReady()` 之前）用 `dotenv` 读取项目根目录（开发态）/ 可执行文件同级目录（打包态，通过 `app.isPackaged` 判定路径）下的 `.env` 文件并写入 `process.env`；提供 `.env.example` 作为占位模板；`.gitignore` 补充忽略 `.env`。
- **Rationale**: 满足"确保模型调用功能的可配置性"——运维/开发者只需编辑文本文件、重启应用即可切换密钥，不需要重新构建产物；这与 Vite 构建期注入 `import.meta.env` 的方式（改值必须重新 build）有本质区别，后者不满足该需求。
- **Alternatives considered**: 复用 `electron-store`（项目已用于其他配置持久化）——但 `electron-store` 面向"应用内产生的配置"，密钥属于"部署环境提供的秘密"，混用会让密钥暴露在渲染进程可达的持久化层附近，增大误用风险，故仍以独立的 `.env` 承载。

## 4. 工具的输入校验与模型工具说明的生成

- **Decision**: 每个工具用一份 `zod` schema 描述输入参数；工具注册表用 `zod-to-json-schema` 把该 schema 转成 DeepSeek function-calling 所需的 JSON Schema；调用工具前先用同一份 zod schema 做 `safeParse`，失败时返回逐字段的错误列表。
- **Rationale**: 保证"校验规则"和"模型看到的工具说明"永远同源，避免文档、校验、类型三者不一致；`z.infer<typeof schema>` 同时给出 TS 类型，满足宪法 II 的零 `any` 要求。
- **Alternatives considered**: 手写 JSON Schema 常量 + 手写校验函数——短期实现量相近，但两份定义会随着工具迭代逐渐漂移，且无法自动获得 TS 类型。

## 5. 工具目录范围与"生成/分析/优化/修复"的技术落地方式

- **Decision**: 按 FR-001 确认范围，只封装与数据库/SQL 直接相关、**具备确定性输出**的操作作为工具（Schema 内省 6 个 + SQL 校验/格式化/执行计划/执行 5 个，见 data-model.md）；"SQL 生成""分析建议""优化建议""错误修复建议"这四类结果，由 Agent 的推理层（DeepSeek 本身）产出，但其依据必须来自对上述工具真实调用结果（表结构、DDL、执行计划、执行报错），而不是模型的自由发挥。
- **Rationale**: 若把"生成 SQL"本身包装成一个"工具"，该工具内部仍然要调用模型才能产出结果——这只是把推理步骤套了一层没有必要的壳，既不符合 ReAct 模式"工具承担确定性动作、模型承担推理"的分工，也会让 Agent 循环的"选择工具"步骤失真（选中的其实还是"再问一次模型"）。让这四类结果作为推理层输出、但强制其基于工具调用的真实数据，既满足 FR-001 中"以工具为依据完成生成/分析/优化/修复"的产品目标，也保持了 ReAct 循环结构的合理性。
- **Alternatives considered**: 把四类需求各封装成一个"元工具"（内部再调用一次模型）——会导致工具调用记录里出现"调用了生成SQL工具"这种对用户没有额外信息量的记录，且违反 FR-002"工具输出格式规范"应是确定性数据结构的隐含预期；已放弃。

## 6. ReAct 循环终止条件

- **Decision**: 循环设置 `maxIterations`（默认 8，可通过 `.env` 中 `AGENT_MAX_ITERATIONS` 覆盖）。每完成一次"思考→选工具→调用→处理结果"记为一轮；当模型在某一轮的回复中不再请求新的工具调用（即返回最终自然语言答案）时提前结束；达到轮次上限仍未得到最终答案时，循环终止并向用户说明"未能在限定步数内完成，已产出的中间结论如下"，附带已收集到的工具调用结果摘要。
- **Rationale**: 直接满足 FR-004"明确的终止条件"；轮次上限比"墙钟超时"更适合作为主控制信号，因为 DeepSeek API 的网络延迟不受本功能控制，用轮次而非时间做主要判据可以在网络较慢但确有进展时仍然给出结果。网络/API 层面的超时仍作为单次模型调用的兜底（见第 7 点）。
- **Alternatives considered**: 纯时间超时（如"总耗时不超过 30 秒”）——在 DeepSeek 响应较慢但确实在正常推进的情况下会误杀正常任务，用户体验更差。

## 7. 单次模型调用 / 工具调用的异常与超时处理

- **Decision**: 对每次 DeepSeek Chat Completions 调用设置固定超时（默认 60 秒，可配置），超时或返回鉴权失败（401/403）、限流（429）等错误时，循环立即终止并向用户返回可读的状态说明（区分"未配置密钥""密钥无效""服务限流/超时""服务不可用"四类），不暴露原始堆栈；工具调用内部异常（如数据库连接已断开）被视为"这一步失败"，把错误信息作为该步骤的工具结果反馈回模型（FR-011），由模型决定是否更换策略或直接告知用户。
- **Rationale**: 直接对应 FR-009（密钥/调用失败的清晰提示）与 FR-011（工具失败反馈进循环）；四类错误覆盖 User Story 3 的验收场景与 Edge Cases 中列出的"服务超时/限流"情形。
- **Alternatives considered**: 让工具调用失败直接中止整个任务——违反 FR-011 明确要求"反馈给 Agent 循环使其能调整决策"，故不采用。

## 8. 单轮对话与"修改类工具需确认"的协调（暂停-恢复模型）

- **Decision**: 每次用户发起指令对应一个 `AgentRun`（见 data-model.md），其状态机为 `running → (paused_for_confirmation ⇄ running)* → completed | failed`。当循环选中一个"修改类"工具时，不立即执行，而是把 `AgentRun` 置为 `paused_for_confirmation` 并把"待确认的工具调用（工具名、参数、面向用户的自然语言描述）"返回给渲染进程；渲染进程展示确认 UI；用户确认/拒绝后，渲染进程调用 `agent:confirm-tool-call(runId, approved)` 恢复该 `AgentRun`，循环从暂停点继续。整个过程仍属于"同一次对话交换"，不视为开启新一轮对话，也不需要用户重新输入指令。
- **Rationale**: 解决 FR-005（单轮：一次指令得到一次完整结果，期间不接受新指令）与 FR-014（修改类工具执行前必须显式确认）之间表面的张力——"确认/拒绝"是对已提交指令中某个步骤的批准，不是一条新的自由文本指令，因此可以在不违反"单轮"定义的前提下引入这一次交互。这一设计也天然是"预留多轮对话扩展点"的一部分：`AgentRun` 的暂停/恢复机制未来可以直接复用为"多轮对话中用户追加信息"的通用机制。
- **Alternatives considered**: 让 Agent 直接执行修改类操作、仅事后展示结果并允许"撤销"——已被用户在 Q2 澄清中明确否决（选择了"事前确认"而非"事后可撤销"），不采用。

## 9. 只读 / 修改类工具的判定边界

- **Decision**: 工具在定义时静态标注 `mutates: boolean`（`schema.*` 全部只读；`sql.validate`/`sql.format`/`sql.explain` 只读；`sql.executeReadOnly` 只读且在执行前用 `node-sql-parser` 解析语句类型，若检测到非 `SELECT`/`EXPLAIN`/`SHOW` 类语句则直接拒绝并提示改用 `sql.executeWrite`；`sql.executeWrite` 一律标记为修改类，不做语句类型白名单豁免）。
- **Rationale**: 静态标注 + 执行前的语句类型二次校验，双重保证"读写边界"判断不依赖模型自我声明（模型可能出于误判把一次写操作包成"只读请求"），符合宪法安全优先的精神，也让 FR-014 的确认触发条件是确定性的、可测试的。
- **Alternatives considered**: 完全信任模型对"是否修改数据"的判断——把安全边界建立在模型输出之上，风险不可接受，已放弃。

## 10. 多轮对话扩展点的预留形态

- **Decision**: `AgentRun` 携带 `history: AgentMessage[]`，本阶段每次对话都以空 `history` 开始、执行一次循环、返回后即结束该 `AgentRun`（不做跨对话的持久化拼接）；但消息结构、`AgentRun` 的输入参数（`history` 字段）在本阶段就按"未来可传入若干条历史消息"的形态设计，多轮对话上线时只需在发起新 `AgentRun` 前把前序 `AgentMessage[]` 传入，无需变更工具调用契约或循环结构。
- **Rationale**: 直接满足 FR-006"预留上下文管理与多轮对话扩展点"；把"扩展点"落在数据结构（`history` 参数已存在、当前总是传空数组）而不是口头承诺，符合宪法 VI"预留接口不空转"的要求（接口已定义，只是当前调用方总是传空）。
- **Alternatives considered**: 完全不设计 `history` 字段，等多轮对话阶段再加——会导致届时必须修改 `AgentRun` 的输入契约与已发布的 IPC 签名，违反"预留接口在后续实现时不修改已有接口签名"的宪法要求。
