import { useEffect, useState } from 'react'
import {
  Bot,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  PlugZap,
  RotateCcw,
  Save,
  AlertCircle
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { DEEPSEEK_MODEL_OPTIONS } from '@/types/agent'
import type { ModelProviderTestResult } from '@/types/ipc'
import { configService } from '@/services/configService'
import { agentService } from '@/services/agentService'

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEEPSEEK_API_KEY_URL = 'https://platform.deepseek.com/api_keys'

/**
 * "模型配置"设置页（当前仅 DeepSeek 一项）
 *
 * 保存后仅写入本机加密存储（configStore.deepseekConfig），下一次对话请求立即生效，无需重启应用。
 */
export default function ModelProviderTab(): React.JSX.Element {
  const [baseURL, setBaseURL] = useState(DEFAULT_BASE_URL)
  const [model, setModel] = useState<string>(DEEPSEEK_MODEL_OPTIONS[0])
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(true)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ModelProviderTestResult | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let mounted = true
    void configService.getModelProviderConfig().then((value) => {
      if (!mounted) return
      setBaseURL(value.baseURL)
      setModel(value.model)
      setApiKey(value.apiKey)
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [])

  const handleTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await agentService.testModelProvider({ baseURL, apiKey })
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
    setSaved(false)
    try {
      await configService.saveModelProviderConfig({ baseURL, model, apiKey })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">加载中…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <Bot className="size-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium">DeepSeek</h3>
          <p className="text-sm text-muted-foreground">配置 DeepSeek 的请求地址与 API Key</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              'size-1.5 rounded-full',
              apiKey ? 'bg-emerald-500' : 'bg-muted-foreground/40'
            )}
          />
          {apiKey ? '已配置' : '未配置'}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>API Key</Label>
            <a
              href={DEEPSEEK_API_KEY_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              获取 API Key
              <ExternalLink className="size-3" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setTestResult(null)
                }}
                placeholder="sk-..."
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
            <Button
              variant="outline"
              onClick={() => void handleTest()}
              disabled={testing || !apiKey}
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PlugZap className="size-4" />
              )}
              测试连接
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>请求地址</Label>
          <div className="flex items-center gap-2">
            <Input
              value={baseURL}
              onChange={(e) => {
                setBaseURL(e.target.value)
                setTestResult(null)
              }}
              placeholder={DEFAULT_BASE_URL}
              className="flex-1"
            />
            <Button variant="ghost" onClick={() => setBaseURL(DEFAULT_BASE_URL)}>
              <RotateCcw className="size-3.5" />
              恢复默认
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>模型</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              {DEEPSEEK_MODEL_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {testResult && (
          <Badge variant={testResult.success ? 'default' : 'destructive'} className="mt-2">
            {testResult.success
              ? `连接成功 · ${testResult.latencyMs ?? '-'}ms`
              : `连接失败：${testResult.message}`}
          </Badge>
        )}

        {saveError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="text-destructive">{saveError}</span>
          </div>
        )}

        <div className="mt-6 flex items-center gap-2 border-t pt-4">
          <div className="flex-1" />
          {saved && <span className="text-sm text-muted-foreground">已保存</span>}
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}
