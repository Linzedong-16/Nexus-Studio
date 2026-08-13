/**
 * 任务编辑器
 *
 * 支持新建和编辑两种模式，根据模板类型动态展示不同参数字段。
 */
import { useState } from 'react'
import { Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTaskStore } from '@/store/taskStore'
import type {
  ScriptTemplateId,
  CreateTaskPayload,
  UpdateTaskPayload,
  SqlExecuteParams,
  DataExportCsvParams,
  DataExportJsonParams,
  PgDumpParams
} from '@/types/task'

const TEMPLATES: { id: ScriptTemplateId; label: string }[] = [
  { id: 'sql-execute', label: 'SQL 执行' },
  { id: 'data-export-csv', label: '导出 CSV' },
  { id: 'data-export-json', label: '导出 JSON' },
  { id: 'pg-dump', label: 'pg_dump 备份' }
]

export function TaskEditor(): React.JSX.Element {
  const tasks = useTaskStore((s) => s.tasks)
  const editingTaskId = useTaskStore((s) => s.editingTaskId)
  const isCreating = useTaskStore((s) => s.isCreating)
  const createTask = useTaskStore((s) => s.createTask)
  const updateTask = useTaskStore((s) => s.updateTask)
  const cancelEditing = useTaskStore((s) => s.cancelEditing)

  const existingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) : null

  const initParams = existingTask?.params as unknown as Record<string, unknown> | undefined

  const [name, setName] = useState(existingTask?.name ?? '')
  const [template, setTemplate] = useState<ScriptTemplateId>(
    existingTask?.template ?? 'sql-execute'
  )
  const [cronExpression, setCronExpression] = useState(existingTask?.cronExpression ?? '0 0 * * *')
  const [enabled, setEnabled] = useState(existingTask?.enabled ?? true)
  const [notifyOn, setNotifyOn] = useState<'success' | 'failure' | 'both'>(
    existingTask?.notifyOn ?? 'both'
  )
  const [failureThreshold, setFailureThreshold] = useState(
    existingTask?.alertEscalation?.failureThreshold ?? 3
  )
  const [escalationEnabled, setEscalationEnabled] = useState(
    existingTask?.alertEscalation?.enabled ?? true
  )
  const [maxLogRetention, setMaxLogRetention] = useState(existingTask?.maxLogRetention ?? 50)

  // 模板参数
  const [connectionId, setConnectionId] = useState((initParams?.connectionId as string) ?? '')
  const [database, setDatabase] = useState((initParams?.database as string) ?? '')
  const [sql, setSql] = useState((initParams?.sql as string) ?? '')
  const [execRole, setExecRole] = useState((initParams?.execRole as string) ?? '')
  const [exportDir, setExportDir] = useState((initParams?.exportDir as string) ?? '')
  const [pgDumpPath, setPgDumpPath] = useState((initParams?.pgDumpPath as string) ?? '')

  const buildParams = (): CreateTaskPayload['params'] => {
    switch (template) {
      case 'sql-execute':
        return { connectionId, database, sql, execRole: execRole || undefined } as SqlExecuteParams
      case 'data-export-csv':
        return {
          connectionId,
          database,
          sql,
          exportDir,
          execRole: execRole || undefined
        } as DataExportCsvParams
      case 'data-export-json':
        return {
          connectionId,
          database,
          sql,
          exportDir,
          execRole: execRole || undefined
        } as DataExportJsonParams
      case 'pg-dump':
        return {
          connectionId,
          database,
          exportDir,
          pgDumpPath: pgDumpPath || undefined
        } as PgDumpParams
    }
  }

  const handleSave = async (): Promise<void> => {
    if (isCreating) {
      const payload: CreateTaskPayload = {
        name: name || '未命名任务',
        template,
        params: buildParams(),
        cronExpression: cronExpression || '0 0 * * *',
        enabled,
        notifyOn,
        alertEscalation: { failureThreshold, enabled: escalationEnabled },
        maxLogRetention
      }
      await createTask(payload)
    } else if (editingTaskId) {
      const payload: UpdateTaskPayload = {
        id: editingTaskId,
        name: name || '未命名任务',
        template,
        params: buildParams(),
        cronExpression: cronExpression || '0 0 * * *',
        enabled,
        notifyOn,
        alertEscalation: { failureThreshold, enabled: escalationEnabled },
        maxLogRetention
      }
      await updateTask(payload)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-medium">{isCreating ? '新建任务' : '编辑任务'}</h2>
        <Button variant="ghost" size="icon" className="size-7" onClick={cancelEditing}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 任务名称 */}
        <div className="space-y-1.5">
          <Label className="text-xs">任务名称</Label>
          <Input
            className="h-8 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：每日数据备份"
          />
        </div>

        {/* 模板类型 */}
        <div className="space-y-1.5">
          <Label className="text-xs">脚本模板</Label>
          <Select value={template} onValueChange={(v) => setTemplate(v as ScriptTemplateId)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cron 表达式 */}
        <div className="space-y-1.5">
          <Label className="text-xs">Cron 表达式</Label>
          <Input
            className="h-8 font-mono text-sm"
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            placeholder="0 0 * * *"
          />
          <p className="text-[10px] text-muted-foreground">
            分 时 日 月 周，例如 0 0 * * * 表示每天零点
          </p>
        </div>

        {/* 连接 ID + 数据库 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">连接 ID</Label>
            <Input
              className="h-8 text-sm"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              placeholder="粘贴连接 ID"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">数据库</Label>
            <Input
              className="h-8 text-sm"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder="例如 postgres"
            />
          </div>
        </div>

        {/* SQL（仅 SQL 执行和导出模板需要） */}
        {template !== 'pg-dump' && (
          <div className="space-y-1.5">
            <Label className="text-xs">SQL 语句</Label>
            <Textarea
              className="min-h-24 font-mono text-sm"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder="SELECT * FROM ..."
            />
          </div>
        )}

        {/* 执行角色 */}
        {template !== 'pg-dump' && (
          <div className="space-y-1.5">
            <Label className="text-xs">执行角色（可选，SET ROLE）</Label>
            <Input
              className="h-8 text-sm"
              value={execRole}
              onChange={(e) => setExecRole(e.target.value)}
              placeholder="例如 readonly_role"
            />
          </div>
        )}

        {/* 导出目录 */}
        {(template === 'data-export-csv' ||
          template === 'data-export-json' ||
          template === 'pg-dump') && (
          <div className="space-y-1.5">
            <Label className="text-xs">导出目录（绝对路径）</Label>
            <Input
              className="h-8 text-sm"
              value={exportDir}
              onChange={(e) => setExportDir(e.target.value)}
              placeholder="例如 C:\backups"
            />
          </div>
        )}

        {/* pg_dump 路径 */}
        {template === 'pg-dump' && (
          <div className="space-y-1.5">
            <Label className="text-xs">pg_dump 路径（可选，为空则自动探测 PATH）</Label>
            <Input
              className="h-8 text-sm"
              value={pgDumpPath}
              onChange={(e) => setPgDumpPath(e.target.value)}
              placeholder="例如 C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
            />
          </div>
        )}

        {/* 通知策略 */}
        <div className="space-y-1.5">
          <Label className="text-xs">通知策略</Label>
          <Select
            value={notifyOn}
            onValueChange={(v) => setNotifyOn(v as 'success' | 'failure' | 'both')}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">成功和失败都通知</SelectItem>
              <SelectItem value="success">仅成功时通知</SelectItem>
              <SelectItem value="failure">仅失败时通知</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 告警升级 */}
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">连续失败告警升级</Label>
            <Switch checked={escalationEnabled} onCheckedChange={setEscalationEnabled} />
          </div>
          {escalationEnabled && (
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">连续失败</Label>
              <Input
                className="h-8 w-16 text-sm"
                type="number"
                min={1}
                value={failureThreshold}
                onChange={(e) => setFailureThreshold(Number(e.target.value) || 1)}
              />
              <span className="text-xs text-muted-foreground">次后触发告警升级</span>
            </div>
          )}
        </div>

        {/* 日志保留 */}
        <div className="space-y-1.5">
          <Label className="text-xs">最多保留日志条数</Label>
          <Input
            className="h-8 w-24 text-sm"
            type="number"
            min={1}
            max={500}
            value={maxLogRetention}
            onChange={(e) => setMaxLogRetention(Number(e.target.value) || 50)}
          />
        </div>

        {/* 启用开关 */}
        <div className="flex items-center justify-between">
          <Label className="text-xs">启用任务</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2">
        <Button variant="ghost" size="sm" onClick={cancelEditing}>
          取消
        </Button>
        <Button size="sm" onClick={handleSave}>
          <Save className="size-3.5" />
          保存
        </Button>
      </div>
    </div>
  )
}
