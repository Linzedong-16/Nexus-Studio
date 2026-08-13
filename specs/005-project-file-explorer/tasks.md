# Tasks: 顶部项目选择器与 VSCode 风格文件资源管理器

**Input**: Design documents from `/specs/005-project-file-explorer/`
**Prerequisites**: [plan.md](./plan.md)（必需）、[spec.md](./spec.md)（必需，用户故事）、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/fs-ipc.md](./contracts/fs-ipc.md)、[quickstart.md](./quickstart.md)

**Tests**: 本仓库当前未配置自动化测试框架，spec.md 亦未要求 TDD，故不生成自动化测试任务；验证方式为 Final Phase 中运行 `quickstart.md` 的手动场景。

**Organization**: 任务按用户故事分组，每个故事阶段完成后均可独立验证（对应 quickstart.md 场景 1-4）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可并行执行（不同文件、无未完成依赖）
- **[Story]**：所属用户故事（US1/US2/US3/US4），仅用户故事阶段任务携带此标签
- 每个任务均给出确切文件路径

## Path Conventions

沿用现有 electron-vite 三层结构：`src/main/`（主进程）、`src/preload/`（预加载桥接）、`src/renderer/src/`（渲染进程）。不新建项目根目录，详见 [plan.md](./plan.md) Project Structure。

---

## Phase 1: Setup（共享类型与配置默认值）

**Purpose**：为后续所有阶段准备类型定义与配置默认值，不涉及具体逻辑实现

- [X] T001 [P] 在 `src/renderer/src/types/fileExplorer.ts` 新增 `RecentProjectEntry` 接口（`path`/`name`/`lastUsedAt`），`FileNode` 保持不变
- [X] T002 [P] 在 `src/renderer/src/types/ipc.ts` 为 `ConfigStore` 新增 `recentProjects: RecentProjectEntry[]` 字段，并为 `FileSystemApi` 补充 `createFile`/`createDirectory`/`rename`/`deleteItem`/`moveItem`/`readFileSafe` 方法签名（签名见 [contracts/fs-ipc.md](./contracts/fs-ipc.md)）
- [X] T003 [P] 在 `src/renderer/src/types/workspace.ts` 的 `WorkspaceState` 接口新增 `closeFileTabsUnderPath(rootPath: string): void` 与 `renameFileTab(oldPath: string, newPath: string): void` 方法签名
- [X] T004 [P] 在 `src/main/config/store.ts` 的 `defaults` 中新增 `recentProjects: []`

**Checkpoint**：类型与配置默认值就位，可开始 Foundational 阶段

---

## Phase 2: Foundational（阻塞性前置条件）

**Purpose**：新增全部 `fs:*` IPC 通道、渲染进程 `fsService` 封装、`workspaceStore` 标签页联动动作——这些是全部 4 个用户故事共同依赖的基础设施

**⚠️ CRITICAL**：本阶段完成前，任何用户故事均不可开始实现

