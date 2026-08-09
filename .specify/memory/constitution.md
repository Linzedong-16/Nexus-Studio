# DB-Client Constitution

## Core Principles

### I. 进程隔离与安全 (Process Isolation & Security)

Electron 三层架构的进程隔离是安全基石，所有代码严格遵循以下约束：

- **主进程独占危险操作**：数据库连接、文件系统读写、系统 API 调用、网络请求（AI API）**仅允许在主进程中执行**，渲染进程永远不允许直接访问 Node.js API
- **预加载脚本做安全桥梁**：通过 `contextBridge.exposeInMainWorld()` 暴露有限且经过封装的 API，禁止暴露原始 `ipcRenderer` 或 Node.js 模块
- **渲染进程做纯 UI 层**：contextIsolation 必须为 `true`，nodeIntegration 必须为 `false`，渲染进程只负责视图渲染和用户交互，所有数据操作通过 IPC 请求主进程
- **凭据必须加密存储**：数据库密码使用 Electron `safeStorage` API 加密后存储，禁止明文存储任何敏感信息
- **SQL 注入防护**：所有数据库查询必须使用参数化查询（`$1, $2` 占位符），禁止字符串拼接 SQL

### II. TypeScript 全栈类型安全 (TypeScript-First, End-to-End)

TypeScript 是项目唯一编程语言，类型安全贯穿三个进程：

- **零 `any` 容忍**：除明确的第三方库类型缺口外，禁止使用 `any` 类型。类型缺口必须在 `*.d.ts` 文件中声明
- **IPC 接口类型化**：所有 IPC 通道的请求参数和返回值必须有明确的类型定义，主进程和渲染进程共享类型声明
- **数据库 Schema 类型映射**：数据库查询结果必须有对应的 TypeScript 接口定义，确保 Column → Row → UI 渲染的类型链路完整
- **Zustand Store 类型完备**：每个 Store 的状态和方法签名必须完整定义，中间件类型链正确推导

### III. 组件化与关注点分离 (Component-Driven & Separation of Concerns)

UI 层遵循组件化架构，每个组件职责单一：

- **shadcn/ui 为基础组件层**：通用 UI 组件（Button、Dialog、Table 等）统一使用 shadcn/ui，不自行实现基础交互控件
- **业务组件单一职责**：每个组件文件只负责一个清晰的功能模块（如 `ConnectionDialog` 只管连接编辑、`ResultTable` 只管结果展示）
- **服务层抽离业务逻辑**：组件不直接调用 `window.electronAPI`，必须通过 `services/` 层的 Service 类封装（如 `connectionService`、`queryService`）
- **状态管理统一用 Zustand**：全局状态存储在 Zustand Store 中，组件内局部状态使用 `useState`/`useReducer`，禁止使用 React Context 管理频繁变更的状态
- **布局组件与业务组件分离**：`layout/` 目录下的组件（AppShell、Sidebar、TabBar、StatusBar）只负责框架布局，不包含业务逻辑

### IV. 数据库适配器模式 (Database Adapter Pattern)

数据库连接层采用适配器模式，为多数据库支持预留扩展点：

- **统一接口 `IDatabaseAdapter`**：所有数据库驱动必须实现统一接口，包含 `connect`、`disconnect`、`execute`、`testConnection`、`getSchemas`、`getTables`、`getColumns` 等方法
- **PostgreSQL 优先，适配器不魔改**：首期实现 `PostgreSQLAdapter`（基于 `pg` 驱动），适配器层只做接口适配，不对数据库驱动行为做额外封装或魔改
- **连接池管理单例化**：`ConnectionManager` 为全局单例，管理所有活跃连接，提供连接复用、健康检查和优雅关闭
- **新增数据库类型只需新增适配器**：添加 MySQL/SQLite 支持时，只需新增对应的 Adapter 类，不改动 IPC 层和 UI 层

### V. IPC 通信契约 (IPC Communication Contract)

主进程与渲染进程的通信遵循严格的请求-响应契约：

- **命名规范**：IPC 通道名使用 `模块:操作` 格式（如 `db:connect`、`db:execute`、`file:export`、`ai:chat`）
- **双向通信使用 `invoke/handle`**：需要返回值的操作（数据库查询、文件读写）统一使用 `ipcRenderer.invoke()` + `ipcMain.handle()` 模式
- **单向通知使用 `send/on`**：仅用于不期待返回值的通知（如窗口状态变更、主题切换）
- **错误统一处理**：主进程 catch 异常后，通过 throw 返回给渲染进程，渲染进程在 Service 层统一捕获并展示
- **禁止在主进程处理 UI 逻辑**：主进程只返回数据，不包含任何 UI 渲染逻辑（如格式化、颜色、文案）

### VI. 分阶段交付与向后兼容 (Phased Delivery & Backward Compatibility)

