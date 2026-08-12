/**
 * Monaco Editor SQL 补全提供者
 *
 * 从 connectionStore 获取已加载的 schema 元数据（数据库列表、Schema 列表、表/视图、
 * 列、函数、存储过程），结合 sqlConfig 中的关键字和内置函数，提供 schema-aware 自动补全。
 *
 * 架构设计：
 * - 补全提供者通过闭包捕获 connectionStore 引用，每次触发补全时实时读取最新状态
 * - 连接上下文变化时（connectionId/database/schema），通过更新闭包内的 ref 实现无缝切换
 * - 无连接时仅提供 SQL 关键字和数据类型补全，不报错
 */
import type { Monaco } from '@monaco-editor/react'
import type { languages } from 'monaco-editor'
import type { DatabaseType } from '@/types/ipc'
import { getCompletionConfig } from './sqlConfig'
import { useConnectionStore } from '@/store/connectionStore'

/** 补全提供者配置选项 */
export interface CompletionProviderOptions {
  /** 数据库类型 */
  dbType: DatabaseType
  /** 获取当前连接上下文的函数（每次补全触发时调用，确保获取最新值） */
  getContext: () => { connectionId?: string; database?: string; schema?: string }
}

/**
 * 在 Monaco 实例上注册 SQL 补全提供者
 *
 * @param monaco - Monaco Editor 实例
 * @param options - 补全提供者配置
 * @returns 取消注册函数（供 cleanup 使用）
 */
export function registerCompletionProvider(
  monaco: Monaco,
  options: CompletionProviderOptions
): () => void {
  const { dbType, getContext } = options

  const provider: languages.CompletionItemProvider = {
    triggerCharacters: [],
    provideCompletionItems(model, position) {
      // 获取当前行的文本，用于上下文分析
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      })

      // 计算当前单词的 range，用于替换
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      const config = getCompletionConfig(dbType)
      const suggestions: languages.CompletionItem[] = []

      // 获取 schema 元数据（按当前连接和数据库过滤）
      const ctx = getContext()
      const store = useConnectionStore.getState()
      const schemaMeta = collectSchemaMetadata(store, ctx.connectionId, ctx.database)

      // 分析上下文
      const context = analyzeContext(textUntilPosition)

      // 1. Schema 名补全
      if (schemaMeta.schemas.length > 0) {
        for (const schema of schemaMeta.schemas) {
          suggestions.push({
            label: schema,
            kind: monaco.languages.CompletionItemKind.Module,
            detail: 'Schema',
            insertText: schema,
            range,
            sortText: '3_' + schema.toLowerCase()
          })
        }
      }

      // 2. 表/视图名补全
      if (context.suggestTables || context.suggestAll) {
        for (const table of schemaMeta.tables) {
          suggestions.push({
            label: table.name,
            kind: monaco.languages.CompletionItemKind.Class,
            detail: `${table.schema}.${table.name}${table.type === 'view' ? ' (视图)' : ''}`,
            insertText: table.name,
            range,
            sortText: '2_' + table.name.toLowerCase()
          })
        }
      }

      // 3. 列名补全
      if (context.suggestColumns || context.suggestAll) {
        for (const col of schemaMeta.columns) {
          suggestions.push({
            label: col.name,
            kind: monaco.languages.CompletionItemKind.Field,
            detail: `${col.table}.${col.name} · ${col.dataType}`,
            insertText: col.name,
            range,
            sortText: '1_' + col.name.toLowerCase()
          })
        }
      }

      // 4. 函数补全
      if (config.functions.length > 0 && (context.suggestFunctions || context.suggestAll)) {
        for (const fn of config.functions) {
          suggestions.push({
            label: fn,
            kind: monaco.languages.CompletionItemKind.Function,
            detail: '内置函数',
            insertText: fn,
            range,
            sortText: '4_' + fn.toLowerCase()
          })
        }
      }

      // 5. 关键字补全
      if (config.keywords.length > 0) {
        for (const kw of config.keywords) {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: '关键字',
            insertText: kw,
            range,
            sortText: '5_' + kw.toLowerCase()
          })
        }
      }

      // 6. 数据类型补全
      if (config.dataTypes.length > 0) {
        for (const dt of config.dataTypes) {
          suggestions.push({
            label: dt,
            kind: monaco.languages.CompletionItemKind.Struct,
            detail: '数据类型',
            insertText: dt,
            range,
            sortText: '6_' + dt.toLowerCase()
          })
        }
      }

      // 7. 代码片段补全
      if (config.snippets.length > 0) {
        for (const snippet of config.snippets) {
          suggestions.push({
            label: snippet.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: snippet.description,
            insertText: snippet.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            sortText: '0_' + snippet.label.toLowerCase()
          })
        }
      }

      return { suggestions }
    }
  }

  const disposable = monaco.languages.registerCompletionItemProvider('pgsql', provider)

  return () => disposable.dispose()
}

