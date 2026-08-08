import { createHashRouter, Navigate, type RouteObject } from 'react-router'
import { MODES } from '@/config/modes'
import AppShell from '@/components/layout/AppShell'
import IndexRedirect from './IndexRedirect'

/**
 * 路由表由模式注册表编程生成（contracts/shell-config.md 路由生成约定）
 * - HashRouter：Electron 生产环境 file:// 协议下可直达（research.md R-001）
 * - 回退链：模式内无效页 → 模式首页；无效模式 → / → lastMode 首页（FR-009）
 */

/** dev 环境注册表断言：每模式恰一条默认首页，basePath 全局唯一（data-model.md §4） */
function assertModesValid(): void {
  const basePaths = new Set<string>()
  for (const mode of MODES) {
    if (basePaths.has(mode.basePath)) {
      throw new Error(`[modes] basePath 重复: ${mode.basePath}`)
    }
    basePaths.add(mode.basePath)
    const homeCount = mode.routes.filter((r) => r.path === '').length
    if (homeCount !== 1) {
      throw new Error(`[modes] 模式 ${mode.id} 必须有且仅有一条 path: '' 的默认首页`)
    }
  }
}

if (import.meta.env.DEV) {
  assertModesValid()
}

/** 根路径重定向组件位于 ./IndexRedirect（react-refresh 规范：本文件仅导出路由表） */

const modeRoutes: RouteObject[] = MODES.map((mode) => ({
  path: mode.basePath.slice(1),
  children: [
    ...mode.routes.map((route): RouteObject => {
      const element = <route.Component />
      return route.path === '' ? { index: true, element } : { path: route.path, element }
    }),
    // 模式内无效子页面 → 回退该模式默认首页
    { path: '*', element: <Navigate to={mode.basePath} replace /> }
  ]
}))

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [{ index: true, element: <IndexRedirect /> }, ...modeRoutes]
  },
  // 顶层无效地址 → 经 / 回退到最近/默认模式首页
  { path: '*', element: <Navigate to="/" replace /> }
])
