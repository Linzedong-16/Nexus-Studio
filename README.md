# Nexus Studio

<div align="center">

基于 **Electron + React** 的跨平台数据库客户端，融合 **AI Agent 智能对话**，让数据库管理更高效、更智能。

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Version](https://img.shields.io/badge/version-1.1.4-green)

</div>

---

## ✨ 核心特性

### 🗄️ 数据库管理

- **多数据库支持** — PostgreSQL、MySQL 统一连接管理面板
- **结构浏览** — 数据库 / Schema / 表 / 视图 / 列层级树，支持快速搜索
- **SQL 编辑器** — Monaco Editor 驱动，语法高亮、智能补全、一键格式化
- **查询结果集** — 虚拟滚动渲染，支持复制为 CSV / JSON / INSERT 语句
- **数据导入导出** — 支持 CSV / JSON / SQL 格式
- **ER 图分析** — 选中数据库自动生成实体关系图（Mermaid），支持拖拽交互式浏览

### 🤖 AI Agent（Code 模式）

- **ReAct 智能体** — Reasoning + Acting 循环，自动理解意图、选择工具、执行任务
- **DeepSeek 驱动** — 兼容 OpenAI SDK，可配置自定义 API Key / Base URL / Model
- **12 个标准化工具**：

  | 类别 | 工具 | 说明 |
  |---|---|---|
  | Schema 内省 | `schema.listDatabases` `schema.listSchemas` `schema.listTables` `schema.listColumns` `schema.listIndexes` `schema.getDdl` | 数据库结构查询 |
  | SQL | `sql.validate` `sql.format` `sql.explain` `sql.executeReadOnly` `sql.executeWrite` | SQL 校验 / 格式化 / 执行计划 / 执行 |
  | 文件 | `file.readFile` | 项目内文本文件读取 |

- **安全门控** — 修改类工具（`sql.executeWrite`）执行前需用户显式确认
- **流式输出** — 逐 token 实时推送，打字机效果
- **上下文滑动窗口** — 自动裁剪历史消息防止超 token 限制（128K × 80%）
- **对话管理** — 历史记录持久化，支持多轮对话、切换、中断恢复

### 📁 项目文件管理

- **VSCode 风格文件树** — 打开本地文件夹，完整文件树浏览
- **文件操作** — 新建 / 重命名 / 删除 / 拖拽移动，快捷键支持
- **代码预览** — 文本文件在新标签页中打开，语法高亮渲染

### 🎨 界面体验

- **双模式切换** — Work（数据库操作）/ Code（AI 对话），平滑动画过渡
- **暗色主题** — 全局暗色主题，View Transitions API 圆形扩散切换动画
- **可折叠侧边栏** — 220px ⇄ 56px，GPU 合成层驱动动画无卡顿
- **无边框窗口** — 自定义标题栏，支持拖拽、最大化 / 最小化
- **响应式面板** — 可拖拽调整面板大小

---

## 🛠️ 技术栈

| 层级 | 技术选型 |
|---|---|
| 桌面框架 | Electron 39 |
| UI 框架 | React 19 |
| 语言 | TypeScript（strict 模式） |
| 样式 | Tailwind CSS 4 |
| 组件库 | shadcn/ui（Radix 原语） |
| 状态管理 | Zustand 5 |
| 构建工具 | electron-vite |
| 打包工具 | electron-builder |
| 包管理 | pnpm |
| SQL 编辑器 | Monaco Editor |
| ER 图 | Mermaid + @xyflow/react |
| 语法高亮 | highlight.js |
| 图标 | lucide-react |
| AI 集成 | DeepSeek API（OpenAI 兼容 SDK） |
| 数据库驱动 | pg（PostgreSQL）、mysql2（MySQL） |
| 自动更新 | electron-updater（GitHub Release） |

---

## 📂 项目结构

```
├── src/
│   ├── main/                      # 主进程
│   │   ├── ai/                    #   AI Agent（ReAct 循环 + 12 个工具 + Provider）
│   │   │   ├── loop/              #     AgentRun 状态机 + ReAct 循环编排
│   │   │   ├── provider/          #     IModelProvider 接口 + DeepSeek 实现
│   │   │   └── tools/             #     ToolDefinition / ToolRegistry / 工具实现
│   │   ├── db/                    #   数据库连接管理
│   │   │   ├── core/              #     连接生命周期、连接池、驱动管理
│   │   │   └── driver/            #     PostgreSQL（pg）/ MySQL（mysql2）
│   │   ├── ipc/                   #   12 个 IPC 模块（统一注册 + 异常捕获）
│   │   ├── services/              #   业务服务层
│   │   ├── config/                #   配置管理（electron-store）
│   │   ├── scheduler/             #   定时任务（node-cron）
│   │   ├── updater/               #   自动更新（electron-updater）
│   │   └── logger/                #   日志服务
│   ├── preload/                   # 预加载脚本（contextBridge 安全暴露 API）
│   │   ├── index.ts               #   contextBridge.exposeInMainWorld
│   │   └── utils.ts               #   createInvoke / createListener 工厂
│   └── renderer/src/              # 渲染进程
│       ├── components/            #   通用组件 & 布局（AppShell / Sidebar / ModeSwitcher）
│       ├── pages/                 #   页面
│       │   ├── work/              #     Work 模式（数据库浏览、SQL 编辑、ER 图）
│       │   └── code/              #     Code 模式（AI Agent 对话）
│       ├── services/              #   API 封装层（updaterService / agentService 等）
│       ├── store/                 #   Zustand 状态管理
│       ├── hooks/                 #   自定义 Hooks
│       ├── router/                #   HashRouter 前端路由
│       ├── config/                #   模式注册表（modes.tsx）
│       ├── types/                 #   类型定义
│       └── lib/                   #   工具函数（主题动画 / Monaco 配置 / RAF 批量合并）
├── .github/workflows/release.yml  # CI/CD（三平台矩阵并行打包 → GitHub Release）
└── electron-builder.yml           # 打包配置（NSIS / DMG / AppImage+deb）
```

---

## 🏗️ 架构设计

### IPC 通信

两种模式，全部运行在 `contextIsolation: true` 的安全隔离下：

| 模式 | 方向 | 形式 | 典型场景 |
|---|---|---|---|
| `invoke` / `handle` | 渲染 → 主 | `Promise<T>` | 数据库查询、配置读写、AI 对话 |
| `send` / `on` | 主 → 渲染 | 事件订阅 | 流式文本推送、连接状态、下载进度 |

**工厂函数消除样板代码**：`createIPCHandler`（主进程注册）、`createInvoke` / `createListener`（preload 暴露）。

### AI Agent ReAct 循环

```
用户输入 → startRunStream()
  ↓
while running:
  Think → provider.chat(messages, tools)   ← 非流式快速拿到工具选择
  Act   → toolRegistry.invoke()             ← zod 校验 + 执行
  Observe → 结果写回 messages，继续循环
  ↓
final → provider.chatStream() → 流式输出   ← 逐 token 推送
```

### 渲染进程打包优化

| Chunk | 内容 | 大小（估算） | 变更频率 |
|---|---|---|---|
| `reactflow` | @xyflow/react | ~370 KB | 极少 |
| `mermaid` | mermaid | ~1.1 MB | 极少 |
| `icons` | lucide-react | ~36 KB | 极少 |
| `vendor-react` | react + react-dom + react-router | ~216 KB | 极少 |
| `WorkHomePage` | Work 模式页面（懒加载） | ~8.3 MB | Work 改动时 |
| `CodeHomePage` | Code 模式页面（懒加载） | ~757 KB | Code 改动时 |
| `index` | 主包（业务逻辑） | ~1.4 MB | 每次业务改动 |

**收益**：日常 Bug 修复仅下载变化的 1.4 MB 主包，其余 ~6.8 MB 命中缓存。页面懒加载 + `onMouseEnter` 预加载保证切换模式无卡顿。

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 22
- **pnpm** ≥ 10

### 安装

```bash
pnpm install
```

### 开发

```bash
pnpm dev
```

### 构建

```bash
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

### 质量检查

```bash
pnpm run typecheck    # TypeScript 类型检查
pnpm run lint         # ESLint 检查
pnpm run format       # Prettier 格式化
```

---

## 📦 自动更新

应用启动后 10 秒自动检查更新，也可在「关于」对话框手动触发。

```
checking → available（右下角提示）→ 用户点击下载
  → downloading（百分比进度）→ downloaded → 用户点击重启安装
```

- **不静默下载**：等用户确认后才下载，不占用意外带宽
- **GitHub Release 源**：推送 `v*.*.*` tag 后 CI 自动构建三平台安装包
- **NSIS 覆盖安装**：Windows 下用户数据不受影响

---

## 🔄 CI/CD

推送语义化版本 tag（如 `v1.1.4`）自动触发：

```
windows-latest ─→ pnpm install ─→ build ─→ NSIS .exe ─┐
macos-latest   ─→ pnpm install ─→ build ─→ DMG       ─┤
ubuntu-latest  ─→ pnpm install ─→ build ─→ AppImage   ─┤
                                                        ↓
                                          统一下载 → Draft Release
                                                        ↓
                                              人工核对 → Publish
```

---

## 🔒 安全设计

- **进程隔离** — `contextIsolation: true`，`nodeIntegration: false`
- **安全传输** — preload 仅暴露封装后的 API，不暴露原始 `ipcRenderer`
- **密码加密** — 数据库密码使用 `safeStorage` 加密存储
- **参数化查询** — SQL 查询强制参数化，杜绝注入
- **AI 安全门控** — 修改类工具执行前需用户显式确认
- **文件读取越界检查** — AI Agent 文件工具禁止读取项目目录外的文件

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。
