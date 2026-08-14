import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import Papa from 'papaparse'
import { CircleCheck, CircleX, FileUp, Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { fsService } from '@/services/fsService'
import { queryService } from '@/services/queryService'
import { splitSqlStatements } from '@/lib/sqlStatements'
import { useConnectionStore } from '@/store/connectionStore'
import type { ColumnInfo, ImportResult, SchemaInfo, TableInfo } from '@/types/ipc'

interface ImportDataDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  database: string
  /** 打开时默认选中的目标 schema，用户可在向导内改选 */
  defaultSchema?: string
  /** 打开时默认选中的目标表，用户可在向导内改选 */
  defaultTable?: string
  onImported: () => void
}

type SourceFormat = 'csv' | 'json' | 'sql'

interface ParsedRowsFile {
  format: 'csv' | 'json'
  /** 源文件字段名，按出现顺序 */
  fields: string[]
  rows: Record<string, unknown>[]
}

interface ColumnMappingRow {
  sourceField: string
  targetColumn: string | null
}

type WizardStep = 'setup' | 'mapping' | 'result'

const PREVIEW_LIMIT = 10
const PREVIEW_ROW_HEIGHT = 28
const PREVIEW_MIN_COL_WIDTH = 140

/** 判断文件字段与目标表列名是否完全一致（无需展示列映射步骤） */
function needsColumnMapping(fields: string[], columns: ColumnInfo[]): boolean {
  const columnNames = new Set(columns.map((c) => c.name))
  const requiredNames = columns.filter((c) => !c.nullable && !c.defaultValue).map((c) => c.name)
  const fieldSet = new Set(fields)
  const allFieldsMatch = fields.every((f) => columnNames.has(f))
  const allRequiredCovered = requiredNames.every((name) => fieldSet.has(name))
  return !allFieldsMatch || !allRequiredCovered
}

/** 解析 CSV 文本为字段名 + 行数组，解析失败或空文件抛出错误 */
function parseCsv(content: string): ParsedRowsFile {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true
  })
  if (result.errors.length > 0) {
    throw new Error(`CSV 文件解析失败：${result.errors[0].message}`)
  }
  const fields = result.meta.fields ?? []
  if (fields.length === 0 || result.data.length === 0) {
    throw new Error('CSV 文件内容为空')
  }
  return { format: 'csv', fields, rows: result.data }
}