// ─── 上下文分析 ───

interface CompletionContextAnalysis {
  suggestAll: boolean
  suggestTables: boolean
  suggestColumns: boolean
  suggestFunctions: boolean
}

/**
 * 根据光标前的文本分析补全上下文
 */
function analyzeContext(textBefore: string): CompletionContextAnalysis {
  const upper = textBefore.toUpperCase().trimEnd()

  // 在 FROM / JOIN 后，主要提示表名
  if (
    /\b(FROM|JOIN|INTO|UPDATE|TABLE)\s*$/i.test(upper) ||
    /\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+\w*$/i.test(upper)
  ) {
    return {
      suggestAll: false,
      suggestTables: true,
      suggestColumns: false,
      suggestFunctions: false
    }
  }

  // 在 SELECT 后或 WHERE 等条件中，提示列名和函数
  if (
    /\bSELECT$/i.test(upper) ||
    /\bSELECT\s+/i.test(upper) ||
    /\bWHERE\s+/i.test(upper) ||
    /\bSET\s+/i.test(upper) ||
    /\bON\s+/i.test(upper) ||
    /\bHAVING\s+/i.test(upper) ||
    /\bORDER\s+BY\s+/i.test(upper) ||
    /\bGROUP\s+BY\s+/i.test(upper) ||
    /\bRETURNING\s+/i.test(upper) ||
    /\bWHEN\s+/i.test(upper)
  ) {
    return { suggestAll: false, suggestTables: false, suggestColumns: true, suggestFunctions: true }
  }

  // 默认：提示全部
  return { suggestAll: true, suggestTables: false, suggestColumns: false, suggestFunctions: false }
}

// ─── Schema 元数据收集 ───

interface SchemaMetadata {
  schemas: string[]
  tables: { name: string; schema: string; type: 'table' | 'view' }[]
  columns: { name: string; table: string; dataType: string }[]
}

/**
 * 从 connectionStore 中收集指定连接和数据库下已加载的 schema 元数据
 *
 * @param store - connectionStore 状态快照
 * @param connectionId - 目标连接 ID；不传则收集所有连接
 * @param database - 目标数据库名；不传则收集所有数据库
 */
function collectSchemaMetadata(
  store: ReturnType<typeof useConnectionStore.getState>,
  connectionId?: string,
  database?: string
): SchemaMetadata {
  const schemas: string[] = []
  const tables: SchemaMetadata['tables'] = []
  const columns: SchemaMetadata['columns'] = []

  // 按 connectionId 过滤
  const targetConns = connectionId
    ? { [connectionId]: store.connections[connectionId] }
    : store.connections

  for (const conn of Object.values(targetConns)) {
    if (!conn || !conn.databaseNodes) continue

    // 确定要收集的数据库列表
    const targetDbNames = database ? [database] : Object.keys(conn.databaseNodes)

    for (const dbName of targetDbNames) {
      const dbNode = conn.databaseNodes[dbName]
      if (!dbNode) continue

      // 收集 Schema 列表
      if (dbNode.schemas) {
        for (const s of dbNode.schemas) {
          if (!schemas.includes(s.name)) {
            schemas.push(s.name)
          }
        }
      }

      if (!dbNode.schemaNodes) continue

      for (const [schemaName, schemaNode] of Object.entries(dbNode.schemaNodes)) {
        // 收集模块中的表/视图
        if (schemaNode.modules) {
          for (const mod of Object.values(schemaNode.modules)) {
            if (mod.items) {
              for (const item of mod.items) {
                if ('type' in item && (item.type === 'table' || item.type === 'view')) {
                  const key = `${schemaName}.${item.name}`
                  if (!tables.some((t) => `${t.schema}.${t.name}` === key)) {
                    tables.push({ name: item.name, schema: schemaName, type: item.type })
                  }
                }
              }
            }
          }
        }

        // 收集表级节点中的列
        if (schemaNode.tableNodes) {
          for (const [tableName, tableNode] of Object.entries(schemaNode.tableNodes)) {
            const colModule = tableNode.modules?.columns
            if (colModule?.items) {
              for (const col of colModule.items) {
                if ('dataType' in col) {
                  columns.push({
                    name: col.name,
                    table: tableName,
                    dataType: col.dataType
                  })
                }
              }
            }
          }
        }
      }
    }
  }

  return { schemas, tables, columns }
}