- [X] T005 在 `src/main/ipc/fs.ts` 实现 `fs:create-file` 处理器：在 `parentDir` 下创建空文件，同名条目已存在时抛错（FR-013/019）
- [X] T006 在 `src/main/ipc/fs.ts` 实现 `fs:create-directory` 处理器：逻辑同 T005，创建空文件夹
- [X] T007 在 `src/main/ipc/fs.ts` 实现 `fs:rename` 处理器：同目录内改名，目标名称冲突或 `oldPath` 不存在时抛错（FR-014/019/026）
- [X] T008 在 `src/main/ipc/fs.ts` 实现 `fs:delete` 处理器：调用 `shell.trashItem(path)` 移入系统回收站（FR-015/024）
- [X] T009 在 `src/main/ipc/fs.ts` 实现 `fs:move` 处理器：移动到目标目录，目标目录已有同名条目或目标是源自身/子孙目录时抛错（FR-017）
- [X] T010 在 `src/main/ipc/fs.ts` 实现 `fs:read-file-safe` 处理器：读取文件前 8KB 探测空字节判定二进制，二进制时返回 `{isBinary: true}` 不读取全文，否则返回 `{isBinary: false, content}`（FR-020/021）
- [X] T011 [P] 在 `src/preload/index.ts` 的 `fs` 命名空间新增 `createFile`/`createDirectory`/`rename`/`deleteItem`/`moveItem`/`readFileSafe` 对应的 `createInvoke` 声明（依赖 T005-T010）
- [X] T012 [P] 在 `src/preload/index.d.ts` 的 `FileSystemApi` 接口补充上述 6 个方法的类型签名（依赖 T005-T010，与 T011 并行）
- [X] T013 新建 `src/renderer/src/services/fsService.ts`：封装 `window.api.fs` 全部调用（既有 6 个 + 新增 6 个方法），遵循 `configService.ts` 的封装模式（依赖 T011/T012）
- [X] T014 [P] 在 `src/renderer/src/services/index.ts` 导出 `fsService`（依赖 T013）
- [X] T015 [P] 在 `src/renderer/src/store/workspaceStore.ts` 新增 `closeFileTabsUnderPath(rootPath)`（前缀匹配关闭 `type === 'file'` 标签页）与 `renameFileTab(oldPath, newPath)`（前缀匹配更新 `filePath`/标题）两个动作，实现 T003 的类型签名

**Checkpoint**：IPC 通道、`fsService`、`workspaceStore` 联动动作全部就位，用户故事阶段可以开始

---

## Phase 3: User Story 1 - 顶部导航选择/切换项目文件夹 (Priority: P1) 🎯 MVP

**Goal**：顶部导航新增全局"选择项目"入口，支持打开文件夹与最近 20 条记录，跨重启持久化，激活最近记录无需重新弹出系统选择器

**Independent Test**：应用启动后点击顶部入口 → 打开文件夹 → 顶部入口文案变为项目名 → 重启应用后「最近」列表仍包含该记录 → 点击「最近」列表可直接切换而不再弹窗（quickstart.md 场景 1）

- [X] T016 [US1] 在 `src/renderer/src/store/fileExplorerStore.ts` 扩展项目选择状态与动作：新增 `activeProjectPath`/`activeProjectName`/`recentProjects` 状态字段，新增 `loadRecentProjects()`/`openFolder()`/`openRecentProject(path)`/`closeWorkspace()` 动作及内部 `activateProject(path)` 辅助函数（调用 `workspaceStore.closeFileTabsUnderPath(旧路径)`、重置树状态、更新并持久化 `recentProjects`）
- [X] T017 [P] [US1] 在 `src/renderer/src/services/configService.ts` 新增 `getRecentProjects()`/`setRecentProjects(list)` 方法，封装 `window.api.config.get('recentProjects')`/`set('recentProjects', ...)`
- [X] T018 [P] [US1] 新建 `src/renderer/src/components/layout/ProjectPicker.tsx`：下拉菜单包含「打开文件夹」与「最近」分组列表，调用 `fileExplorerStore` 的 `openFolder`/`openRecentProject`，展示当前激活项目名或未激活占位文案
- [X] T019 [US1] 在 `src/renderer/src/components/layout/TitleBar.tsx` 插入 `<ProjectPicker />`（依赖 T018）
- [X] T020 [P] [US1] 在 `src/renderer/src/components/layout/Sidebar.tsx` 将文件资源管理器渲染条件由 `mode.id === 'work' && !collapsed` 调整为 `mode.id === 'work' && !collapsed && activeProjectPath !== null`

**Checkpoint**：User Story 1 可独立验证——顶部选择/切换项目、最近列表持久化全部可用

---

## Phase 4: User Story 2 - 浏览完整的项目文件树 (Priority: P1)

**Goal**：VSCode 风格递归目录树，懒加载子节点、隐藏文件过滤、根节点整体折叠/展开且不影响各子目录独立展开态、项目切换时全量替换树

**Independent Test**：打开含多层子目录的项目，逐级展开定位深层文件，折叠根节点后全部内容隐藏，再展开后此前子目录展开态被保留；切换到另一「最近」项目后树被完全替换（quickstart.md 场景 2）

