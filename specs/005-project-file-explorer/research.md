# Phase 0 研究：顶部项目选择器与 VSCode 风格文件资源管理器

本文档解决 Technical Context 中标记的所有技术决策点，格式统一为 Decision / Rationale / Alternatives considered。

## 1. 新增 IPC 通道设计（新建/重命名/删除/移动/二进制探测）

**Decision**：在现有 `src/main/ipc/fs.ts` 中新增 5 个通道，沿用 `fs:动作` kebab-case 命名与既有 invoke/handle 模式：`fs:create-file`、`fs:create-directory`、`fs:rename`、`fs:delete`、`fs:move`；另新增 `fs:read-file-safe` 用于通用文件标签页的"读取前判别二进制"场景，不改动现有 `fs:read-file`（继续供内部已知安全的文本读取路径复用）。详细签名见 [contracts/fs-ipc.md](./contracts/fs-ipc.md)。

**Rationale**：与现有 `fs:pick-folder`/`fs:read-dir`/`fs:read-file`/`fs:write-file`/`fs:show-item`/`fs:file-exists` 保持同一命名与职责粒度约定（宪法 V），每个通道单一职责，主进程内不含 UI 提示逻辑（冲突/非法操作以抛错形式交给渲染进程 Service 层转换为用户提示）。

**Alternatives considered**：
- 将新增操作合并进单一 `fs:file-operation(action, ...)` 通用通道——拒绝，因为会丢失每个操作独立的强类型入参/返回值签名（违反宪法 II），且与现有细粒度通道风格不一致。
- 复用 `fs:read-file` 直接返回 `{isBinary, content}` 破坏性变更——拒绝，会影响现有调用方的返回值契约；新增 `fs:read-file-safe` 是纯增量变更，风险更小。

## 2. 删除操作的实现方式

**Decision**：`fs:delete` 主进程实现调用 Electron 内置 `shell.trashItem(path)`，移动到系统回收站/垃圾桶（可恢复），不做自定义回收站或二次备份机制。

**Rationale**：满足 FR-024 且零新增依赖（宪法 VIII）；`shell.trashItem` 是 Electron 官方跨平台 API（Windows 回收站 / macOS 废纸篓 / Linux trash），行为与用户预期的"移入系统回收站"完全一致。

**Alternatives considered**：
- 引入第三方 `trash` npm 包——拒绝，Electron 已内置等价能力，引入外部依赖违反宪法 VIII。
- 自行实现"移动到应用私有回收目录"——拒绝，无法被系统级"还原"操作发现，且需要额外维护清理策略，增加不必要的复杂度。

## 3. 复制路径 / 复制相对路径的实现方式

**Decision**：不新增 IPC 通道，直接在渲染进程使用 Web 标准 `navigator.clipboard.writeText()` 写入剪贴板；相对路径通过字符串前缀裁剪计算（`node.path.slice(activeProjectPath.length)` 并去除开头的路径分隔符），不引入 Node.js `path` 模块。

**Rationale**：`navigator.clipboard` 是 Chromium 渲染进程内置的 Web API，不依赖 `nodeIntegration`，不违反进程隔离原则（宪法 I）；相对路径计算只需简单字符串裁剪（激活项目根路径必为文件绝对路径的前缀），无需引入路径处理依赖，满足宪法 VIII。

**Alternatives considered**：
- 新增 `fs:copy-path` IPC 通道，主进程调用 Electron `clipboard` 模块——拒绝，非必要的主进程往返（该操作不涉及文件系统/敏感数据，不需要经过主进程）。
- 引入 `path-browserify` 或类似 polyfill 计算相对路径——拒绝，简单前缀裁剪已足够，无需额外依赖。

## 4. "最近项目"列表的持久化位置

**Decision**：在 `ConfigStore`（`src/renderer/src/types/ipc.ts` 与 `src/main/config/store.ts`）新增独立字段 `recentProjects: RecentProjectEntry[]`，通过既有通用 `config:get`/`config:set` 通道读写，不复用/重命名现有的 `recentFiles: string[]` 字段。

