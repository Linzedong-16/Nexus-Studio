import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Database, Loader2, PlugZap, Save, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { ConnectionConfig, TestResult } from '@/types/ipc'
import type { ConnectionTabState, WorkspaceTab } from '@/types/workspace'
import { configService } from '@/services/configService'
import { queryService } from '@/services/queryService'
import { useConnectionStore } from '@/store/connectionStore'
import { useWorkspaceStore } from '@/store/workspaceStore'

interface ConnectionFormProps {
  tab: WorkspaceTab
}

/**
 * 数据库连接表单
 *
 * 支持：测试连接、保存、保存并连接。
 * 保存的配置通过 configService 持久化，连接通过 queryService 建立，
 * 成功后写入 connectionStore 供 Schema 树使用。
 */
export default function ConnectionForm({ tab }: ConnectionFormProps): React.JSX.Element {
  const state = tab.state as ConnectionTabState | undefined
  const [config, setConfig] = useState<ConnectionConfig>(
    state?.draft ?? {
      id: uuidv4(),
      name: '',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: '',
      username: 'postgres',
      password: 'root'
    }
  )
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)

  const setConnected = useConnectionStore((s) => s.setConnected)
  const setConnectingStatus = useConnectionStore((s) => s.setConnecting)
  const setError = useConnectionStore((s) => s.setError)
  const closeTab = useWorkspaceStore((s) => s.closeTab)
  const loadDatabases = useConnectionStore((s) => s.loadDatabases)

  const update = <K extends keyof ConnectionConfig>(key: K, value: ConnectionConfig[K]): void => {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setTestResult(null)
  }

  const handleTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await queryService.testConnection(config)
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : '测试失败'
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setSaveError(null)
    try {
      await configService.saveConnection(config)
      closeTab(tab.id)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndConnect = async (): Promise<void> => {
    setConnecting(true)
    setConnectError(null)
    try {
      await configService.saveConnection(config)
      setConnectingStatus(config)
      const result = await queryService.connect(config)
      if (result.success) {
        setConnected(config, result)
        closeTab(tab.id)
        await loadDatabases(config.id)
      } else {
        const msg = result.message
        setError(config.id, msg)
        setConnectError(msg)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '连接失败'
      setError(config.id, msg)
      setConnectError(msg)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <Database className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-medium">新建数据库连接</h3>
          <p className="text-sm text-muted-foreground">
            配置 PostgreSQL 服务器级连接，连接后可浏览该账号有权限访问的全部数据库
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>连接名称</Label>
            <Input
              value={config.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="例如：本地开发库"
            />
          </div>

          <div className="space-y-1.5">
            <Label>数据库类型</Label>
            <Select
              value={config.type}
              onValueChange={(v) => update('type', v as ConnectionConfig['type'])}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择数据库类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="postgresql">PostgreSQL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>主机地址</Label>
            <Input
              value={config.host}
              onChange={(e) => update('host', e.target.value)}
              placeholder="localhost"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>端口</Label>
              <Input
                type="number"
                value={config.port}
                onChange={(e) => update('port', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>数据库（可选）</Label>
              <Input
                value={config.database ?? ''}
                onChange={(e) => update('database', e.target.value)}
                placeholder="留空则连接后浏览全部数据库"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>用户名</Label>
            <Input
              value={config.username}
              onChange={(e) => update('username', e.target.value)}
              placeholder="postgres"
            />
          </div>

          <div className="space-y-1.5">
            <Label>密码</Label>
            <Input
              type="password"
              value={config.password}
              onChange={(e) => update('password', e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>

        {testResult && (
          <Badge variant={testResult.success ? 'default' : 'destructive'} className="mt-2">
            {testResult.success
              ? `连接成功 · ${testResult.latencyMs ?? '-'}ms${testResult.serverVersion ? ` · ${testResult.serverVersion}` : ''}`
              : `连接失败：${testResult.message}`}
          </Badge>
        )}

        {saveError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="text-destructive">{saveError}</span>
          </div>
        )}
        {connectError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="text-destructive">{connectError}</span>
          </div>
        )}

        <div className="mt-6 flex items-center gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleTest} disabled={testing || connecting}>
            {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
            测试连接
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={handleSave} disabled={saving || connecting}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            仅保存
          </Button>
          <Button onClick={handleSaveAndConnect} disabled={connecting || testing}>
            {connecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlugZap className="size-4" />
            )}
            保存并连接
          </Button>
        </div>
      </div>
    </div>
  )
}
