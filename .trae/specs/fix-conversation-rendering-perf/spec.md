# 多轮对话渲染性能优化 Spec

## Why
多轮对话的 Markdown 流式渲染链路存在 RAF Batcher 初始时间戳 bug、memo 引用断裂、useDeferredValue 双重渲染等 5 个缺陷，导致实际渲染帧率远低于预期，历史消息不必要重渲染，每帧产生额外计算开销。

## What Changes
- `markdownUtils.ts`：修复 `createRafBatcher` 初始 `lastFlushAt=0` 导致 RAF 分支永不被执行的 bug
- `MarkdownContent.tsx`：删除 `useDeferredValue`，用模块顶层常量稳定插件数组引用
- `ConversationView.tsx`：`ConversationTurnItem` 增加自定义 `arePropsEqual`，`ToolCallTraceItem` 同理

## Impact
- Affected specs: 无
- Affected code: `src/renderer/src/lib/markdownUtils.ts`、`src/renderer/src/components/code/MarkdownContent.tsx`、`src/renderer/src/components/code/ConversationView.tsx`、`src/renderer/src/store/conversationStore.ts`

## MODIFIED Requirements

### Requirement: RAF 批量更新
系统应当在流式接收 text-delta 事件时，使用 `requestAnimationFrame` 将同一帧内的多个 token 合并为一次 Zustand `set()` 调用，减少 React 重渲染次数。

#### Scenario: Batcher 首次延迟进入 RAF
- **WHEN** `append()` 首次调用且距上次 flush < 16ms
- **THEN** 应进入 RAF 调度分支，而非立即同步 flush

#### Scenario: 工具调用阶段重置
- **WHEN** 收到 `tool-call-start` 事件
- **THEN** 应重置 Batcher 缓冲区中的累积文本

### Requirement: Markdown 渲染器性能
系统应当在流式阶段使用纯文本 `<pre>` 渲染（`~0.1ms`），仅在内容包含代码块标记时才切回完整的 `react-markdown` + `remarkGfm` + `rehypeHighlight` 管线。

#### Scenario: 纯文本流式渲染
- **WHEN** 流式文本中不包含 ` ``` ` 标记
- **THEN** 使用 `<pre>` 直接渲染，不初始化 remark/rehype 管线

#### Scenario: 含代码块流式渲染
- **WHEN** 流式文本中包含 ` ``` ` 标记
- **THEN** 切回完整 `ReactMarkdown` 渲染

### Requirement: 组件 memo 优化
系统应当确保 `React.memo` 包裹的对话元素在 props 内容未发生变化时跳过重渲染。

#### Scenario: 历史消息跳过渲染
- **WHEN** 流式更新的 turn 之外的历史 turn 的 `streamingText`、`finalMessage`、`run.status`、`pending` 均未变化
- **THEN** `ConversationTurnItem` 应跳过重渲染

#### Scenario: 工具调用卡片复用
- **WHEN** `ToolCallTraceItem` 的 `toolCall.id` 和 `toolCall.result` 均未变化
- **THEN** 应跳过重渲染