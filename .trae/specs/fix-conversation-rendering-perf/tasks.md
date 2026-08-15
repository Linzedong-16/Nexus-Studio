# Tasks

- [x] Task 1: 修复 RAF Batcher 初始时间戳 bug
  - [x] 将 `createRafBatcher` 中 `lastFlushAt` 初始值从 `0` 改为 `performance.now()`
  - **验证**: `doFlush` 在流式输出时 ~16ms 触发一次而非逐 token

- [x] Task 2: 删除 `useDeferredValue` 多余渲染
  - [x] 在 `StreamingMarkdown` 组件中删除 `useDeferredValue(content)` 调用，直接使用 `content`
  - **验证**: 每次 update 仅提交 1 次

- [x] Task 3: 稳定 `ReactMarkdown` 插件数组引用
  - [x] 将 `[remarkGfm]` 和 `[rehypeHighlight]` 提取为模块顶层 `const MARKDOWN_REMARK_PLUGINS` 和 `const MARKDOWN_REHYPE_PLUGINS`
  - [x] `StreamingMarkdown` 和 `CompletedMarkdown` 中引用顶层常量
  - **验证**: 无功能变化，TypeScript 编译通过

- [x] Task 4: `ConversationTurnItem` 自定义 `arePropsEqual`
  - [x] 实现 `areTurnPropsEqual`：只比较 `turn.id`、`turn.streamingText`、`turn.run?.status`、`turn.run?.finalMessage`、`turn.pending`
  - [x] `memo(Component, areTurnPropsEqual)` 传入自定义比较函数
  - **验证**: 流式输出时仅活跃 turn 重渲染

- [x] Task 5: `ToolCallTraceItem` 自定义 `arePropsEqual`
  - [x] 实现 `areToolCallPropsEqual`：只比较 `toolCall.id`、`toolCall.result`
  - [x] `memo(Component, areToolCallPropsEqual)` 传入自定义比较函数
  - **验证**: 已完成工具调用卡片不重渲染

- [x] Task 6: TypeScript + ESLint 校验
  - [x] 运行 `npx tsc --noEmit`
  - [x] 运行 `npx eslint`
  - **验证**: 零报错

# Task Dependencies

- Task 2 依赖 Task 1（Batcher 生效后 useDeferredValue 的双重渲染问题才真正暴露）
- Task 4 独立，不依赖其他任务
- Task 5 独立，不依赖其他任务
- Task 6 依赖所有前序任务
