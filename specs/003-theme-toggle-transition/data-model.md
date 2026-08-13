# Data Model: 亮暗模式切换与丝滑过渡动画

**Feature**: `003-theme-toggle-transition` | **Date**: 2026-08-10

本特性不涉及数据库表或跨进程持久化实体，唯一的数据实体是 spec.md 中定义的"主题偏好设置"，
在渲染进程内以 Zustand store 状态的形式存在，并整体持久化到 `localStorage`。

## 实体：主题偏好设置（ThemePreference）

| 字段   | 类型                | 说明               | 校验规则                                                                    |
| ------ | ------------------- | ------------------ | --------------------------------------------------------------------------- |
| `mode` | `'light' \| 'dark'` | 当前生效的主题模式 | 仅允许这两个字面量值；无第三态（如"跟随系统"），对齐 spec.md 的 Assumptions |

### 默认值与初始化

- 首次安装、`localStorage` 中不存在该 store 的持久化记录时，默认值为 `mode: 'light'`，与应用现状保持一致（spec.md Assumptions）。
- 后续每次应用启动，直接从 `localStorage` 同步恢复上次的 `mode`，无需等待任何异步 IPC 往返（对应 research.md §1 的存储决策，规避 FOUC）。

### 状态转换

```text
light --(用户点击切换图标)--> dark
dark  --(用户点击切换图标)--> light
```

- 仅有一个允许的转换动作：`toggle()`，在两个枚举值之间互相切换，不存在第三个状态或额外的中间态。
- 每次转换需要伴随的瞬态（非持久化）数据：触发点击时的视口坐标 `(x, y)`，仅用于驱动本次动画播放，不写入 store、不持久化（属于 `ThemeToggleButton` 组件内部的局部状态/参数，不是本实体的字段）。
- 动画播放期间存在一个瞬态守卫标志（`isAnimating`），同样不属于本实体、不持久化，仅用于满足 FR-008 的防抖要求。

### 与现有实体的关系

- 与 `shellStore.ts` 中的 `sidebarCollapsed`/`lastMode` 属于同一类"渲染进程本地 UI 偏好"，但主题偏好使用独立的 `themeStore`（`persist` 的 `name: 'theme-store'`），不与 `shellStore` 共用同一个 localStorage key，避免两者持久化字段耦合。
- 不与任何数据库连接配置、Schema/Table 元数据产生关联；是纯粹的界面级设置。
