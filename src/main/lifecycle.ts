/**
 * 应用退出状态标志
 *
 * close-to-tray 场景下窗口关闭默认被拦截（隐藏而非退出），
 * 只有明确调用 markQuitting() 后才允许窗口真正关闭、应用真正退出。
 * electron-updater 的 quitAndInstall() 同样需要先标记此状态才能生效——
 * 否则窗口只会被隐藏，达不到它期望的"窗口已关闭"状态，安装程序不会启动。
 */
let quitting = false

export function isQuitting(): boolean {
  return quitting
}

export function markQuitting(): void {
  quitting = true
}
