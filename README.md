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

- **多数据库支持** — 支持 PostgreSQL 和 MySQL，统一连接管理面板
- **结构浏览** — 数据库 / Schema / 表 / 视图 / 列 层级浏览，支持快速搜索
- **SQL 编辑器** — Monaco Editor 驱动，语法高亮、智能补全、一键格式化
- **查询结果** — 结果集表格展示，支持复制为 CSV / JSON / INSERT 语句
- **工作台工具** — DDL 查看、数据导出（CSV / JSON）、数据导入（CSV / JSON / SQL）
- **ER 图分析** — 选中数据库即可生成实体关系图，支持拖拽交互式浏览

### 🤖 AI Agent（Code 模式）

- **ReAct 智能体** — 基于 ReAct（Reasoning + Acting）循环，自动理解意图、选择工具、执行任务
- **DeepSeek 驱动** — 集成 DeepSeek 大语言模型作为推理核心
- **标准化工具链** — SQL 生成 / 结构分析 / 查询优化 / 错误修复等工具，供 Agent 调用
- **多轮对话** — 上下文持续记忆，支持追问与连续协作
- **对话管理** — 历史记录持久化存储，支持归档、切换、中断恢复

### 📁 项目文件管理

- **VSCode 风格文件树** — 打开本地文件夹，完整文件树浏览，折叠 / 展开
- **文件操作** — 新建 / 重命名 / 删除 / 拖拽移动，完全快捷键支持
- **代码预览** — 点击任意文本文件在新标签页中打开，语法高亮渲染

### 🎨 界面体验

- **Trae 风格布局** — 三模式（Work / Code / Design）切换，流畅动画过渡
- **暗色主题** — 全局暗色主题，减少视觉疲劳
- **可折叠侧边栏** — 自定义无边框窗口，拖拽标题栏，最大化 / 最小化
- **响应式面板** — 可拖拽调整面板大小，空间随心分配

---

## 🛠️ 技术栈

| 层级       | 技术选型                          |
| ---------- | --------------------------------- |
| 桌面框架   | Electron 39                       |
| UI 框架    | React 19                          |
| 语言       | TypeScript（strict 模式）         |
| 样式       | Tailwind CSS 4                    |
| 组件库     | shadcn/ui（Radix 原语）           |
| 状态管理   | Zustand 5                         |
| 构建工具   | electron-vite                     |
| 打包工具   | electron-builder                  |
| 包管理     | pnpm                              |
| 代码编辑器 | Monaco Editor                     |
| ER 图渲染  | Mermaid / @xyflow/react           |
| 语法高亮   | highlight.js                      |
| AI 集成    | DeepSeek API（OpenAI 兼容 SDK）   |
| 数据库驱动 | pg（PostgreSQL）、mysql2（MySQL） |

---

## 📂 项目结构

```
├── src/
│   ├── main/                   # 主进程
│   │   ├── ai/                 #   AI Agent（ReAct 循环 + 工具注册 + LLM Provider）
│   │   │   ├── loop/           #     Agent 执行循环
│   │   │   ├── provider/       #     LLM Provider（DeepSeek）
│   │   │   └── tools/          #     工具定义与注册（SQL / Schema / 文件）
│   │   ├── db/                 #   数据库连接管理
│   │   │   ├── core/           #     连接生命周期、连接池
│   │   │   └── driver/         #     PostgreSQL / MySQL 驱动适配
│   │   ├── ipc/                #   IPC 通信处理
│   │   ├── services/           #   业务服务层
│   │   ├── config/             #   配置管理
│   │   ├── scheduler/          #   定时任务（node-cron）
│   │   ├── updater/            #   自动更新（electron-updater）
│   │   └── logger/             #   日志服务
│   ├── preload/                # 预加载脚本（contextBridge 安全暴露 API）
│   └── renderer/src/           # 渲染进程
│       ├── components/         #   通用组件
│       ├── pages/              #   页面
│       │   ├── work/           #     Work 模式（数据库浏览、SQL 编辑、ER 图）
│       │   └── code/           #     Code 模式（AI Agent 对话）
│       ├── services/           #   API 封装层
│       ├── store/              #   Zustand 状态管理
│       ├── hooks/              #   自定义 Hooks
│       ├── router/             #   前端路由
│       ├── types/              #   类型定义
│       └── lib/                #   工具函数
├── .github/workflows/          # CI/CD（Release 自动构建三端安装包）
├── specs/                      # 特性规格文档
└── electron-builder.yml        # electron-builder 打包配置
```

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
# Windows 安装包
pnpm build:win

# macOS 安装包
pnpm build:mac

# Linux 安装包
pnpm build:linux
```

### 质量检查

```bash
pnpm run typecheck    # TypeScript 类型检查
pnpm run lint         # ESLint 检查
pnpm run format       # Prettier 格式化
```

---

## 🔒 安全设计

- **进程隔离** — `contextIsolation: true`，`nodeIntegration: false`
- **安全传输** — 预加载脚本仅暴露封装后的 API，不暴露原始 `ipcRenderer`
- **密码加密** — 数据库密码使用 `safeStorage` 加密存储，禁止明文
- **参数化查询** — SQL 查询强制参数化，杜绝注入风险
- **确认机制** — AI Agent 执行修改操作前需用户显式确认

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

## 🙋 常见问题

<details>
<summary><strong>如何配置 AI Agent？</strong></summary>

在应用设置面板中配置 DeepSeek API Key，即可在 Code 模式下使用 AI Agent 对话功能。
</details>

<details>
<summary><strong>支持哪些数据库？</strong></summary>

当前支持 **PostgreSQL** 和 **MySQL**，后续将陆续添加更多数据库类型。
</details>

<details>
<summary><strong>如何在多台设备间同步连接配置？</strong></summary>

连接配置加密存储在本地，暂不支持云同步。可以通过导出 / 导入功能迁移配置。
</details>

---

<div align="center">
  <sub>Built with ❤️ by Linzedong-16</sub>
</div>
