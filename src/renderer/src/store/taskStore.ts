/**
 * 定时任务前端状态管理
 *
 * 管理任务列表、UI 状态（选中/编辑/新建），
 * 任务数据通过 IPC 从主进程获取。
 */
import { create } from 'zustand'
import type {
  ScheduledTask,
  CreateTaskPayload,
  UpdateTaskPayload,
  TaskRunLog,
  TaskStatusChangePayload
} from '@/types/task'

interface TaskStoreState {
  /** 任务列表 */
  tasks: ScheduledTask[]
  /** 加载中 */
  loading: boolean
  /** 当前选中的任务 ID */
  selectedTaskId: string | null
  /** 正在编辑的任务 ID */
  editingTaskId: string | null
  /** 是否处于新建模式 */
  isCreating: boolean

  /* ─── 数据操作 ─── */
  /** 从主进程加载任务列表 */
  fetchTasks: () => Promise<void>
  /** 创建任务 */
  createTask: (payload: CreateTaskPayload) => Promise<void>
  /** 更新任务 */
  updateTask: (payload: UpdateTaskPayload) => Promise<void>
  /** 删除任务 */
  deleteTask: (id: string) => Promise<void>
  /** 立即执行任务 */
  runNow: (taskId: string) => Promise<void>
  /** 获取任务日志 */
  getLogs: (taskId: string) => Promise<TaskRunLog[]>

  /* ─── UI 状态 ─── */
  selectTask: (id: string | null) => void
  startEditing: (id: string) => void
  startCreating: () => void
  cancelEditing: () => void
  /** 处理主进程推送的状态变更 */
  handleStatusChange: (payload: TaskStatusChangePayload) => void
}

export const useTaskStore = create<TaskStoreState>()((set) => ({
  tasks: [],
  loading: false,
  selectedTaskId: null,
  editingTaskId: null,
  isCreating: false,

  fetchTasks: async () => {
    set({ loading: true })
    try {
      const tasks = await window.api.task.list()
      set({ tasks, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createTask: async (payload) => {
    const task = await window.api.task.create(payload)
    set((state) => ({
      tasks: [...state.tasks, task],
      isCreating: false,
      editingTaskId: null,
      selectedTaskId: task.id
    }))
  },

  updateTask: async (payload) => {
    const task = await window.api.task.update(payload)
    if (!task) return
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
      editingTaskId: null
    }))
  },

  deleteTask: async (id) => {
    const ok = await window.api.task.delete(id)
    if (!ok) return
    set((state) => {
      const nextTasks = state.tasks.filter((t) => t.id !== id)
      const nextSelected =
        state.selectedTaskId === id ? (nextTasks[0]?.id ?? null) : state.selectedTaskId
      return {
        tasks: nextTasks,
        selectedTaskId: nextSelected,
        editingTaskId: state.editingTaskId === id ? null : state.editingTaskId
      }
    })
  },

  runNow: async (taskId) => {
    await window.api.task.runNow(taskId)
  },

  getLogs: async (taskId) => {
    return window.api.task.getLogs(taskId)
  },

  selectTask: (id) => {
    set({ selectedTaskId: id })
  },

  startEditing: (id) => {
    set({ editingTaskId: id, isCreating: false })
  },

  startCreating: () => {
    set({ isCreating: true, editingTaskId: null, selectedTaskId: null })
  },

  cancelEditing: () => {
    set({ editingTaskId: null, isCreating: false })
  },

  handleStatusChange: (payload) => {
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== payload.taskId) return t
        return {
          ...t,
          lastRunStatus: payload.status,
          lastRunAt: payload.runLog?.finishedAt ?? t.lastRunAt,
          runLogs: payload.runLog
            ? [...t.runLogs, payload.runLog].slice(-t.maxLogRetention)
            : t.runLogs
        }
      })
    }))
  }
}))