- [X] T021 [US2] 在 `src/renderer/src/store/fileExplorerStore.ts` 补齐 `fileTree`/`expandedPaths`/`loading` 状态与 `toggleExpand(dirPath)` 动作（懒加载子节点、失败时回滚展开态），并在 `activateProject` 中接入：切换项目时重置 `fileTree`/`expandedPaths`
- [X] T022 [US2] 更新 `src/renderer/src/components/file/FileExplorer.tsx`：移除「打开文件夹」工具条按钮（由 `ProjectPicker` 承担），新增可折叠的根节点标题（展示项目名，点击整体折叠/展开树内容，不清空各子目录的 `expandedPaths`）
- [X] T023 [P] [US2] 核查 `src/main/ipc/fs.ts` 的 `fs:read-dir` 处理器继续正确过滤 `.` 开头隐藏条目、保持目录在前/文件在后按名称排序的既有行为（FR-009/FR-010），如有回归则修复

**Checkpoint**：User Story 1 + 2 共同验证通过——项目选择与文件树浏览均可用

---

## Phase 5: User Story 3 - 对文件/文件夹进行 VSCode 风格的管理操作 (Priority: P2)

**Goal**：新建文件/文件夹（含命名冲突拒绝）、重命名+快捷键、删除+快捷键+回收站、复制路径/相对路径、拖拽移动（含非法嵌套拒绝）、单选高亮

**Independent Test**：右键新建文件遇同名报错拒绝；重命名/删除文件磁盘同步更新，删除后系统回收站可见；拖拽文件到另一文件夹成功移动，拖拽到自身子目录被拒绝；复制路径/相对路径写入剪贴板正确（quickstart.md 场景 3）

- [X] T024 [US3] 在 `src/renderer/src/store/fileExplorerStore.ts` 新增 `selectedPath` 状态与 `setSelected(path)`/`createFile(parentDir, name)`/`createFolder(parentDir, name)`/`rename(oldPath, newName)`/`remove(path)`/`move(sourcePath, targetDirPath)` 动作：均调用 `fsService` 对应方法、成功后立即更新 `fileTree`（复用既有 `updateNodeChildren` 风格的不可变更新辅助函数）；`rename`/`remove` 分别调用 `workspaceStore.getState().renameFileTab`/`closeFileTabsUnderPath`
- [X] T025 [US3] 在 `src/renderer/src/store/fileExplorerStore.ts` 移除 `createSqlFile` 动作（由通用 `createFile` 取代，遵循 spec.md Assumptions 决策）
- [X] T026 [US3] 扩展 `src/renderer/src/components/file/FileTreeNode.tsx` 右键上下文菜单：移除「新建 SQL 脚本」，新增「新建文件」/「新建文件夹」（仅目录节点，创建后进入命名编辑态）、「重命名」、「删除」、「复制路径」、「复制相对路径」（`navigator.clipboard.writeText`，相对路径基于 `activeProjectPath` 前缀裁剪）
- [X] T027 [US3] 在 `src/renderer/src/components/file/FileTreeNode.tsx` 新增单选视觉态：点击节点调用 `setSelected(node.path)` 并高亮当前选中节点
- [X] T028 [P] [US3] 在 `src/renderer/src/components/file/FileExplorer.tsx` 的文件树容器新增局部 `onKeyDown` 监听：聚焦且存在 `selectedPath` 时，`F2` 触发对应节点进入重命名编辑态，`Delete` 触发删除确认弹窗
- [X] T029 [US3] 在 `src/renderer/src/components/file/FileTreeNode.tsx` 使用 `@dnd-kit/core` 为节点添加 draggable（文件与文件夹）与 droppable（仅文件夹）：drop 时调用 `move(sourcePath, targetDirPath)`，客户端先校验目标不是源自身或其子孙路径，非法时直接阻止 drop
- [X] T030 [US3] 在 `src/renderer/src/components/file/FileTreeNode.tsx` 实现命名编辑态 UI：文本输入框替换节点标签，Enter/失焦确认调用 `rename()`/`createFile()`/`createFolder()`，Escape 取消
- [X] T031 [US3] 在 `src/renderer/src/components/file/FileExplorer.tsx` 新增删除确认弹窗（复用现有 Dialog 组件），确认后调用 `remove(selectedPath)`

