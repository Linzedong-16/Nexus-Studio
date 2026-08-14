# CLAUDE.md

本文件为 Claude Code 在本仓库工作时自动加载的项目级指令。完整规范见 `.specify/memory/constitution.md`（项目宪法），本文件仅摘录 Claude Code 必须遵守的关键约束。

## 语言要求（最高优先级）

**开发过程中的思考（thinking）与总结（summary）必须使用简体中文描述**，不得使用英文：

- 输出给用户的所有文字说明、进度更新、任务总结、方案讨论 —— 全部使用简体中文
- 思考/推理过程中的内部说明性文字 —— 使用简体中文
- 代码注释、JSDoc（`@param`/`@returns`/`@throws`/`@example`）—— 使用简体中文
- **例外**：标识符（变量名、函数名、类名、文件名、IPC 通道名等）仍使用英文，遵循既有命名规范；代码本身、终端命令、日志字符串保持原样，不做无意义翻译

## 项目概览

Nexus Studio：基于 Electron 的跨平台数据库客户端（当前聚焦 PostgreSQL / MySQL），三层架构（主进程 / 预加载 / 渲染进程），TypeScript 全栈。

- 主进程 `src/main/`：数据库连接、IPC、AI Agent（`src/main/ai/`，ReAct 循环 + DeepSeek）
- 预加载 `src/preload/`：仅通过 `contextBridge` 暴露封装后的 API
- 渲染进程 `src/renderer/src/`：React 19 + Zustand + shadcn/ui + Tailwind CSS 4

## 强制技术栈

Electron、React 19、TypeScript（strict）、Tailwind CSS 4、shadcn/ui（Radix）、Zustand 5、electron-vite、electron-builder、pnpm。禁止引入同类竞品（Redux/MobX、MUI/Ant Design、Webpack 等）替换以上选型。

## 关键约束

- 数据库驱动、文件系统、网络请求（AI API）仅允许在主进程执行；渲染进程禁止直接访问 Node.js API
- `contextIsolation: true`、`nodeIntegration: false`；预加载脚本不暴露原始 `ipcRenderer`
- 数据库密码等敏感信息必须用 `safeStorage` 加密存储，禁止明文
- SQL 查询必须参数化，禁止字符串拼接
- IPC 通道命名：`模块:操作`，kebab-case（如 `db:test-connection`、`agent:run-tool`）
- 禁止 `any`（除声明在 `*.d.ts` 的第三方类型缺口）
- 组件不直接调 `window.electronAPI`，必须经 `services/` 层封装

## 质量门禁

提交/收尾前必须通过：

```bash
pnpm run typecheck
pnpm run lint
pnpm run format
```

## 提交规范

Conventional Commits（`feat:`/`fix:`/`refactor:`/`docs:`/`chore:`/`test:`），提交信息使用中文描述。

## 测试策略

本项目当前未引入自动化测试框架，各功能的测试由用户自行执行（如 `specs/*/quickstart.md` 中的手动验证步骤）；Claude Code 完成实现后应说明如何手动验证，而非编写测试代码，除非用户明确要求。
