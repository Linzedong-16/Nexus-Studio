# Contract: 窗口控制 IPC（window:*）

**模块**: `main/ipc/window.ts`（处理器）· `preload/index.ts`（桥接）· 渲染进程 `WindowControls` 组件（消费方）
**契约规则**: 宪法 V —— 通道名 `模块:操作`；双向 `invoke/handle`；单向通知 `send/on`；主进程不返回 UI 逻辑。

## 通道定义

### `window:minimize` — invoke/handle

- **Request**: 无参数
- **Returns**: `Promise<void>`
- **行为**: 最小化当前窗口

### `window:toggle-maximize` — invoke/handle

- **Request**: 无参数
- **Returns**: `Promise<boolean>` — 操作后的最大化状态（`true` = 已最大化）
- **行为**: 已最大化则还原，否则最大化；以主进程 `BrowserWindow.isMaximized()` 为准

### `window:close` — invoke/handle

- **Request**: 无参数
- **Returns**: `Promise<void>`
- **行为**: 关闭当前窗口（触发应用退出流程）

### `window:is-maximized` — invoke/handle

- **Request**: 无参数
- **Returns**: `Promise<boolean>`
- **行为**: 查询当前最大化状态（渲染进程启动时初始化 `windowMaximized`）

### `window:maximized-changed` — send/on（主 → 渲染，单向通知）

- **Payload**: `boolean` — 新的最大化状态
- **触发**: 主进程监听 `BrowserWindow` 的 `maximize` / `unmaximize` 事件后广播
- **用途**: 同步系统级最大化操作（双击标题栏、系统快捷键）到渲染进程图标状态

## Preload 桥接 API（`window.api`）

```typescript
// preload/index.d.ts —— Window.api 的对外类型（替代脚手架的 unknown）
interface WindowControlsApi {
  minimize(): Promise<void>
  toggleMaximize(): Promise<boolean>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  /** 订阅最大化状态变化；返回取消订阅函数 */
  onMaximizedChange(callback: (maximized: boolean) => void): () => void
}

interface Api {
  windowControls: WindowControlsApi
}

interface Window {
  electron: ElectronAPI // @electron-toolkit/preload（既有）
  api: Api
}
```

## 约束

- 预加载脚本**只暴露上述封装方法**，禁止透出原始 `ipcRenderer`（宪法 I）
- 错误处理：主进程处理器异常经 `throw` 透传，渲染进程在调用处捕获（本期窗口控制失败静默降级为 console.error，不弹窗）
- 所有窗口操作定向到事件发送方所在窗口（`BrowserWindow.fromWebContents(event.sender)`），禁止操作其他窗口