**Checkpoint**：User Story 1 + 2 + 3 共同验证通过——项目选择、文件树浏览、文件管理操作均可用

---

## Phase 6: User Story 4 - 任意非二进制文件预览/编辑 (Priority: P2)

**Goal**：点击任意非二进制文件在新标签页打开/复用，语法高亮对标原生 VSCode，二进制文件提示不支持预览且不新增标签页，保存写回磁盘，项目切换自动关闭标签页，重命名/删除自动跟随

**Independent Test**：点击不同扩展名文件验证语法高亮与保存写回磁盘；点击二进制文件仅提示不新增标签页；切换项目后旧项目文件标签页全部自动关闭；对已打开文件重命名/删除，标签页自动跟随更新/关闭（quickstart.md 场景 4）

- [X] T032 [US4] 在 `src/renderer/src/components/work/SqlEditor.tsx` 新增文件扩展名到 Monaco language id 的映射（`.ts/.tsx`→typescript、`.js/.jsx`→javascript、`.json`→json、`.md`→markdown、`.html`→html、`.css`→css、`.py`→python、`.yaml/.yml`→yaml、`.sql`→pgsql、未知→plaintext），新增可选 `language` prop（默认 `pgsql`）转发给 Monaco `<Editor>`，仅当 `language === 'pgsql'` 时注册 SQL 补全提供者
- [X] T033 [US4] 更新 `src/renderer/src/components/work/FilePanel.tsx`：按 `state.fileName`/`state.filePath` 扩展名计算 Monaco language id，作为新增 `language` prop 传给 `SqlEditor`（依赖 T032）
- [X] T034 [P] [US4] 泛化 `src/renderer/src/components/file/FileTreeNode.tsx` 的打开行为：文件节点单击（非目录）调用 `fsService.readFileSafe(node.path)`，`isBinary` 为 `true` 时提示"不支持预览"且不新增标签页，否则调用 `workspaceStore.getState().openFileTab({filePath, fileName, content})`（替换原先仅 `.sql` 文件双击打开的逻辑）
- [X] T035 [US4] 在 `src/renderer/src/components/work/FilePanel.tsx` 补充二进制文件兜底展示：当标签页对应文件被判定为二进制时渲染"不支持预览"提示而非编辑器（依赖 T033）
- [X] T036 [P] [US4] 核实 `src/renderer/src/store/fileExplorerStore.ts` 的 `activateProject`（T016）在切换项目前正确调用 `workspaceStore.getState().closeFileTabsUnderPath(旧 activeProjectPath)`，确保旧项目文件标签页全部自动关闭（FR-025）
- [X] T037 [US4] 核实 `src/renderer/src/store/fileExplorerStore.ts` 的 `rename()`/`remove()`（T024）分别正确调用 `workspaceStore.getState().renameFileTab`/`closeFileTabsUnderPath`，确保已打开文件的标签页自动跟随更新/关闭（FR-026）

**Checkpoint**：4 个用户故事全部独立可用——顶部项目选择、文件树浏览、文件管理操作、文件预览编辑

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**：清理被取代的旧能力、端到端手动验证