项目按四个阶段渐进式交付，每阶段功能独立可运行：

- **Phase 1（基础框架）**：可运行的 Electron 应用骨架，UI 布局完整，IPC 基础设施就绪
- **Phase 2（PostgreSQL 核心）**：连接管理、SQL 编辑、查询执行、结果展示 → 此时已是一个可用的 PostgreSQL 客户端
- **Phase 3（高级功能）**：数据导入导出、图表可视化、应用设置、查询历史
- **Phase 4（AI 集成）**：自然语言转 SQL、智能补全、数据分析 → 通过预留接口接入，不破坏现有功能
- **每阶段可独立交付**：任意阶段完成后，应用应可正常构建、运行和使用，下一阶段功能作为增量添加
- **预留接口不空转**：AI 接口在 Phase 1-3 中定义但不实现，Phase 4 实现时直接填充，不修改已有接口签名

### VII. 中文文档与注释规范 (Chinese Documentation & Comments)

**所有思考过程、规划讨论、总结文档以及代码注释必须使用简体中文**，确保团队协作和 AI 辅助开发的一致性：

- **AI 辅助开发输出语言**：AI 在编写代码时的中间思考过程（thinking）、开发规划（planning）、任务总结（summary）**必须使用简体中文描述**，不得使用英文。这确保了中文开发者能够清晰理解所有决策背景和实现意图
- **JSDoc 强制要求**：所有**导出函数、类方法、类型定义、接口**必须附带严格的 JSDoc 注释，JSDoc 描述必须使用**简体中文**，包含以下必要标签：
  - `@param` — 参数说明（每个参数逐一描述，含类型和用途）
  - `@returns` — 返回值说明（含类型和含义）
  - `@throws` — 可能抛出的异常说明（如有）
  - `@example` — 简要使用示例（对外暴露的公共 API 必须包含）
  - `@description` — 函数功能概述（复杂逻辑必须包含）
- **JSDoc 示例格式**：

````typescript
/**
 * 根据连接 ID 获取数据库连接，若连接不存在则抛出异常
 *
 * @param connectionId - 连接的唯一标识符
 * @param options - 连接选项配置
 * @param options.timeout - 连接超时时间（毫秒），默认 5000
 * @returns 活跃的数据库连接实例
 * @throws {ConnectionNotFoundError} 当指定 ID 的连接不存在时抛出
 * @example
 * ```typescript
 * const conn = await connectionManager.getConnection('conn-001', { timeout: 10000 })
 * const result = await conn.execute('SELECT * FROM users')
 * ```
 */
async getConnection(connectionId: string, options?: ConnectOptions): Promise<Connection> {
  // ...
}
````

- **内联注释**：复杂逻辑、算法实现、非显而易见的代码必须在关键行上方添加中文注释说明意图
- **类型定义注释**：接口和类型别名的每个字段必须有中文 JSDoc 注释，说明字段含义和约束
- **例外情况**：变量名、函数名、类名、文件名等**标识符**使用英文（遵循命名规范），仅注释和文档使用中文

### VIII. 依赖最小化 (Minimal Dependencies)

推崇零依赖或轻依赖，避免依赖膨胀：

- **优先使用 Electron 内置 API**：加密存储用 `safeStorage`、文件操作用 `fs`、对话框用 `dialog`，不引入额外包
- **同类依赖只选一个**：状态管理只用 Zustand（不混用 Redux/Jotai）、图表只用 Recharts（不混用 ECharts）、SQL 驱动只用 `pg`（不混用 `postgres`、`knex`）
- **按需引入**：按 Phase 分级安装依赖（P0 必须 → P1 重要 → P2 可选），不一次性安装所有依赖
- **评估包体积和原生依赖**：优先选择纯 JavaScript 实现、无需原生编译的包，确保 Electron 跨平台打包顺利

## 技术栈约束

### 强制技术栈（不可变更）

| 类别     | 技术                 | 约束                                                   |
| -------- | -------------------- | ------------------------------------------------------ |
| 运行时   | Electron 39+         | 跨平台桌面应用框架，不可替换                           |
| UI 框架  | React 19             | 渲染进程唯一框架，不可混用 Vue/Svelte 等               |
| 语言     | TypeScript 5.9+      | 唯一开发语言，strict 模式                              |
| 样式方案 | Tailwind CSS 4       | 原子化 CSS，不可混用 CSS Modules / styled-components   |
| 组件库   | shadcn/ui (Radix UI) | 无头组件基础，不可引入 MUI / Ant Design 等重量级组件库 |
| 状态管理 | Zustand 5            | 渲染进程全局状态方案，不可混用 Redux / MobX            |
| 构建工具 | electron-vite 5      | 多入口构建工具，不可替换为 Webpack / electron-forge    |
| 打包工具 | electron-builder     | 安装包构建，不可替换                                   |
| 包管理器 | pnpm                 | 唯一包管理器，不可混用 npm / yarn                      |