**Rationale**：全代码库检索确认 `recentFiles` 当前未被任何组件消费（零引用），语义也不同（历史遗留的"最近文件"而非"最近项目文件夹"）；新增独立字段避免混淆两种不同概念，且不产生与本功能无关的清理性重命名（超出任务范围）。持久化机制复用既有 `electron-store` + 通用 config 通道，无需新增专用 IPC。

**Alternatives considered**：
- 重命名/复用 `recentFiles` 字段——拒绝，语义不符且属于无关重构。
- 新增独立的 `project:*` IPC 通道及独立存储文件——拒绝，现有通用 `config:get`/`config:set` 已足够，新增专用通道是不必要的复杂度。

## 5. 顶部"选择项目"入口的作用范围与文件树显示位置

**Decision**：顶部"选择项目"入口（`ProjectPicker`）插入 `TitleBar.tsx`，作为全局可见入口（不因当前模式而隐藏）。文件树面板的显示位置保持现状——仍渲染在 `Sidebar.tsx` 内、且仅在 Work 模式下出现，但显示条件由"`mode.id === 'work' && !collapsed`"调整为"`mode.id === 'work' && !collapsed && activeProjectPath !== null`"，未激活项目时不渲染任何文件资源管理器相关面板（满足 FR-002/SC-006）。

**Rationale**：现有 `code` 模式侧边栏内容（任务列表/示例项目占位）与本功能无关，spec 也未提及需要在 Code 模式下展示文件树；将改动面限制在"入口全局可见 + 树面板位置与既有模式门控保持一致，仅追加激活态判断"，是满足全部 FR 且改动最小的方案。

**Alternatives considered**：
- 让文件树面板跨模式全局显示——拒绝，超出 spec 范围（spec 全篇未提及 Code 模式），且与现有模式化侧边栏设计（`config/modes.tsx` 的 `menuGroups` 模式注册表）不符。
- 将"选择项目"入口也做成仅 Work 模式可见——拒绝，FR-001 要求"顶部导航必须提供一个持久可见的入口"，未限定模式，全局可见更贴合 Trae 参考截图与用户原始描述。

## 6. 通用文件标签页的语言高亮方案

**Decision**：泛化现有 `SqlEditor.tsx` 的 Monaco 语言参数——新增按文件扩展名到 Monaco language id 的映射表（如 `.ts`/`.tsx`→`typescript`，`.js`/`.jsx`→`javascript`，`.json`→`json`，`.md`→`markdown`，`.html`→`html`，`.css`→`css`，`.py`→`python`，`.yaml`/`.yml`→`yaml`，未知扩展名→`plaintext`），`.sql` 文件继续固定使用 `pgsql` 并保留现有 schema-aware 补全逻辑；其余语言的文件标签页不注册 SQL 补全提供者。

**Rationale**：`@monaco-editor/react` 内置对上述语言的语法高亮支持，无需额外语言包（宪法 VIII）；保留 `.sql` 现状确保既有查询体验不回退。FR-020 要求渲染效果对标"原生无插件 VSCode"，Monaco 内置语言高亮已能满足该基线，无需引入 VSCode 语言服务器等重量级方案。

**Alternatives considered**：
- 为每种文件类型引入独立的语言服务/插件（如引入 `monaco-languageclient`）——拒绝，远超"原生无插件 VSCode"的对标基线，且违反宪法 VIII。
- 所有文件统一用 `plaintext` 渲染——拒绝，无法体现"参考原生 VSCode"的基本语法高亮效果，用户体验倒退。

## 7. 二进制文件判别启发式

**Decision**：`fs:read-file-safe` 主进程实现读取文件前 8KB（不超过实际文件大小），若该分片内出现空字节（`\0`）即判定为二进制，不再继续读取剩余内容并返回 `{isBinary: true}`；否则读取全文按 UTF-8 解码返回 `{isBinary: false, content}`。