/** 解析 JSON 文本为字段名 + 行数组，要求根节点是对象数组，解析失败或空文件抛出错误 */
function parseJson(content: string): ParsedRowsFile {
  if (!content.trim()) {
    throw new Error('JSON 文件内容为空')
  }
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch (error) {
    throw new Error(`JSON 文件解析失败：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('JSON 文件应为非空的对象数组')
  }
  const fields: string[] = []
  const rows: Record<string, unknown>[] = []
  for (const item of data) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('JSON 数组中的每一项都必须是对象')
    }
    const row = item as Record<string, unknown>
    for (const key of Object.keys(row)) {
      if (!fields.includes(key)) fields.push(key)
    }
    rows.push(row)
  }
  return { format: 'json', fields, rows }
}

/**
 * 导入预览表格：CSS Grid 布局 + 行虚拟滚动，横向按列数固有宽度触发滚动条，
 * 避免原生 `<table>` 在弹框（`DialogContent` 为 `display: grid`）内因
 * grid 子项默认 `min-width: auto` 被内容撑宽而视觉溢出弹框边框
 */
function ImportPreviewTable({
  fields,
  rows
}: {
  fields: string[]
  rows: Record<string, unknown>[]
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => PREVIEW_ROW_HEIGHT,
    overscan: 5
  })
  const gridTemplateColumns = useMemo(
    () => `repeat(${fields.length}, minmax(${PREVIEW_MIN_COL_WIDTH}px, 1fr))`,
    [fields.length]
  )

  return (
    <div ref={scrollRef} className="max-h-48 min-w-0 overflow-auto rounded-md border">
      <div style={{ minWidth: fields.length * PREVIEW_MIN_COL_WIDTH }}>
        <div
          className="sticky top-0 z-10 grid border-b bg-muted/50 text-xs"
          style={{ gridTemplateColumns }}
        >
          {fields.map((f) => (
            <div key={f} className="truncate px-2 py-1 font-medium">
              {f}
            </div>
          ))}
        </div>
        <div style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]
            return (
              <div
                key={virtualRow.key}
                className="absolute top-0 left-0 grid w-full border-t text-xs"
                style={{
                  gridTemplateColumns,
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                {fields.map((f) => (
                  <div key={f} className="truncate px-2 py-1">
                    {String(row[f] ?? '')}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * 数据导入向导弹框
 *
 * 选择目标表 → 选择本地 CSV/JSON/SQL 文件并解析预览（写入前完成有效性校验，
 * 解析失败或空文件直接提示无效并终止）→ 字段名与目标表列名不一致时展示列映射步骤
 * （未映射的必填列高亮提示）→ 确认后整体事务导入 → 展示成功行数/失败原因
 */
export default function ImportDataDialog({
  open,
  onOpenChange,
  connectionId,
  database,
  defaultSchema,
  defaultTable,
  onImported
}: ImportDataDialogProps): React.JSX.Element {
  const dbType = useConnectionStore((s) => s.connections[connectionId]?.config.type ?? 'postgresql')
  const [prevOpen, setPrevOpen] = useState(open)
  const [step, setStep] = useState<WizardStep>('setup')

  const [schemas, setSchemas] = useState<SchemaInfo[]>([])
  const [tables, setTables] = useState<TableInfo[]>([])
  const [targetSchema, setTargetSchema] = useState('')
  const [targetTable, setTargetTable] = useState('')
  const [targetColumns, setTargetColumns] = useState<ColumnInfo[]>([])
  const [loadingMeta, setLoadingMeta] = useState(false)

  const [filePath, setFilePath] = useState<string | null>(null)
  const [sourceFormat, setSourceFormat] = useState<SourceFormat | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRowsFile | null>(null)
  const [sqlStatements, setSqlStatements] = useState<string[] | null>(null)
  const [mapping, setMapping] = useState<ColumnMappingRow[]>([])

  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // 弹框由关闭切换为打开时重置全部向导状态，渲染期间调整状态，避免额外一次级联重渲染
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setStep('setup')
      setFilePath(null)
      setSourceFormat(null)
      setParsedRows(null)
      setSqlStatements(null)
      setMapping([])
      setParseError(null)
      setImportResult(null)
      setImportError(null)
    }
  }

  useEffect(() => {
    if (!open) return
    // 打开弹框时拉取 schema 列表，需要立即置为加载中；这是标准的数据获取场景
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingMeta(true)
    void queryService
      .getSchemas(connectionId, database)
      .then((list) => {
        setSchemas(list)
        setTargetSchema(defaultSchema ?? list[0]?.name ?? '')
      })
      .catch((error) => setParseError(error instanceof Error ? error.message : '获取 schema 失败'))
      .finally(() => setLoadingMeta(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connectionId, database])

  useEffect(() => {
    if (!open || !targetSchema) return
    // 切换 schema 时重新拉取表列表，需要立即置为加载中；这是标准的数据获取场景
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingMeta(true)
    void queryService
      .getTables(connectionId, database, targetSchema)
      .then((list) => {
        const onlyTables = list.filter((t) => t.type === 'table')
        setTables(onlyTables)
        setTargetTable((prev) =>
          onlyTables.some((t) => t.name === (prev || defaultTable))
            ? prev || defaultTable || ''
            : (onlyTables[0]?.name ?? '')
        )
      })
      .catch((error) => setParseError(error instanceof Error ? error.message : '获取表列表失败'))
      .finally(() => setLoadingMeta(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connectionId, database, targetSchema])

  useEffect(() => {
    if (!open || !targetSchema || !targetTable) {
      // 目标表被清空时同步清空列缓存；这是标准的数据获取场景
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTargetColumns([])
      return
    }
    void queryService
      .getColumns(connectionId, database, targetSchema, targetTable)
      .then(setTargetColumns)
      .catch((error) => setParseError(error instanceof Error ? error.message : '获取列信息失败'))
  }, [open, connectionId, database, targetSchema, targetTable])

  const resetFileState = (): void => {
    setFilePath(null)
    setSourceFormat(null)
    setParsedRows(null)
    setSqlStatements(null)
    setMapping([])
  }

  const handlePickFile = async (): Promise<void> => {
    setParseError(null)
    resetFileState()
    const path = await fsService.pickOpenFile([
      { name: '支持的文件 (CSV/JSON/SQL)', extensions: ['csv', 'json', 'sql'] },
      { name: 'CSV 文件', extensions: ['csv'] },
      { name: 'JSON 文件', extensions: ['json'] },
      { name: 'SQL 文件', extensions: ['sql'] }
    ])
    if (!path) return

    const extension = path.split('.').pop()?.toLowerCase()
    if (extension !== 'csv' && extension !== 'json' && extension !== 'sql') {
      setParseError('不支持的文件类型，仅支持 CSV / JSON / SQL')
      return
    }

    try {
      const content = await fsService.readFile(path)
      if (extension === 'sql') {
        const statements = splitSqlStatements(content, dbType)
        setSqlStatements(statements)
      } else {
        const parsed = extension === 'csv' ? parseCsv(content) : parseJson(content)
        setParsedRows(parsed)
        setMapping(
          parsed.fields.map((sourceField) => ({
            sourceField,
            targetColumn: targetColumns.some((c) => c.name === sourceField) ? sourceField : null
          }))
        )
        if (needsColumnMapping(parsed.fields, targetColumns)) setStep('mapping')
      }
      setFilePath(path)
      setSourceFormat(extension)
    } catch (error) {
      setParseError(error instanceof Error ? error.message : '文件解析失败')
    }
  }

  const requiredColumns = targetColumns.filter((c) => !c.nullable && !c.defaultValue)
  const mappedTargets = new Set(mapping.map((m) => m.targetColumn).filter(Boolean))
  const missingRequired = requiredColumns.filter((c) => !mappedTargets.has(c.name))
  const mappingRequired = parsedRows ? needsColumnMapping(parsedRows.fields, targetColumns) : false

  const buildImportRowsRequest = (): { columns: string[]; rows: unknown[][] } => {
    if (!parsedRows) throw new Error('没有可导入的数据')
    const activeMapping = mapping.filter((m) => m.targetColumn)
    const columns = activeMapping.map((m) => m.targetColumn as string)
    // CSV 无 NULL 概念，导出时已将 NULL 渲染为空字段（见 exportFormat.ts），
    // 导入时按同一约定把空字符串还原为 NULL，否则写入 timestamp/数值等类型列会报语法错误
    const rows = parsedRows.rows.map((row) =>
      activeMapping.map((m) => {
        const value = row[m.sourceField]
        return parsedRows.format === 'csv' && value === '' ? null : (value ?? null)
      })
    )
    return { columns, rows }
  }

  const handleConfirmImport = async (): Promise<void> => {
    setImporting(true)
    setImportError(null)
    try {
      let result: ImportResult
      if (sourceFormat === 'sql' && sqlStatements) {
        result = await queryService.importSql(connectionId, database, {
          statements: sqlStatements
        })
      } else if (parsedRows) {
        const { columns, rows } = buildImportRowsRequest()
        result = await queryService.importRows(connectionId, database, {
          schema: targetSchema,
          table: targetTable,
          columns,
          rows
        })
      } else {
        throw new Error('没有可导入的数据')
      }
      setImportResult(result)
      setStep('result')
      if (result.succeededCount > 0) onImported()
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const canConfirm =
    (sourceFormat === 'sql' && !!sqlStatements) ||
    (!!parsedRows && (!mappingRequired || missingRequired.length === 0))

  const previewRows = parsedRows?.rows.slice(0, PREVIEW_LIMIT) ?? []

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!importing) onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>导入数据</DialogTitle>
        </DialogHeader>

        {parseError && <p className="text-sm text-destructive">{parseError}</p>}

        {step !== 'result' && (
          <div className="min-w-0 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-sm text-muted-foreground">目标表</span>
              <Select value={targetSchema} onValueChange={setTargetSchema} disabled={loadingMeta}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue placeholder="选择 schema" />
                </SelectTrigger>
                <SelectContent>
                  {schemas.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={targetTable} onValueChange={setTargetTable} disabled={loadingMeta}>
                <SelectTrigger size="sm" className="w-48">
                  <SelectValue placeholder="选择表" />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void handlePickFile()}>
                <FileUp className="size-4" />
                选择文件（CSV / JSON / SQL）
              </Button>
              {filePath && (
                <span className="truncate text-xs text-muted-foreground">{filePath}</span>
              )}
            </div>

            {step === 'setup' && parsedRows && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  共 {parsedRows.rows.length} 行，预览前 {previewRows.length} 行
                </p>
                <ImportPreviewTable fields={parsedRows.fields} rows={previewRows} />
              </div>
            )}

            {step === 'setup' && sqlStatements && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">共 {sqlStatements.length} 条语句</p>
                <div className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
                  {sqlStatements.map((s, i) => (
                    <div key={i} className="truncate">
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 'mapping' && parsedRows && (
              <div className="space-y-2">
                {missingRequired.length > 0 && (
                  <p className="flex items-center gap-1.5 text-sm text-destructive">
                    <TriangleAlert className="size-4" />
                    以下必填列尚未映射：{missingRequired.map((c) => c.name).join('、')}
                  </p>
                )}
                <div className="max-h-64 space-y-1.5 overflow-auto">
                  {mapping.map((m, index) => (
                    <div key={m.sourceField} className="flex items-center gap-2">
                      <span className="w-40 shrink-0 truncate text-sm">{m.sourceField}</span>
                      <span className="text-muted-foreground">→</span>
                      <Select
                        value={m.targetColumn ?? '__none__'}
                        onValueChange={(v) =>
                          setMapping((prev) =>
                            prev.map((row, i) =>
                              i === index
                                ? { ...row, targetColumn: v === '__none__' ? null : v }
                                : row
                            )
                          )
                        }
                      >
                        <SelectTrigger size="sm" className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">不导入此列</SelectItem>
                          {targetColumns.map((c) => (
                            <SelectItem key={c.name} value={c.name}>
                              {c.name}
                              {!c.nullable && !c.defaultValue ? ' *' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importError && <p className="text-sm text-destructive">{importError}</p>}
          </div>
        )}

        {step === 'result' && importResult && (
          <div className="space-y-2">
            {importResult.succeededCount > 0 && !importResult.failedAt ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-600">
                <CircleCheck className="size-4" />
                导入成功，共写入 {importResult.succeededCount} 行
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <CircleX className="size-4" />
                导入失败{importResult.failedAt && `（第 ${importResult.failedAt.index + 1} 行）`}
                {importResult.rolledBack && '，已整体回滚，未写入任何数据'}
              </p>
            )}
            {importResult.failedAt && (
              <p className="text-sm text-muted-foreground">
                失败原因：{importResult.failedAt.message}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'result' ? (
            <Button onClick={() => onOpenChange(false)}>关闭</Button>
          ) : (
            <>
              <Button variant="outline" disabled={importing} onClick={() => onOpenChange(false)}>
                取消
              </Button>
              {step === 'mapping' ? (
                <Button variant="outline" disabled={importing} onClick={() => setStep('setup')}>
                  上一步
                </Button>
              ) : (
                mappingRequired &&
                parsedRows && (
                  <Button variant="outline" disabled={importing} onClick={() => setStep('mapping')}>
                    列映射
                  </Button>
                )
              )}
              <Button
                disabled={!canConfirm || importing}
                onClick={() => void handleConfirmImport()}
              >
                {importing && <Loader2 className="size-4 animate-spin" />}
                开始导入
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