### 推荐技术栈（优先选择）

| 类别       | 推荐                      | 备选                      |
| ---------- | ------------------------- | ------------------------- |
| 数据库驱动 | `pg`                      | —                         |
| 代码编辑器 | `@monaco-editor/react`    | `react-codemirror`        |
| 数据表格   | `@tanstack/react-table`   | —                         |
| 虚拟滚动   | `@tanstack/react-virtual` | —                         |
| 面板布局   | `react-resizable-panels`  | —                         |
| SQL 解析   | `node-sql-parser`         | —                         |
| SQL 格式化 | `sql-formatter`           | —                         |
| 数据可视化 | `recharts`                | `echarts`（大数据量场景） |
| 日志       | `electron-log`            | —                         |
| 持久化     | `electron-store`          | —                         |
| AI 集成    | `openai`                  | `@anthropic-ai/sdk`       |

## 代码质量标准

### 静态检查

- TypeScript 编译必须零错误（`pnpm run typecheck` 通过）
- ESLint 检查必须零错误（`pnpm run lint` 通过）
- Prettier 格式化必须一致（`pnpm run format` 检查通过）

### 命名规范

- **文件命名**：组件文件使用 PascalCase（`ConnectionDialog.tsx`），工具/服务文件使用 camelCase（`connectionService.ts`），Store 文件使用 camelCase（`connectionStore.ts`），类型文件使用 camelCase（`database.ts`）
- **IPC 通道命名**：`模块:操作` 格式，全小写，使用 kebab-case（`db:test-connection`）
- **组件命名**：React 组件使用 PascalCase，函数/变量使用 camelCase，常量使用 UPPER_SNAKE_CASE
- **数据库相关命名**：SQL 关键字使用大写，表名/列名使用小写+下划线（`user_id`）

### 目录结构规范

```
src/
├── main/           # 主进程代码（禁止引入 React/前端库）
│   ├── ipc/        # IPC 处理器目录
│   ├── db/         # 数据库连接层
│   │   └── adapters/ # 数据库适配器
│   └── utils/      # 主进程工具函数
├── preload/        # 预加载脚本（禁止引入第三方库）
└── renderer/       # 渲染进程
    └── src/
        ├── components/   # 组件
        │   ├── ui/       # 基础 UI 组件（shadcn/ui）
        │   ├── layout/   # 布局组件
        │   ├── connection/ # 连接管理组件
        │   ├── editor/   # 编辑器组件
        │   ├── result/   # 结果展示组件
        │   ├── schema/   # Schema 浏览组件
        │   └── ai/       # AI 面板组件（预留）
        ├── store/        # Zustand Store
        ├── services/     # 服务层
        ├── hooks/        # 自定义 Hooks
        ├── lib/          # 工具函数
        └── types/        # 类型定义
```

## 开发工作流

### 功能开发流程

1. **需求对齐**：确认功能归属哪个 Phase，是否已有预留接口
2. **接口先行**：先定义 IPC 通道、Service 接口、Store 类型，再实现
3. **主进程 → 预加载 → 渲染进程**：按数据流向从底层向上开发
4. **组件开发**：先实现 UI 骨架，再接入真实数据
5. **自测验证**：`pnpm run dev` 启动，手动验证功能完整

### 质量门禁

- 代码提交前必须通过 `typecheck` + `lint` + `format`
- 跨进程通信模块（IPC/预加载）的变更必须手动验证主进程和渲染进程两端
- 数据库操作变更必须验证连接成功、查询正常、错误处理正确

### Git 提交规范

- 使用 Conventional Commits 格式：`feat:` / `fix:` / `refactor:` / `docs:` / `chore:` / `test:`
- 提交信息使用中文描述

## Governance

1. **宪法权威**：本宪法是 DB-Client 项目的最高开发准则，所有代码、架构决策、技术选型必须符合宪法规定
2. **宪法优先于便利**：当开发便利性与宪法原则冲突时，优先遵循宪法。例如：不能为了"快速实现"而跳过预加载脚本直接在渲染进程访问 Node.js
3. **修订需文档化**：宪法的任何修订必须记录修改原因、影响范围、迁移方案，并更新版本号
4. **新功能合规审查**：每个新功能实现前，需要对照宪法原则检查是否合规（安全隔离、类型安全、组件化、适配器模式等）
5. **技术债务跟踪**：如果因紧急情况不得不违反宪法（如临时绕过预加载脚本），必须创建 ISSUE 跟踪修复，并在下一阶段优先处理
6. **复杂度需证明必要性**：任何超出推荐技术栈的方案或引入新依赖，必须提供充分的理由说明

**Version**: 1.1.0 | **Ratified**: 2026-08-08 | **Last Amended**: 2026-08-08
