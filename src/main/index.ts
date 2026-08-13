import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// 解决 Windows 控制台中文乱码（UTF-8 字节被 GBK 错解）
// 原理：stdout 默认编码设为 utf-8，确保 Node.js 输出到终端的字节流是 UTF-8
if (process.platform === 'win32') {
  try {
    process.stdout.setDefaultEncoding('utf-8')
  } catch {
    // 忽略失败
  }
}

import { registerAllIPC } from './ipc'
import { driverManager } from './db/core/DriverManager'
import { taskScheduler } from './scheduler'

let tray: Tray | null = null

function createTray(mainWindow: BrowserWindow): void {
  const trayIcon = nativeImage
    .createFromPath(join(__dirname, '../../resources/icon.png'))
    .resize({ width: 16, height: 16 })

  tray = new Tray(trayIcon)
  tray.setToolTip('Nexus Studio')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: (): void => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: (): void => {
        if (taskScheduler.hasRunningTasks()) {
          mainWindow.show()
          mainWindow.webContents.send('task:confirm-close')
        } else {
          app.quit()
        }
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // 左键单击托盘图标：显示主窗口
  tray.on('click', () => {
    mainWindow.show()
    mainWindow.focus()
  })
}

function createWindow(): BrowserWindow {
  // 无边框窗口：自定义标题栏（顶栏拖拽区 + 窗口控制按钮在渲染进程实现）
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    // backgroundColor: '#fafafa',
    frame: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 禁用沙箱模式，允许预加载脚本直接访问渲染进程的 DOM （因为electron官方工具包在 preload 中通过 createInvoke 注册大量 IPC 通道，一般会关闭沙箱模式）
      sandbox: false,
      // 隔离预加载脚本与渲染进程，防止预加载脚本直接访问渲染进程的 DOM
      contextIsolation: true,
      // 页面不能直接使用node
      nodeIntegration: false
    }
  })

  // 注册所有 IPC 处理器（窗口控制 + 数据库 + 配置 + 任务调度）
  registerAllIPC(mainWindow)

  // 启动定时任务调度器（恢复已启用任务 + 补偿执行）
  taskScheduler.bootstrap()

  // 关闭窗口时：隐藏到托盘而非退出
  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow.hide()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file in production.
  // 仅以 ELECTRON_RENDERER_URL 判断（本机环境 app.isPackaged 异常返回 true，见调试记录）
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  const mainWindow = BrowserWindow.getAllWindows()[0]
  createTray(mainWindow)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 应用退出前优雅关闭所有数据库连接和定时任务调度
app.on('before-quit', async (event) => {
  event.preventDefault()
  await taskScheduler.shutdown()
  await driverManager.disconnectAll()
  app.quit()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
