# Implementation Plan: AI Agent 多轮对话与本地记忆化存储

**Branch**: `009-agent-memory-storage` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-agent-memory-storage/spec.md`

## Summary

在现有 008 号功能（Code 模式 Agent 化改造）的单轮对话基础上，实现：

1. **多轮对话**：Agent 能跨轮次记住上下文，用户无需重复提供信息
2. **本地持久化存储**：对话历史在应用重启后可恢复，采用混合存储方案（electron-store 索引 + JSONL 消息文件）实现高性能 O(1) 增量写入
3. **对话管理**：左侧侧边栏"对话历史"面板替换现有占位 UI，支持对话的创建、选择、归档、删除和按时间排序

## Technical Context

**Language/Version**: TypeScript 5.9+（strict）

**Primary Dependencies**:

- electron-store（对话索引持久化，已有依赖）
- Node.js `fs.promises`（JSONL 消息文件读写，内置）
- React 19 + Zustand 5（渲染进程状态管理，已有）
- shadcn/ui + Tailwind CSS 4（UI 组件，已有）
- DeepSeek API（LLM 推理，已在 008 集成）

**Storage**:

- 对话索引：electron-store `conversations` key（JSON，~10KB for 100 conversations）
- 消息正文：`{userData}/conversations/{conversationId}.jsonl`（每行一条 JSON 消息）
- 进行中状态：electron-store `active-runs` key

**Testing**: 手动验证（`quickstart.md`），符合项目无自动化测试策略

**Target Platform**: Windows + macOS + Linux（Electron 跨平台桌面应用）

**Project Type**: Electron 桌面应用（三层架构）

**Performance Goals**:

- 单轮消息持久化写入 < 50ms（O(1) append）
- 对话列表首屏渲染 < 500ms
- 100 条对话 + 10000 条消息规模下冷启动增幅 < 50%
- UI 滚动 30fps+

**Constraints**:

- 所有文件 I/O 仅在主进程执行（宪法 I）
- 渲染进程不直接访问 `fs`、`path` 等 Node.js API
- 密码等敏感信息不得出现在对话存储中
- 禁止 `any`（除第三方类型缺口）
- 禁止引入新重量级依赖

**Scale/Scope**:

- 单用户本地应用
- 目标：100 条对话、10000 条消息流畅运行
- 新增 ~8 个文件（组件、IPC handler、Store 扩展、主进程存储服务）

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                        | 状态    | 证据 / 决策                                                                                                                                                                   |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. 进程隔离与安全           | ✅ PASS | 文件 I/O（JSONL 读写、electron-store）仅在主进程 `conversationService.ts` 中执行；渲染进程通过 `conversation:*` IPC 获取数据；预加载脚本仅暴露封装后的 API                    |
| II. TypeScript 全栈类型安全 | ✅ PASS | 所有实体（Conversation/ConversationMessage/ConversationIndex）有完整类型定义；IPC 通道参数和返回值类型化；Zustand Store 类型完备                                              |
| III. 组件化与关注点分离     | ✅ PASS | 对话面板为独立组件（`ConversationList` → `SidebarNav` 渲染）；Store 管理状态（`conversationStore`）；Service 层封装 IPC（`conversationService`）；组件不直接调用 `window.api` |
| IV. 数据库适配器模式        | N/A     | 本功能不涉及数据库适配器变更                                                                                                                                                  |
| V. IPC 通信契约             | ✅ PASS | 新增 `conversation:*` 通道族遵循 `模块:操作` 命名；全部使用 `invoke/handle` 模式；主进程无关 UI 逻辑                                                                          |
| VI. 分阶段交付              | ✅ PASS | 本功能属于 Phase 4（AI 集成）的一部分，基于 008 号功能架构扩展，不破坏现有功能                                                                                                |
| VII. 中文文档与注释         | ✅ PASS | 所有注释、JSDoc 使用简体中文；标识符使用英文                                                                                                                                  |
| VIII. 依赖最小化            | ✅ PASS | 不引入新依赖；存储层使用 Node.js 内置 `fs.promises`；索引层复用已有 `electron-store`                                                                                          |

### Phase 1 设计复验

| 原则             | 复验结果 | 说明                                                                                                                                            |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| I. 进程隔离      | ✅ PASS  | `conversationService.ts`（主进程）封装所有文件 I/O；`ConversationStore` → `conversationService` → IPC → `conversationService`（主进程）链路清晰 |
| III. 关注点分离  | ✅ PASS  | `modes.tsx` → `buildCodeMenuGroups()` 从 Store 取数据；`SidebarNav` 通用渲染不变；对话面板逻辑集中在 `conversationStore`                        |
| VIII. 依赖最小化 | ✅ PASS  | research.md §1 决策：不引入 SQLite/LevelDB，使用内置 fs + electron-store 组合                                                                   |

## Project Structure

### Documentation (this feature)

```text
specs/009-agent-memory-storage/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── ipc-conversation.md   # conversation:* IPC 契约
│   └── ui-sidebar-panel.md   # 对话面板 UI 契约
├── checklists/
│   └── requirements.md  # Spec quality checklist
├── spec.md              # Feature specification
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── ipc/
│   │   ├── agent.ts              # 扩展现有 handler：加载历史上下文 + 写入新消息
│   │   └── conversation.ts       # 新增：conversation:* 通道 handler
│   ├── ai/
│   │   └── loop/
│   │       ├── AgentRun.ts       # 扩展：history 升级 + conversationId
│   │       └── reactLoop.ts      # 扩展：startRun 接受 ChatMessage[] 上下文
│   └── services/
│       └── conversationService.ts # 新增：对话存储读写 + 索引管理（主进程）
│
├── preload/
│   ├── index.ts                  # 扩展：新增 conversation.* 预加载方法
│   └── index.d.ts                # 扩展：新增 ConversationApi 类型声明
│
└── renderer/
    └── src/
        ├── types/
        │   ├── agent.ts          # 扩展：AgentChatRequest 新增 conversationId
        │   └── conversation.ts   # 扩展：新增 Conversation/ConversationMessage 类型
        ├── store/
        │   └── conversationStore.ts # 重写：从单轮 turns 扩展为多对话管理
        ├── services/
        │   └── conversationService.ts # 新增：对话 Service 层
        ├── components/
        │   └── ai/               # 新增目录
        │       ├── ConversationList.tsx   # 对话列表组件（SidebarNav 渲染项）
        │       └── ConversationItem.tsx   # 单个对话项组件（右键菜单）
        ├── config/
        │   └── modes.tsx          # 修改：Code 模式 buildPlaceholderMenuGroups → buildCodeMenuGroups
        │
        └── (existing files unchanged)
```

**Structure Decision**: 在现有 Electron 三层架构下，新增文件沿袭既有目录约定。`src/main/services/` 新增存储服务层；`src/renderer/src/components/ai/` 新增 AI 面板组件目录（008 号功能已预留但未创建）；`src/renderer/src/store/conversationStore.ts` 从临时单轮实现重写为完整的多对话管理 Store。

## Complexity Tracking

> 无宪法违反项，无需填写。