- [X] T038 [P] 清理 `src/renderer/src/components/file/FileExplorer.tsx` 与 `src/renderer/src/components/file/FileTreeNode.tsx` 中残留的「新建 SQL 脚本」相关未使用图标引用/样式
- [X] T039 运行 `pnpm dev`，按 [quickstart.md](./quickstart.md) 场景 1-4 全部手动验证，修复过程中发现的回归问题
- [X] T040 [P] 核实 `src/renderer/src/store/workspaceStore.ts` 的 `hydrateFileTabs()` 在新 `fsService`/`readFileSafe` 引入后仍能正确恢复文件标签页内容（文件不存在时关闭标签页的既有 catch 逻辑保持不变）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：无依赖，可立即开始
- **Foundational (Phase 2)**：依赖 Setup 完成——**阻塞全部用户故事**
- **User Story 1 (Phase 3)**：依赖 Foundational 完成，无其他故事依赖
- **User Story 2 (Phase 4)**：依赖 Foundational 完成；`fileTree`/`activateProject` 等字段在 US1 的 T016 中引入，故 US2 实际实现顺序上依赖 US1 的 T016（但作为独立验证增量，US2 完成后仍可单独按 quickstart 场景 2 验证）
- **User Story 3 (Phase 5)**：依赖 Foundational 完成；管理操作作用于 US2 建立的 `fileTree`，实现顺序依赖 US2
- **User Story 4 (Phase 6)**：依赖 Foundational 完成；点击打开依赖 US2 的树渲染，标签页联动核实依赖 US1 (T016)/US3 (T024) 的实现
- **Polish (Final Phase)**：依赖全部 4 个用户故事完成

### Parallel Opportunities

- Setup 阶段 T001-T004 全部可并行（不同文件）
- Foundational 阶段 T011/T012 可并行；T013 完成后 T014/T015 可并行
- US1 阶段 T017/T018 可并行；T020 与 T019 可并行
- US2 阶段 T023 可与 T021/T022 并行（不同文件、独立于渲染层改动）
- US3 阶段 T028 可与 T026/T027/T029/T030 并行（`FileExplorer.tsx` vs `FileTreeNode.tsx`）
- US4 阶段 T034/T036 可与 SqlEditor/FilePanel 相关任务并行（不同文件）
- Final Phase T038/T040 可并行；T039 需在其余任务完成后执行

---

## Parallel Example: Setup + Foundational

```bash
# Setup 阶段可并行执行：
Task: "在 src/renderer/src/types/fileExplorer.ts 新增 RecentProjectEntry 接口"
Task: "在 src/renderer/src/types/ipc.ts 补充 ConfigStore/FileSystemApi 新增字段与签名"
Task: "在 src/renderer/src/types/workspace.ts 补充新动作类型签名"
Task: "在 src/main/config/store.ts 的 defaults 新增 recentProjects: []"

# Foundational 阶段，preload 两个文件可并行：
Task: "在 src/preload/index.ts 新增 fs 新方法的 createInvoke 声明"
Task: "在 src/preload/index.d.ts 补充 FileSystemApi 新方法签名"
```

---

## Implementation Strategy

### MVP First（User Story 1 + 2）

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（关键阻塞项）
3. 完成 Phase 3: User Story 1（顶部项目选择）
4. 完成 Phase 4: User Story 2（文件树浏览）
5. **STOP and VALIDATE**：按 quickstart.md 场景 1-2 独立验证——此时已具备"打开项目 + 浏览文件树"的最小可用闭环（MVP），因 US1/US2 同为 P1 优先级且构成完整可用增量
6. 视需要部署/演示

### Incremental Delivery

1. Setup + Foundational → 基础设施就位
2. + User Story 1 → 验证 → MVP 起点（仅项目选择）
3. + User Story 2 → 验证 → MVP 完整（选择 + 浏览，quickstart 场景 1-2）
4. + User Story 3 → 验证 → 文件管理操作可用（quickstart 场景 3）
5. + User Story 4 → 验证 → 文件预览编辑可用（quickstart 场景 4）
6. 每个故事增量交付且不破坏此前故事

---

## Notes

- `[P]` 任务 = 不同文件、无未完成依赖
- `[Story]` 标签用于追溯任务归属的用户故事
- 本功能不新增任何 npm 依赖（宪法 VIII），全部复用 `@dnd-kit/*`、`@monaco-editor/react`、`@radix-ui/react-context-menu`、`electron-store`、`shell.trashItem`、`navigator.clipboard`
- 无自动化测试任务；每个 Checkpoint 均对应 [quickstart.md](./quickstart.md) 的手动验证场景
- 避免同文件冲突：`fileExplorerStore.ts`/`FileTreeNode.tsx`/`FileExplorer.tsx`/`fs.ts` 在各阶段内均按顺序（非 `[P]`）编辑
