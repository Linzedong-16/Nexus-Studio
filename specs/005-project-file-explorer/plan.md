# Implementation Plan: 顶部项目选择器与 VSCode 风格文件资源管理器

**Branch**: `005-project-file-explorer` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-project-file-explorer/spec.md`

## Summary

移除当前嵌入在侧边栏、仅支持 `.sql` 文件的文件资源管理器，替换为：顶部导航新增全局"选择项目"入口（打开文件夹 + 最近 20 条记录，跨重启持久化）；侧边栏文件树改为完整的 VSCode 风格递归目录树（懒加载、隐藏文件过滤、根节点整体折叠/展开）；补齐 VSCode 风格的文件管理能力（新建文件/文件夹、重命名+快捷键、删除+快捷键+回收站、复制路径/相对路径、拖拽移动、单选、命名冲突拒绝）；将文件点击打开泛化到任意非二进制文件类型，并联动标签页生命周期（重命名跟随更新、删除/切换项目自动关闭）。

技术方案：完全复用现有技术栈——`@dnd-kit/*` 实现拖拽移动、`@monaco-editor/react` 泛化现有 `SqlEditor` 为按扩展名选择语言的通用文件编辑器、`@radix-ui/react-context-menu`（shadcn ContextMenu）扩展右键菜单、`electron-store`（经既有 `config:get`/`config:set` 通道）持久化"最近项目"列表。新增的文件系统操作（新建/重命名/删除/移动/二进制探测）作为主进程 `fs:*` IPC 处理器新增，遵循既有 `模块:操作` 命名与 invoke/handle 契约；渲染进程侧新增 `fsService` 封装所有 `window.api.fs` 调用，供新的 `projectStore`（在现有 `fileExplorerStore` 基础上扩展）调用，标签页联动通过扩展 `workspaceStore` 的两个新方法（关闭指定路径前缀下的文件标签页、跟随重命名更新标签页）实现。全程不引入任何新增 npm 依赖。

## Technical Context

**Language/Version**: TypeScript 5.9+（strict 模式），Electron 39+，React 19

**Primary Dependencies**: 复用现有依赖，不新增——`@dnd-kit/core`/`@dnd-kit/sortable`/`@dnd-kit/utilities`（拖拽移动文件/文件夹）、`@monaco-editor/react` + `monaco-editor`（泛化后的通用文件查看/编辑器）、`@radix-ui/react-context-menu`（shadcn `ContextMenu`，右键菜单扩展项）、`electron-store`（经主进程 `configStore` 持久化"最近项目"列表）、`zustand`（状态管理）；Electron 内置能力——`shell.trashItem`（删除移入系统回收站）、`dialog.showOpenDialog`（已用于打开文件夹）、渲染进程 `navigator.clipboard.writeText`（复制路径/相对路径，无需新增 IPC）

**Storage**: 本地文件系统（`fs`/`fs/promises`，仅主进程访问，契约见 [contracts/fs-ipc.md](./contracts/fs-ipc.md)）；`electron-store`（`nexus-studio-config`）新增 `recentProjects` 字段持久化"最近项目"列表

**Testing**: 当前仓库未配置自动化测试框架（`package.json` 无测试脚本/依赖），遵循宪法"自测验证"流程——`pnpm dev` 启动应用后按 [quickstart.md](./quickstart.md) 场景手动验证；不新增测试框架（避免超出本功能范围的基础设施改动）

**Target Platform**: 桌面端（Electron），Windows / macOS / Linux

**Project Type**: desktop-app（单一 Electron 应用，复用现有 `src/main` + `src/preload` + `src/renderer` 三层结构，非新建项目骨架）

**Performance Goals**: 对应 SC-003——5 层及以上嵌套目录，逐级展开定位任意深度文件 ≤10 秒（依赖按需懒加载，不做全树预渲染）；对应 SC-005——任意非二进制文件点击后 ≤2 秒在新标签页中看到完整内容

**Constraints**: 对应 SC-001——从未打开项目到文件树渲染完成 ≤3 次点击（不含系统目录选择器内的选择动作本身）；对应 FR-023——超大目录必须按需加载子节点，不得一次性递归读取整棵树；不得新增 npm 依赖（宪法 VIII）

**Scale/Scope**: 单一激活项目根目录（同一时间只有一个工作区）；"最近项目"列表上限 20 条、按最近使用排序去重；文件树按目录层级懒加载，每次仅加载被展开目录的直接子项

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                              | 评估                                                                                                                                                                                                                     | 结论   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| I. 进程隔离与安全                 | 所有新增文件系统操作（新建/重命名/删除/移动/二进制探测/读取）均作为主进程 `fs:*` IPC 处理器实现，渲染进程仅经 `window.api.fs` 调用；`contextIsolation=true`/`nodeIntegration=false` 不变；复制路径/相对路径使用渲染进程内置 Web Clipboard API（非 Node API），不违反隔离要求 | PASS   |
| II. TypeScript 全栈类型安全       | 新增 IPC 通道在主进程处理器与 `preload/index.d.ts` 间保持入参/返回值类型一致；`FileNode`/`RecentProjectEntry`/store 新方法签名均补充完整类型，零 `any`                                                                   | PASS   |
| III. 组件化与关注点分离           | 新增 `fsService`（`services/`）封装全部 `window.api.fs` 调用，`projectStore` 只调用 `fsService`，不直接调用 `window.api`；新增 `ProjectPicker` 组件仅负责展示与交互，业务逻辑留在 store；布局组件（`Sidebar`/`TitleBar`）不承载业务逻辑                    | PASS   |
| IV. 数据库适配器模式               | 本功能不涉及数据库适配层                                                                                                                                                                                                 | N/A    |
| V. IPC 通信契约                   | 新增通道沿用 `fs:动作` kebab-case 命名（如 `fs:create-file`、`fs:rename`、`fs:delete`、`fs:move`）；均为双向 invoke/handle；主进程抛错、渲染进程 Service 层捕获后转换为用户提示；主进程内不含 UI 逻辑                              | PASS   |
| VI. 分阶段交付                    | 本功能作为单一迭代交付，不划分子阶段；不影响既有 Phase 划分                                                                                                                                                              | N/A    |
| VII. 中文文档与注释规范           | 本计划及后续 research/data-model/contracts/quickstart 均使用简体中文；新增导出函数/方法/类型将补充中文 JSDoc（`@param`/`@returns`/`@throws`）                                                                            | PASS   |
| VIII. 依赖最小化                  | 不新增任何 npm 依赖；拖拽用 `@dnd-kit/*`（已存在）、回收站用 `shell.trashItem`（Electron 内置）、剪贴板用 `navigator.clipboard`（Web 内置）、编辑器用 `@monaco-editor/react`（已存在）                                        | PASS   |

结论：无宪法违规项，无需填写 Complexity Tracking。

**Post-Design Re-check**（完成 Phase 1 `research.md`/`data-model.md`/`contracts/fs-ipc.md` 设计后复核）：新增 IPC 通道均遵循 `fs:动作` 命名与主进程独占文件系统访问（原则 I/V）；`fsService`/`projectStore`/`workspaceStore` 新方法签名均为强类型、零 `any`（原则 II）；`fsService` 承担全部 `window.api.fs` 封装职责，组件与新增 `ProjectPicker` 不直接调用 `window.api`（原则 III）；设计中确认零新增 npm 依赖（原则 VIII）。结论不变：PASS，无需 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/005-project-file-explorer/
├── plan.md              # 本文件（/speckit-plan 输出）
├── research.md          # Phase 0 输出
├── data-model.md        # Phase 1 输出
├── quickstart.md        # Phase 1 输出
├── contracts/           # Phase 1 输出
│   └── fs-ipc.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

现有 Electron 应用结构不变，本功能在既有 `src/main` / `src/preload` / `src/renderer` 三层内新增与修改文件，不新建项目根目录：

```text
src/main/
├── ipc/
│   ├── fs.ts                     # [修改] 新增 create-file/create-directory/rename/delete/move/read-file-safe 处理器
│   └── index.ts                  # [不变] 已集中注册，无需新增注册调用
└── config/
    └── store.ts                   # [修改] ConfigStore 默认值新增 recentProjects: []

src/preload/
├── index.ts                       # [修改] fs 命名空间新增对应 invoke 方法
└── index.d.ts                     # [修改] FileSystemApi 类型新增方法签名

src/renderer/src/
├── components/
│   ├── layout/
│   │   ├── TitleBar.tsx           # [修改] 插入 ProjectPicker 顶部入口
│   │   └── Sidebar.tsx            # [修改] 移除 FileExplorer 常驻嵌入，改为按激活项目条件渲染
│   ├── layout/ProjectPicker.tsx   # [新增] 顶部"选择项目"下拉菜单（打开文件夹 + 最近列表）
│   └── file/
│       ├── FileExplorer.tsx       # [修改] 顶部工具条精简（无需项目内"打开文件夹"按钮，改由 ProjectPicker 承担）
│       ├── FileTreeNode.tsx       # [修改] 单击打开任意非二进制文件、新增右键菜单项、拖拽 source/target、命名编辑态
│       └── FilePanel.tsx          # [修改] Monaco 语言按文件扩展名动态选择，二进制文件展示"不支持预览"提示
├── services/
│   ├── index.ts                   # [修改] 导出新增 fsService
│   └── fsService.ts               # [新增] 封装 window.api.fs 全部调用（含新增方法）
├── store/
│   ├── fileExplorerStore.ts       # [修改] 扩展为 projectStore 职责：最近项目列表、选中态、新建/重命名/删除/移动动作
│   └── workspaceStore.ts          # [修改] 新增 closeFileTabsUnderPath / renameFileTab 两个动作
└── types/
    ├── fileExplorer.ts            # [修改] 新增 RecentProjectEntry 类型
    ├── workspace.ts                # [修改] 无需新增字段，补充新动作类型签名
    └── ipc.ts                      # [修改] ConfigStore 新增 recentProjects 字段；FileSystemApi 补充新方法签名
```

**Structure Decision**：沿用现有 electron-vite 三层结构（`src/main` 主进程 / `src/preload` 预加载桥接 / `src/renderer` 渲染进程），不引入新的顶层目录。文件资源管理器相关的渲染进程状态与组件保留在既有 `store/fileExplorerStore.ts`、`components/file/` 路径下原地扩展，避免无关的目录重命名/迁移；仅新增 `components/layout/ProjectPicker.tsx` 与 `services/fsService.ts` 两个文件承载本功能新增的、当前代码库中不存在对应位置的职责。

## Complexity Tracking

> 无宪法违规项，本节不适用。