**Rationale**：空字节探测是 Git、GNU diff 等广泛采用的二进制判别启发式，实现简单、零依赖、对文本文件误判率极低，满足 FR-021。仅探测前 8KB 而非全文，避免对大体积二进制文件（如视频、可执行文件）做不必要的全量读取，兼顾 SC-005 的 2 秒响应目标。

**Alternatives considered**：
- 仅按扩展名黑白名单判别——拒绝，无法覆盖未知/无扩展名文件，且与"任意非二进制文件"的要求（FR-020 不限制扩展名）冲突。
- 引入 `isbinaryfile` 等专用 npm 包——拒绝，该启发式足够简单，自行实现即可满足需求，避免新增依赖（宪法 VIII）。

## 8. 拖拽移动的技术选型

**Decision**：复用已有依赖 `@dnd-kit/core` 实现文件树节点的拖拽源（draggable）与文件夹节点的拖放目标（droppable），拖放成功后调用 `fs:move` 完成实际文件系统移动，并在客户端校验"不可将文件夹拖拽到自身或其子孙目录"（FR-017 边界），非法操作直接阻止 drop、不发起 IPC 调用。

**Rationale**：`package.json` 确认 `@dnd-kit/core`/`@dnd-kit/sortable`/`@dnd-kit/utilities` 已是既有依赖，零新增（宪法 VIII）；客户端预校验非法嵌套可避免无意义的主进程往返和用户可见的报错闪烁。

**Alternatives considered**：
- 使用浏览器原生 HTML5 Drag and Drop API——拒绝，需要自行处理大量兼容性与视觉反馈细节，且项目已引入 `@dnd-kit` 作为统一拖拽方案，混用两套机制违反宪法 VIII"一个关注点一个库"。

## 9. 重命名/删除快捷键的实现层级

**Decision**：不接入现有全局快捷键注册表（`keybindingStore`），而是在文件树容器组件内通过局部 `onKeyDown` 监听实现——聚焦在文件树内且存在选中节点时，`F2` 触发重命名进入编辑态，`Delete` 触发删除确认。

**Rationale**：这两个快捷键的作用域严格限定于"文件树内、有选中节点"这一局部上下文，与现有全局快捷键系统（面向应用级、可配置的命令如保存/执行查询）职责不同，不适合注册为全局可配置快捷键，局部事件监听更简单直接，符合"不做超出任务需求的抽象"原则。

**Alternatives considered**：
- 接入全局 `keybindingStore` 使其可被用户自定义——拒绝，增加不必要的配置面，且 spec 未要求这两个快捷键可自定义。

## 10. 标签页联动的实现方式（FR-025/026）

**Decision**：在 `workspaceStore.ts` 新增两个动作：`closeFileTabsUnderPath(rootPath: string)`——关闭所有 `filePath === rootPath` 或以 `rootPath + 路径分隔符` 为前缀的文件标签页（同时覆盖单文件删除与文件夹删除级联关闭其内部已打开文件的场景）；`renameFileTab(oldPath: string, newPath: string)`——将匹配 `oldPath` 前缀的标签页 `filePath` 替换为对应的新路径并更新标题，未保存的修改内容保留不变。项目切换时调用 `closeFileTabsUnderPath(旧 workspacePath)`；删除文件/文件夹后调用同一方法；重命名文件/文件夹后调用 `renameFileTab`。

**Rationale**：前缀匹配天然覆盖"重命名/删除单个文件"与"重命名/删除包含已打开文件的文件夹"两种场景，无需为文件夹场景单独实现级联逻辑，保持接口最小化。

**Alternatives considered**：
- 分别为"文件"和"文件夹"提供不同的关闭/更新方法——拒绝，前缀匹配已能统一处理两种情况，拆分会引入重复逻辑。
