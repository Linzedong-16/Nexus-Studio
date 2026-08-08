# Phase 1 Data Model: 外壳领域类型

本期无数据库实体，"数据模型"为外壳配置与 UI 状态的 TypeScript 类型模型（宪法 II：全量类型化）。字段约束来源于 spec.md 功能需求。

## 1. 模式与菜单配置（静态配置，编译期确定）

### `ModeId`

```typescript
type ModeId = 'work' | 'code' | 'design' // 本期三实例；新增模式时扩展联合类型
```

### `ModeConfig` — 模式（spec 实体：模式）

| 字段         | 类型                 | 约束                                                        |
| ------------ | -------------------- | ----------------------------------------------------------- |
| `id`         | `ModeId`             | 唯一；注册表内不得重复（FR-005）                            |
| `label`      | `string`             | 切换器显示名（Work / Code / Design）                        |
| `icon`       | `LucideIcon \| null` | 切换器标签前置图标；Code 为 `</>`（CodeXml），无图标传 null |
| `basePath`   | `string`             | 模式路由基址，必须以 `/` 开头且全局唯一，如 `/work`         |
| `routes`     | `ModeRoute[]`        | 至少含 1 条 `path: ''` 的默认首页（FR-019）                 |
| `menuGroups` | `MenuGroup[]`        | 侧边栏菜单组；本期三模式同构（spec Assumptions）            |

### `ModeRoute` — 页面路由（spec 实体：页面路由）

| 字段        | 类型                  | 约束                                            |
| ----------- | --------------------- | ----------------------------------------------- |
| `path`      | `string`              | 相对 `basePath` 的子路径；`''` 表示模式默认首页 |
| `title`     | `string`              | 页面标题（用于后续标签栏/文档标题）             |
| `Component` | `React.ComponentType` | 占位页面组件，位于 `pages/<mode>/`              |

### `MenuGroup` — 侧边栏菜单组（spec 实体：侧边栏菜单组）

| 字段            | 类型             | 约束                                                          |
| --------------- | ---------------- | ------------------------------------------------------------- |
| `id`            | `string`         | 模式内唯一                                                    |
| `title`         | `string \| null` | 分组标题（如"任务列表"）；无标题的置顶操作组传 null           |
| `headerActions` | `MenuAction[]`   | 分组标题右侧操作图标（可为空数组，如任务列表的收起/筛选占位） |
| `items`         | `MenuItem[]`     | 菜单项列表，可为空数组（占位分组）                            |

### `MenuItem` / `MenuAction`

| 字段               | 类型             | 约束                                              |
| ------------------ | ---------------- | ------------------------------------------------- |
| `MenuItem.id`      | `string`         | 组内唯一                                          |
| `MenuItem.label`   | `string`         | 菜单文案（新建任务/插件市场/自动化/模板库…）      |
| `MenuItem.icon`    | `LucideIcon`     | 必有图标（折叠窄栏态仅显示图标，FR-013）          |
| `MenuItem.path`    | `string \| null` | 目标路由；占位项为 null（点击仅视觉反馈，FR-021） |
| `MenuAction.icon`  | `LucideIcon`     | 分组头部操作图标                                  |
| `MenuAction.label` | `string`         | 无障碍名/tooltip 文案                             |

## 2. 外壳 UI 状态（运行时状态，Zustand Store）

### `ShellUIState` — spec 实体：外壳 UI 状态

| 字段               | 类型      | 初值     | 持久化          | 说明                                    |
| ------------------ | --------- | -------- | --------------- | --------------------------------------- |
| `sidebarCollapsed` | `boolean` | `false`  | ✅ localStorage | 侧边栏折叠态（FR-011/012）              |
| `lastMode`         | `ModeId`  | `'work'` | ✅ localStorage | 最近使用模式，启动重定向用（FR-008）    |
| `searchOpen`       | `boolean` | `false`  | ❌ 瞬态         | 搜索面板开关（FR-017）                  |
| `windowMaximized`  | `boolean` | `false`  | ❌ 瞬态         | 镜像主进程窗口状态，驱动最大化/还原图标 |

**Actions**: `toggleSidebar()` / `setSearchOpen(open: boolean)` / `setLastMode(mode: ModeId)` / `setWindowMaximized(maximized: boolean)`

### 状态流转

```text
sidebarCollapsed:  expanded ⇄ collapsed        （TitleBar 折叠钮触发，persist 写回）
lastMode:          work/code/design            （路由进入某模式路由组时同步写入）
searchOpen:        closed → open → closed      （搜索图标打开；Esc/遮罩/任意导航动作关闭，spec Edge Case）
windowMaximized:   normal ⇄ maximized          （window:maximized-changed 事件驱动，非用户直接可改）
```

**不变式**：

- 当前模式不从 Store 读取——以路由 URL 为唯一事实源；Store 的 `lastMode` 只是"上次"的副本，二者不得相互推导（避免双事实源）
- 折叠态切换不得引起内容区布局跳变：仅 `Sidebar` 宽度参与过渡，内容区 `flex-1` 自适应

## 3. 用户信息（占位数据，spec 实体：User Profile）

### `PlaceholderUser`

| 字段               | 类型                        | 约束                                              |
| ------------------ | --------------------------- | ------------------------------------------------- |
| `displayName`      | `string`                    | 静态占位（如 `LLinzex`）                          |
| `avatarUrl`        | `string \| null`            | 可为 null → 渲染首字符 fallback（spec Edge Case） |
| `plan`             | `'free' \| 'pro' \| 'team'` | 徽章文案映射：免费/Pro/团队                       |
| `mobileEntryLabel` | `string`                    | 次级入口文案（如"移动端"）                        |

本期硬编码于 `UserPanel` 模块级常量；Phase 后续接入真实账号时迁移至 Store/主进程。

## 4. 校验规则汇总

| 规则                                   | 来源              | 强制点                                                            |
| -------------------------------------- | ----------------- | ----------------------------------------------------------------- |
| `ModeId` 全局唯一、`basePath` 全局唯一 | FR-005/006        | TypeScript 联合类型 + 注册表 `as const` 编译期检查                |
| 每个模式恰有 1 条 `path: ''` 默认首页  | FR-019            | 注册表定义处人工保证 + 运行时 `router.tsx` 断言（dev 环境 throw） |
| 无效路由回退                           | FR-009            | 路由表末尾 `*` → `<Navigate>` 回退当前/默认模式首页               |
| `MenuItem.icon` 必填                   | FR-013 折叠态可用 | 类型为非可选字段，编译期强制                                      |
