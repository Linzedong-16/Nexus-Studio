import { useState } from 'react'
import { HardDrive, FolderOpen, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { queryService } from '@/services/queryService'
import { fsService } from '@/services/fsService'

interface BackupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  connectionName: string
  database: string
}

export default function BackupDialog({
  open,
  onOpenChange,
  connectionId,
  connectionName,
  database
}: BackupDialogProps): React.JSX.Element {
  const [exportDir, setExportDir] = useState('')
  const [pgDumpPath, setPgDumpPath] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ success: boolean; filePath: string; error?: string } | null>(
    null
  )

  const handlePickDir = async (): Promise<void> => {
    const dir = await fsService.pickFolder()
    if (dir) setExportDir(dir)
  }

  const handleBackup = async (): Promise<void> => {
    if (!exportDir) return
    setRunning(true)
    setResult(null)
    try {
      const res = await queryService.backupDatabase(
        connectionId,
        database,
        exportDir,
        pgDumpPath || undefined
      )
      setResult(res)
    } catch (err) {
      setResult({
        success: false,
        filePath: '',
        error: err instanceof Error ? err.message : '备份失败'
      })
    } finally {
      setRunning(false)
    }
  }

  const handleClose = (): void => {
    if (!running) {
      setExportDir('')
      setPgDumpPath('')
      setResult(null)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="size-4" />
            数据库备份
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>数据库</Label>
            <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {connectionName} / {database}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>导出目录</Label>
            <div className="flex gap-2">
              <Input
                value={exportDir}
                onChange={(e) => setExportDir(e.target.value)}
                placeholder="选择导出目录"
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={handlePickDir} disabled={running}>
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              pg_dump 路径
              <span className="ml-1 text-xs text-muted-foreground">（可选，留空自动探测 PATH）</span>
            </Label>
            <Input
              value={pgDumpPath}
              onChange={(e) => setPgDumpPath(e.target.value)}
              placeholder="例：C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
              disabled={running}
            />
          </div>

          {result && (
            <div
              className={`rounded-md border p-3 text-sm ${
                result.success
                  ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
                  : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
              }`}
            >
              {result.success ? (
                <div>
                  <p className="font-medium">备份完成</p>
                  <p className="mt-1 break-all font-mono text-xs">{result.filePath}</p>
                </div>
              ) : (
                <div>
                  <p className="font-medium">备份失败</p>
                  <p className="mt-1 text-xs">{result.error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={running}>
            {result ? '关闭' : '取消'}
          </Button>
          {!result?.success && (
            <Button onClick={handleBackup} disabled={!exportDir || running}>
              {running && <Loader2 className="mr-1 size-3 animate-spin" />}
              {running ? '备份中…' : result ? '重试' : '开始备份'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}