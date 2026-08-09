import {
  Blocks,
  CirclePlus,
  CodeXml,
  Folder,
  LayoutTemplate,
  ListCollapse,
  ListFilter,
  Timer
} from 'lucide-react'
import type { MenuGroup, ModeConfig } from '@/types/shell'
import { useWorkspaceStore } from '@/store/workspaceStore'
import WorkHomePage from '@/pages/work/WorkHomePage'
import CodeHomePage from '@/pages/code/CodeHomePage'
import DesignHomePage from '@/pages/design/DesignHomePage'

/**
 * 模式注册表 —— 外壳的唯一配置源（contracts/shell-config.md）
 * 新增模式/页面/菜单 = 在此登记，外壳组件零改动（FR-010/FR-023）
 * 本期三模式菜单组同构（spec Assumptions），复刻 TRAE 截图结构
 */

/** Work 模式专用菜单组（差异化：新建连接打开工作区标签页） */
function buildWorkMenuGroups(): MenuGroup[] {
  return [
    {
      id: 'actions',
      title: null,
      headerActions: [],
      items: [
        {
          id: 'new-task',
          label: '新建连接',
          icon: CirclePlus,
          path: null,
          onClick: () => useWorkspaceStore.getState().addConnectionTab()
        },
        { id: 'plugins', label: '插件市场', icon: Blocks, path: null },
        { id: 'automation', label: '自动化', icon: Timer, path: null },
        { id: 'templates', label: '模板库', icon: LayoutTemplate, path: null }
      ]
    },
    {
      id: 'task-list',
      title: '连接管理',
      headerActions: [
        { icon: ListCollapse, label: '收起全部' },
        { icon: ListFilter, label: '筛选' }
      ],
      items: [{ id: 'sample-project', label: '示例项目', icon: Folder, path: null }]
    }
  ]
}

/** 本期 Code/Design 模式共用的占位菜单组 */
function buildPlaceholderMenuGroups(): MenuGroup[] {
  return [
    {
      id: 'actions',
      title: null,
      headerActions: [],
      items: [
        { id: 'new-task', label: '新建连接', icon: CirclePlus, path: null },
        { id: 'plugins', label: '插件市场', icon: Blocks, path: null },
        { id: 'automation', label: '自动化', icon: Timer, path: null },
        { id: 'templates', label: '模板库', icon: LayoutTemplate, path: null }
      ]
    },
    {
      id: 'task-list',
      title: '任务列表',
      headerActions: [
        { icon: ListCollapse, label: '收起全部' },
        { icon: ListFilter, label: '筛选' }
      ],
      items: [{ id: 'sample-project', label: '示例项目', icon: Folder, path: null }]
    }
  ]
}

export const MODES: readonly ModeConfig[] = [
  {
    id: 'work',
    label: 'Work',
    icon: null,
    basePath: '/work',
    routes: [{ path: '', title: 'Work', Component: WorkHomePage }],
    menuGroups: buildWorkMenuGroups()
  },
  {
    id: 'code',
    label: 'Code',
    icon: CodeXml,
    basePath: '/code',
    routes: [{ path: '', title: 'Code', Component: CodeHomePage }],
    menuGroups: buildPlaceholderMenuGroups()
  },
  {
    id: 'design',
    label: 'Design',
    icon: null,
    basePath: '/design',
    routes: [{ path: '', title: 'Design', Component: DesignHomePage }],
    menuGroups: buildPlaceholderMenuGroups()
  }
]

/** 由当前路径推导所属模式（URL 为模式唯一事实源） */
export function resolveModeByPath(pathname: string): ModeConfig {
  return MODES.find((m) => pathname.startsWith(m.basePath)) ?? MODES[0]
}
