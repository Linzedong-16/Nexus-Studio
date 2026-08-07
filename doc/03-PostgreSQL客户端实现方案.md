# PostgreSQL 客户端详细实现方案

## 1. 实现概览

本文档详细描述如何分步骤实现一个功能完善的 PostgreSQL 客户端，涵盖 UI 界面设计、依赖包选型、核心功能开发实现。

整体实现分为 6 个模块，按依赖关系顺序开发：

```
连接管理 ──> SQL 编辑器 ──> 查询执行 ──> 结果展示
                │                            │
                └────> Schema 浏览 <──────────┘
                            │
                            └────> 数据导入导出
```

---

## 2. 模块一：连接管理

### 2.1 UI 界面设计

#### 连接列表（侧边栏）

```
┌─────────────────────────┐
│  🔌 连接                 │
│  ┌─────────────────────┐ │
│  │ 🟢 生产数据库        │ │  ← 状态指示 + 连接名称
│  │   localhost:5432     │ │
│  ├─────────────────────┤ │
│  │ 🟡 测试环境          │ │
│  │   192.168.1.100:5432 │ │
│  ├─────────────────────┤ │
│  │ ⚪ 开发环境（离线）   │ │
│  │   dev-db:5432        │ │
│  └─────────────────────┘ │
│  [+ 新建连接]            │
└─────────────────────────┘
```

#### 连接对话框

```
┌──────────────────────────────────────┐
│  新建连接                         [X] │
│  ┌──────────────────────────────────┐│
│  │ 连接名称  [___________________]  ││
│  │ 主机      [localhost_____] :5432 ││
│  │ 数据库    [postgres______]       ││
│  │ 用户名    [postgres______]       ││
│  │ 密码      [••••••••______] [👁]  ││
│  │                                  ││
│  │ ▼ 高级选项                       ││
│  │   SSL 模式  [prefer______▼]      ││
│  │   连接超时  [30______] 秒      ││
│  │   颜色标签  [🟢 生产] [🟡 测试]  ││
│  └──────────────────────────────────┘│
│  [测试连接]          [取消] [保存]   │
└──────────────────────────────────────┘
```

### 2.2 关键依赖

```bash
pnpm add pg uuid
pnpm add @types/pg @types/uuid -D
```

### 2.3 数据结构定义

```typescript
// src/renderer/src/types/database.ts

/** 连接配置 */
interface ConnectionConfig {
  id: string;                    // 唯一标识
  name: string;                  // 连接名称
  host: string;                  // 主机地址
  port: number;                  // 端口，默认 5432
  database: string;              // 数据库名
  username: string;              // 用户名
  password?: string;             // 密码（加密存储）
  ssl?: boolean | SSLConfig;     // SSL 配置
  connectionTimeout?: number;    // 连接超时（秒）
  color?: string;                // 颜色标签
  group?: string;                // 分组
  createdAt: string;             // 创建时间
  updatedAt: string;             // 更新时间
}

/** 连接状态 */
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** 连接测试结果 */
interface TestResult {
  success: boolean;
  message: string;
  serverVersion?: string;
  latency?: number;             // 连接延迟（ms）
}
```

### 2.4 主进程实现

**文件：`src/main/db/adapters/postgresql.adapter.ts`**

```typescript
import { Pool, PoolClient, QueryResult as PgQueryResult } from 'pg';
import type { ConnectionConfig, TestResult, ConnectionStatus } from '../types';

export class PostgreSQLAdapter {
  private pool: Pool | null = null;
  private config: ConnectionConfig | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl,
      connectionTimeoutMillis: (config.connectionTimeout ?? 30) * 1000,
      max: 5,                       // 最大连接数
      idleTimeoutMillis: 30000,     // 空闲超时
    });

    // 测试连接
    const client = await this.pool.connect();
    client.release();
  }

  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    const startTime = Date.now();
    const testPool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl,
      connectionTimeoutMillis: (config.connectionTimeout ?? 30) * 1000,
      max: 1,
    });

    try {
      const client = await testPool.connect();
      const result = await client.query('SELECT version()');
      client.release();
      await testPool.end();

      return {
        success: true,
        message: '连接成功',
        serverVersion: result.rows[0]?.version,
        latency: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || '连接失败',
      };
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<PgQueryResult> {
    if (!this.pool) throw new Error('未连接到数据库');
    return this.pool.query(sql, params);
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.config = null;
    }
  }

  getStatus(): ConnectionStatus {
    if (!this.pool) return 'disconnected';
    return this.pool.totalCount > 0 ? 'connected' : 'disconnected';
  }
}
```

**文件：`src/main/db/pool.ts`**

```typescript
import { PostgreSQLAdapter } from './adapters/postgresql.adapter';
import type { ConnectionConfig, TestResult } from './types';

export class ConnectionManager {
  private adapters: Map<string, PostgreSQLAdapter> = new Map();
  private activeId: string | null = null;

  async createConnection(config: ConnectionConfig): Promise<string> {
    const adapter = new PostgreSQLAdapter();
    await adapter.connect(config);
    this.adapters.set(config.id, adapter);
    this.activeId = config.id;
    return config.id;
  }

  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    const adapter = new PostgreSQLAdapter();
    return adapter.testConnection(config);
  }

  async disconnect(id: string): Promise<void> {
    const adapter = this.adapters.get(id);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(id);
      if (this.activeId === id) {
        this.activeId = null;
      }
    }
  }

  getAdapter(id?: string): PostgreSQLAdapter | undefined {
    const targetId = id ?? this.activeId;
    return targetId ? this.adapters.get(targetId) : undefined;
  }

  async closeAll(): Promise<void> {
    const promises = Array.from(this.adapters.values()).map(a => a.disconnect());
    await Promise.all(promises);
    this.adapters.clear();
    this.activeId = null;
  }
}

// 全局单例
export const connectionManager = new ConnectionManager();
```

### 2.5 IPC 处理

**文件：`src/main/ipc/db.ipc.ts`**

```typescript
import { ipcMain } from 'electron';
import { connectionManager } from '../db/pool';
import { safeStorage } from 'electron';
import type { ConnectionConfig } from '../db/types';

export function registerDbIpc(): void {
  // 连接数据库
  ipcMain.handle('db:connect', async (_event, config: ConnectionConfig) => {
    try {
      // 解密密码
      if (config.password) {
        config.password = safeStorage.decryptString(
          Buffer.from(config.password, 'base64')
        );
      }
      return await connectionManager.createConnection(config);
    } catch (error: any) {
      throw new Error(`连接失败: ${error.message}`);
    }
  });

  // 测试连接
  ipcMain.handle('db:test-connection', async (_event, config: ConnectionConfig) => {
    return connectionManager.testConnection(config);
  });

  // 断开连接
  ipcMain.handle('db:disconnect', async (_event, id: string) => {
    await connectionManager.disconnect(id);
  });

  // 执行查询
  ipcMain.handle('db:execute', async (_event, sql: string, params?: unknown[]) => {
    const adapter = connectionManager.getAdapter();
    if (!adapter) throw new Error('未连接到数据库');
    return adapter.execute(sql, params);
  });

  // 加密密码
  ipcMain.handle('db:encrypt-password', async (_event, password: string) => {
    return safeStorage.encryptString(password).toString('base64');
  });
}
```

### 2.6 渲染进程实现

**文件：`src/renderer/src/store/connectionStore.ts`**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConnectionConfig, ConnectionStatus } from '../types/database';

interface ConnectionStore {
  connections: ConnectionConfig[];
  activeId: string | null;
  statuses: Record<string, ConnectionStatus>;

  addConnection: (config: ConnectionConfig) => void;
  removeConnection: (id: string) => void;
  updateConnection: (id: string, config: Partial<ConnectionConfig>) => void;
  setActive: (id: string | null) => void;
  setStatus: (id: string, status: ConnectionStatus) => void;
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set, get) => ({
      connections: [],
      activeId: null,
      statuses: {},

      addConnection: (config) =>
        set((state) => ({
          connections: [...state.connections, config],
          activeId: config.id,
          statuses: { ...state.statuses, [config.id]: 'disconnected' },
        })),

      removeConnection: (id) =>
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
          activeId: state.activeId === id ? null : state.activeId,
        })),

      updateConnection: (id, config) =>
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, ...config, updatedAt: new Date().toISOString() } : c
          ),
        })),

      setActive: (id) => set({ activeId: id }),
      setStatus: (id, status) =>
        set((state) => ({
          statuses: { ...state.statuses, [id]: status },
        })),
    }),
    { name: 'db-connections' }
  )
);
```

---

## 3. 模块二：SQL 编辑器

### 3.1 UI 界面设计

```
┌──────────────────────────────────────────────────┐
│  [▶ 执行] [⏹ 停止] [🔽 格式化] [📋 导出] [📂]   │  ← 工具栏
├──────────────────────────────────────────────────┤
│  1 │ SELECT                                      │
│  2 │   u.id,                                     │
│  3 │   u.username,                               │  ← SQL 编辑器
│  4 │   u.email,                                  │     (Monaco Editor)
│  5 │   COUNT(o.id) as order_count                │
│  6 │ FROM users u                                │
│  7 │ LEFT JOIN orders o ON u.id = o.user_id      │
│  8 │ WHERE u.created_at > $1                     │
│  9 │ GROUP BY u.id                               │
│ 10 │ ORDER BY order_count DESC                   │
│ 11 │ LIMIT 100;                                  │
├──────────────────────────────────────────────────┤
│  ⏱ 12ms  |  📊 100 rows  |  🐘 PostgreSQL 16.2  │  ← 状态栏
└──────────────────────────────────────────────────┘
```

### 3.2 关键依赖

```bash
pnpm add @monaco-editor/react sql-formatter
```

### 3.3 Monaco Editor 集成

**文件：`src/renderer/src/components/editor/SqlEditor.tsx`**

```tsx
import { useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { format } from 'sql-formatter';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  language?: string;
}

export function SqlEditor({ value, onChange, onExecute, language = 'pgsql' }: SqlEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // 注册快捷键
    editor.addAction({
      id: 'execute-sql',
      label: '执行 SQL',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: onExecute,
    });

    editor.addAction({
      id: 'format-sql',
      label: '格式化 SQL',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
      run: () => {
        const currentValue = editor.getValue();
        try {
          const formatted = format(currentValue, {
            language: 'postgresql',
            tabWidth: 2,
            keywordCase: 'upper',
            linesBetweenQueries: 2,
          });
          editor.setValue(formatted);
        } catch {
          // 格式化失败，保持原样
        }
      },
    });

    // 设置 PostgreSQL 语言配置
    monaco.languages.setLanguageConfiguration('pgsql', {
      comments: {
        lineComment: '--',
        blockComment: ['/*', '*/'],
      },
      brackets: [['(', ')'], ['[', ']']],
      autoClosingPairs: [
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: "'", close: "'" },
        { open: '"', close: '"' },
      ],
    });
  };

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={(val) => onChange(val ?? '')}
      onMount={handleMount}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        wordWrap: 'off',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        suggest: {
          showKeywords: true,
          showSnippets: true,
        },
        quickSuggestions: true,
      }}
    />
  );
}
```

### 3.4 SQL 自动补全实现

**文件：`src/renderer/src/components/editor/completionProvider.ts`**

```typescript
import type { languages } from 'monaco-editor';

// PostgreSQL 关键字
const PG_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER',
  'DROP', 'TABLE', 'INDEX', 'VIEW', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
  'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL',
  'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION', 'ALL', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'AS', 'INTO', 'VALUES', 'SET', 'DEFAULT', 'PRIMARY', 'KEY', 'FOREIGN',
  'REFERENCES', 'CONSTRAINT', 'UNIQUE', 'CHECK', 'CASCADE', 'BEGIN',
  'COMMIT', 'ROLLBACK', 'TRANSACTION', 'SERIALIZABLE', 'FUNCTION',
  'RETURNS', 'LANGUAGE', 'IMMUTABLE', 'STABLE', 'VOLATILE', 'SCHEMA',
  'GRANT', 'REVOKE', 'WITH', 'RECURSIVE', 'OVER', 'PARTITION', 'WINDOW',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'COALESCE',
  'NULLIF', 'CAST', 'INTERVAL', 'ARRAY', 'JSON', 'JSONB', 'BOOLEAN',
  'INTEGER', 'BIGINT', 'SERIAL', 'TEXT', 'VARCHAR', 'TIMESTAMP', 'DATE',
  'NUMERIC', 'DECIMAL', 'FLOAT', 'DOUBLE', 'PRECISION', 'EXPLAIN', 'ANALYZE',
];

// SQL 片段
const SQL_SNIPPETS: languages.CompletionItem[] = [
  {
    label: 'sel',
    insertText: 'SELECT ${1:*} FROM ${2:table_name} WHERE ${3:condition};',
    insertTextRules: 4, // InsertAsSnippet
    kind: 27, // Snippet
    documentation: 'SELECT 语句模板',
  },
  {
    label: 'ins',
    insertText: 'INSERT INTO ${1:table_name} (${2:columns}) VALUES (${3:values});',
    insertTextRules: 4,
    kind: 27,
    documentation: 'INSERT 语句模板',
  },
  {
    label: 'upd',
    insertText: 'UPDATE ${1:table_name} SET ${2:column} = ${3:value} WHERE ${4:condition};',
    insertTextRules: 4,
    kind: 27,
    documentation: 'UPDATE 语句模板',
  },
  {
    label: 'del',
    insertText: 'DELETE FROM ${1:table_name} WHERE ${2:condition};',
    insertTextRules: 4,
    kind: 27,
    documentation: 'DELETE 语句模板',
  },
  {
    label: 'cr',
    insertText: 'CREATE TABLE ${1:table_name} (\n  ${2:id} SERIAL PRIMARY KEY,\n  ${3:column} ${4:TEXT}\n);',
    insertTextRules: 4,
    kind: 27,
    documentation: 'CREATE TABLE 语句模板',
  },
];

export function createCompletionProvider(
  getTables: () => string[],
  getColumns: (table: string) => string[]
): languages.CompletionItemProvider {
  return {
    triggerCharacters: ['.', ' '],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: languages.CompletionItem[] = [];

      // 关键字补全
      for (const keyword of PG_KEYWORDS) {
        suggestions.push({
          label: keyword,
          kind: 14, // Keyword
          insertText: keyword,
          range,
        });
      }

      // 表名补全
      for (const table of getTables()) {
        suggestions.push({
          label: table,
          kind: 1, // Field
          insertText: table,
          range,
          detail: '表',
        });
      }

      // 代码片段
      suggestions.push(...SQL_SNIPPETS);

      return { suggestions };
    },
  };
}
```

### 3.5 编辑器工具栏

**文件：`src/renderer/src/components/editor/EditorToolbar.tsx`**

```tsx
import { Button } from '@/components/ui/button';
import {
  Play, Square, Wand2, Download, FolderOpen, Save
} from 'lucide-react';

interface EditorToolbarProps {
  onExecute: () => void;
  onStop: () => void;
  onFormat: () => void;
  onExport: () => void;
  onOpen: () => void;
  onSave: () => void;
  isRunning: boolean;
  isConnected: boolean;
}

export function EditorToolbar({
  onExecute, onStop, onFormat, onExport, onOpen, onSave,
  isRunning, isConnected,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/30">
      <Button
        variant="ghost"
        size="sm"
        onClick={onExecute}
        disabled={!isConnected || isRunning}
        title="执行 SQL (Ctrl+Enter)"
      >
        <Play className="h-4 w-4 mr-1 text-green-500" />
        执行
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onStop}
        disabled={!isRunning}
        title="停止查询"
      >
        <Square className="h-4 w-4 mr-1 text-red-500" />
        停止
      </Button>

      <div className="w-px h-5 bg-border mx-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onFormat}
        title="格式化 SQL (Ctrl+Shift+F)"
      >
        <Wand2 className="h-4 w-4 mr-1" />
        格式化
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onExport}
        title="导出结果"
      >
        <Download className="h-4 w-4 mr-1" />
        导出
      </Button>

      <div className="w-px h-5 bg-border mx-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onOpen}
        title="打开 SQL 文件"
      >
        <FolderOpen className="h-4 w-4 mr-1" />
        打开
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onSave}
        title="保存 SQL 文件"
      >
        <Save className="h-4 w-4 mr-1" />
        保存
      </Button>
    </div>
  );
}
```

---

## 4. 模块三：查询执行

### 4.1 查询执行流程设计

```
用户点击执行 / Ctrl+Enter
    │
    ▼
EditorToolbar.onExecute()
    │
    ▼
queryService.execute(sql, connectionId)
    │
    ├── 1. 解析 SQL 语句（node-sql-parser）
    │    └── 检测危险操作（DROP, TRUNCATE, DELETE 无 WHERE）
    │         └── 弹出确认对话框
    │
    ├── 2. 设置 loading 状态
    │    └── queryStore.setLoading(tabId, true)
    │
    ├── 3. 通过 IPC 发送到主进程
    │    └── window.electronAPI.db.execute(sql, params)
    │
    ├── 4. 主进程执行查询
    │    └── PostgreSQLAdapter.execute(sql, params)
    │         └── pg.Pool.query(sql, params)
    │
    ├── 5. 返回结果
    │    └── queryStore.setResult(tabId, result)
    │
    └── 6. 记录查询历史
         └── 保存到 localStorage
```

### 4.2 查询服务实现

**文件：`src/renderer/src/services/queryService.ts`**

```typescript
import { Parser } from 'node-sql-parser';

interface QueryResult {
  columns: { name: string; dataType: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
  sql: string;
}

class QueryService {
  private parser = new Parser();
  private abortController: AbortController | null = null;

  /**
   * 解析 SQL 语句，检测危险操作
   */
  analyzeSQL(sql: string): { statements: string[]; hasDangerous: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let hasDangerous = false;

    try {
      const ast = this.parser.astify(sql, { database: 'PostgreSQL' });
      const statements = Array.isArray(ast) ? ast : [ast];

      for (const stmt of statements) {
        const type = (stmt as any).type?.toUpperCase();
        if (['DROP', 'TRUNCATE'].includes(type)) {
          hasDangerous = true;
          warnings.push(`检测到 ${type} 操作，此操作不可逆！`);
        }
        if (type === 'DELETE' && !(stmt as any).where) {
          hasDangerous = true;
          warnings.push('DELETE 语句缺少 WHERE 条件，将删除所有数据！');
        }
      }

      return { statements: statements.map(s => s as any), hasDangerous, warnings };
    } catch {
      // 解析失败，返回原始 SQL
      return { statements: [sql], hasDangerous: false, warnings: [] };
    }
  }

  /**
   * 执行 SQL 查询
   */
  async execute(sql: string): Promise<QueryResult> {
    this.abortController = new AbortController();
    const startTime = performance.now();

    try {
      const result = await window.electronAPI.db.execute(sql);
      const duration = Math.round(performance.now() - startTime);

      return {
        columns: result.fields.map((f: any) => ({
          name: f.name,
          dataType: f.dataTypeID ? String(f.dataTypeID) : 'unknown',
        })),
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
        duration,
        sql,
      };
    } catch (error: any) {
      throw new Error(error.message || '查询执行失败');
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 取消正在执行的查询
   */
  async cancel(): Promise<void> {
    this.abortController?.abort();
    await window.electronAPI.db.cancel();
  }

  /**
   * 执行多条 SQL 语句
   */
  async executeMultiple(sql: string): Promise<QueryResult[]> {
    const { statements, warnings } = this.analyzeSQL(sql);
    const results: QueryResult[] = [];

    for (const stmt of statements) {
      const result = await this.execute(stmt as string);
      results.push(result);
    }

    return results;
  }
}

export const queryService = new QueryService();
```

### 4.3 查询取消实现

**主进程：`src/main/db/adapters/postgresql.adapter.ts` 补充**

```typescript
// 在主进程中维护活跃查询的引用
private activeQuery: any = null;

async execute(sql: string, params?: unknown[]): Promise<PgQueryResult> {
  if (!this.pool) throw new Error('未连接到数据库');
  this.activeQuery = this.pool.query(sql, params);
  try {
    const result = await this.activeQuery;
    return result;
  } finally {
    this.activeQuery = null;
  }
}

async cancelQuery(): Promise<void> {
  if (this.activeQuery) {
    // 通过 pg 的 cancel 机制取消查询
    // 需要获取后端 PID 和 cancel key
    try {
      await this.pool?.query(
        `SELECT pg_cancel_backend(pg_stat_activity.pid)
         FROM pg_stat_activity
         WHERE pg_stat_activity.query = $1
           AND pid <> pg_backend_pid()`,
        [this.activeQuery.text]
      );
    } catch {
      // 取消失败，忽略
    }
  }
}
```

---

## 5. 模块四：结果展示

### 5.1 UI 界面设计

```
┌──────────────────────────────────────────────────────┐
│  📊 查询结果                    ⏱ 12ms  |  📄 100 行 │
├──────────────────────────────────────────────────────┤
│  id │ username   │ email              │ order_count  │
│─────┼────────────┼────────────────────┼──────────────│
│  42 │ alice      │ alice@example.com  │     156      │
│  17 │ bob        │ bob@example.com    │     142      │
│  89 │ charlie    │ charlie@test.com   │      98      │
│  ...│ ...        │ ...                │     ...      │
├──────────────────────────────────────────────────────┤
│  <<  <  第 1/10 页  >  >>     每页 [10 ▼] 条        │
└──────────────────────────────────────────────────────┘
```

### 5.2 关键依赖

```bash
pnpm add @tanstack/react-table @tanstack/react-virtual
```

### 5.3 结果表格组件

**文件：`src/renderer/src/components/result/ResultTable.tsx`**

```tsx
import { useState, useMemo, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface ResultTableProps {
  columns: { name: string; dataType: string }[];
  rows: Record<string, unknown>[];
  isLoading?: boolean;
}

export function ResultTable({ columns, rows, isLoading }: ResultTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // 定义列
  const columnDefs = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      columns.map((col) => ({
        accessorKey: col.name,
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold">{col.name}</span>
            <span className="text-[10px] text-muted-foreground">{col.dataType}</span>
            <button
              className="ml-auto"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="h-3 w-3" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="h-3 w-3" />
              ) : (
                <ArrowUpDown className="h-3 w-3" />
              )}
            </button>
          </div>
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          if (value === null) {
            return <span className="text-muted-foreground italic text-xs">NULL</span>;
          }
          if (typeof value === 'boolean') {
            return (
              <span className={value ? 'text-green-500' : 'text-red-500'}>
                {value.toString()}
              </span>
            );
          }
          return <span className="text-sm">{String(value)}</span>;
        },
        size: 150,
        minSize: 80,
        maxSize: 400,
        enableSorting: true,
        enableColumnFilter: true,
      })),
    [columns]
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  });

  // 虚拟滚动
  const { rows: tableRows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        正在加载...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        暂无数据
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 全局搜索 */}
      <div className="p-2 border-b">
        <Input
          placeholder="搜索..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="h-7 max-w-xs text-sm"
        />
      </div>

      {/* 表格 */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                <TableCell className="w-10 text-center text-xs text-muted-foreground font-mono border-r">
                  #
                </TableCell>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="border-r"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = tableRows[virtualRow.index];
              return (
                <TableRow
                  key={row.id}
                  className="hover:bg-muted/50"
                  style={{ height: `${virtualRow.size}px` }}
                >
                  <TableCell className="w-10 text-center text-xs text-muted-foreground font-mono border-r">
                    {virtualRow.index + 1}
                  </TableCell>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="border-r truncate"
                      style={{ maxWidth: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 状态栏 */}
      <div className="flex items-center justify-between px-3 py-1 border-t text-xs text-muted-foreground bg-muted/30">
        <span>
          共 {table.getFilteredRowModel().rows.length} 行
          {globalFilter && ` (筛选自 ${rows.length} 行)`}
        </span>
        <span>{columns.length} 列</span>
      </div>
    </div>
  );
}
```

### 5.4 结果状态管理

**文件：`src/renderer/src/store/queryStore.ts`**

```typescript
import { create } from 'zustand';

interface QueryResult {
  columns: { name: string; dataType: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
  sql: string;
}

interface QueryState {
  results: Record<string, QueryResult>;
  isLoading: Record<string, boolean>;
  errors: Record<string, string | null>;

  setResult: (tabId: string, result: QueryResult) => void;
  setLoading: (tabId: string, loading: boolean) => void;
  setError: (tabId: string, error: string | null) => void;
  clearResult: (tabId: string) => void;
}

export const useQueryStore = create<QueryState>((set) => ({
  results: {},
  isLoading: {},
  errors: {},

  setResult: (tabId, result) =>
    set((state) => ({
      results: { ...state.results, [tabId]: result },
      isLoading: { ...state.isLoading, [tabId]: false },
      errors: { ...state.errors, [tabId]: null },
    })),

  setLoading: (tabId, loading) =>
    set((state) => ({
      isLoading: { ...state.isLoading, [tabId]: loading },
      errors: loading ? { ...state.errors, [tabId]: null } : state.errors,
    })),

  setError: (tabId, error) =>
    set((state) => ({
      errors: { ...state.errors, [tabId]: error },
      isLoading: { ...state.isLoading, [tabId]: false },
    })),

  clearResult: (tabId) =>
    set((state) => ({
      results: { ...state.results, [tabId]: undefined as any },
      errors: { ...state.errors, [tabId]: null },
    })),
}));
```

---

## 6. 模块五：Schema 浏览

### 6.1 UI 界面设计

```
┌─────────────────────────┐
│  📁 数据库结构            │
│  ┌─────────────────────┐ │
│  │ ▼ 📦 public         │ │  ← Schema
│  │   ▼ 📋 users        │ │  ← 表
│  │     🔑 id (serial)  │ │  ← 主键列
│  │     📝 username     │ │
│  │     📧 email        │ │
│  │     📅 created_at   │ │
│  │   ▶ 📋 orders       │ │
│  │   ▶ 📋 products     │ │
│  │   ▶ ⚡ get_stats()  │ │  ← 函数
│  │ ▶ 📦 audit          │ │
│  └─────────────────────┘ │
└─────────────────────────┘
```

### 6.2 Schema 查询 SQL

```typescript
// 获取所有 Schema
const GET_SCHEMAS = `
  SELECT schema_name
  FROM information_schema.schemata
  WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
  ORDER BY schema_name;
`;

// 获取指定 Schema 下的所有表
const GET_TABLES = `
  SELECT table_name, table_type
  FROM information_schema.tables
  WHERE table_schema = $1
  ORDER BY table_name;
`;

// 获取指定表的列信息
const GET_COLUMNS = `
  SELECT
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length,
    udt_name,
    ordinal_position,
    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
  FROM information_schema.columns c
  LEFT JOIN (
    SELECT ku.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage ku
      ON tc.constraint_name = ku.constraint_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = $1
      AND tc.table_name = $2
  ) pk ON c.column_name = pk.column_name
  WHERE c.table_schema = $1
    AND c.table_name = $2
  ORDER BY c.ordinal_position;
`;

// 获取指定表的索引
const GET_INDEXES = `
  SELECT
    indexname,
    indexdef
  FROM pg_indexes
  WHERE schemaname = $1
    AND tablename = $2
  ORDER BY indexname;
`;

// 获取指定 Schema 下的函数
const GET_FUNCTIONS = `
  SELECT
    p.proname AS function_name,
    pg_get_function_result(p.oid) AS return_type,
    pg_get_function_arguments(p.oid) AS arguments
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = $1
    AND p.prokind = 'f'
  ORDER BY p.proname;
`;
```

### 6.3 Schema 树组件

**文件：`src/renderer/src/components/schema/SchemaTree.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Table, Key, Columns, FunctionSquare, Database } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface SchemaNode {
  name: string;
  type: 'schema' | 'table' | 'column' | 'function';
  children?: SchemaNode[];
  icon?: React.ReactNode;
  metadata?: Record<string, unknown>;
}

interface SchemaTreeProps {
  connectionId: string;
  onSelectTable?: (schema: string, table: string) => void;
}

export function SchemaTree({ connectionId, onSelectTable }: SchemaTreeProps) {
  const [tree, setTree] = useState<SchemaNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // 加载 Schema 列表
  const loadSchemas = useCallback(async () => {
    setLoading(true);
    try {
      const schemas = await window.electronAPI.db.getSchemas(connectionId);
      const nodes: SchemaNode[] = schemas.map((s: string) => ({
        name: s,
        type: 'schema' as const,
        icon: <Database className="h-3.5 w-3.5 text-blue-400" />,
        children: [],
      }));
      setTree(nodes);
    } catch (error) {
      console.error('加载 Schema 失败:', error);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  // 加载 Schema 下的表和函数
  const loadSchemaChildren = useCallback(async (schemaName: string) => {
    try {
      const [tables, functions] = await Promise.all([
        window.electronAPI.db.getTables(connectionId, schemaName),
        window.electronAPI.db.getFunctions(connectionId, schemaName),
      ]);

      const tableNodes: SchemaNode[] = Array.isArray(tables)
        ? tables.map((t: any) => ({
            name: t.table_name || t,
            type: 'table' as const,
            icon: <Table className="h-3.5 w-3.5 text-green-400" />,
            children: [],
          }))
        : [];

      const funcNodes: SchemaNode[] = Array.isArray(functions)
        ? functions.map((f: any) => ({
            name: f.function_name || f,
            type: 'function' as const,
            icon: <FunctionSquare className="h-3.5 w-3.5 text-purple-400" />,
            metadata: f,
          }))
        : [];

      return [...tableNodes, ...funcNodes];
    } catch (error) {
      console.error('加载 Schema 子节点失败:', error);
      return [];
    }
  }, [connectionId]);

  // 加载表的列
  const loadTableColumns = useCallback(async (schemaName: string, tableName: string) => {
    try {
      const columns = await window.electronAPI.db.getColumns(
        connectionId, schemaName, tableName
      );
      return Array.isArray(columns)
        ? columns.map((c: any) => ({
            name: c.column_name || c,
            type: 'column' as const,
            icon: c.is_primary_key ? (
              <Key className="h-3 w-3 text-yellow-400" />
            ) : (
              <Columns className="h-3 w-3 text-muted-foreground" />
            ),
            metadata: c,
          }))
        : [];
    } catch (error) {
      console.error('加载列失败:', error);
      return [];
    }
  }, [connectionId]);

  const handleToggle = async (node: SchemaNode, parentPath: string) => {
    const path = `${parentPath}/${node.name}`;

    if (expanded.has(path)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      return;
    }

    setExpanded((prev) => new Set(prev).add(path));

    // 懒加载子节点
    if (node.type === 'schema' && (!node.children || node.children.length === 0)) {
      const children = await loadSchemaChildren(node.name);
      setTree((prev) =>
        prev.map((n) => (n.name === node.name ? { ...n, children } : n))
      );
    } else if (node.type === 'table' && (!node.children || node.children.length === 0)) {
      const parentSchema = parentPath;
      const children = await loadTableColumns(parentSchema, node.name);
      setTree((prev) =>
        prev.map((s) => ({
          ...s,
          children: s.children?.map((t) =>
            t.name === node.name ? { ...t, children } : t
          ),
        }))
      );
    }
  };

  const handleDoubleClick = (node: SchemaNode, parentPath: string) => {
    if (node.type === 'table') {
      onSelectTable?.(parentPath, node.name);
    }
  };

  const renderNode = (node: SchemaNode, parentPath: string, level: number) => {
    const path = `${parentPath}/${node.name}`;
    const isExpanded = expanded.has(path);
    const hasChildren = node.type === 'schema' || node.type === 'table';

    return (
      <div key={path}>
        <div
          className="flex items-center gap-1 py-0.5 px-1 cursor-pointer hover:bg-muted rounded text-sm"
          style={{ paddingLeft: `${level * 12 + 4}px` }}
          onClick={() => hasChildren && handleToggle(node, parentPath)}
          onDoubleClick={() => handleDoubleClick(node, parentPath)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )
          ) : (
            <span className="w-3" />
          )}
          {node.icon}
          <span className="truncate">{node.name}</span>
          {node.metadata?.data_type && (
            <span className="text-xs text-muted-foreground ml-auto">
              {String(node.metadata.data_type)}
            </span>
          )}
        </div>

        {isExpanded && node.children?.map((child) =>
          renderNode(child, path, level + 1)
        )}
      </div>
    );
  };

  useEffect(() => {
    if (connectionId) {
      loadSchemas();
    }
  }, [connectionId, loadSchemas]);

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">
          数据库结构
        </div>
        {loading ? (
          <div className="space-y-2 px-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          tree.map((node) => renderNode(node, '', 0))
        )}
      </div>
    </ScrollArea>
  );
}
```

---

## 7. 模块六：数据导入导出

### 7.1 UI 界面设计

#### 导出对话框

```
┌──────────────────────────────────────┐
│  导出数据                        [X] │
│  ┌──────────────────────────────────┐│
│  │ 导出格式                          ││
│  │ ○ CSV  ○ JSON  ○ Excel  ○ SQL   ││
│  │                                  ││
│  │ 编码                             ││
│  │ [UTF-8_______________▼]          ││
│  │                                  ││
│  │ ☑ 包含表头                       ││
│  │ ☐ 导出所有行（默认仅导出当前页）  ││
│  │                                  ││
│  │ 保存路径                         ││
│  │ [/home/user/export.csv] [浏览]   ││
│  └──────────────────────────────────┘│
│              [取消]    [导出]         │
└──────────────────────────────────────┘
```

#### 导入对话框

```
┌──────────────────────────────────────┐
│  导入数据                        [X] │
│  ┌──────────────────────────────────┐│
│  │ 目标表                           ││
│  │ [public.users___________▼]       ││
│  │                                  ││
│  │ 导入文件                         ││
│  │ [/home/user/data.csv] [浏览]     ││
│  │                                  ││
│  │ 文件格式                         ││
│  │ ○ CSV (自动检测)                 ││
│  │                                  ││
│  │ 选项                             ││
│  │ ☑ 包含表头                       ││
│  │ 分隔符  [,] 引号  ["] 转义 [\]   ││
│  │                                  ││
│  │ 冲突处理                         ││
│  │ ○ 跳过  ○ 更新  ○ 报错          ││
│  └──────────────────────────────────┘│
│  ┌──────────────────────────────────┐│
│  │ ████████████░░░░░░░░ 65%          ││
│  │ 已导入 650 / 1000 行              ││
│  └──────────────────────────────────┘│
│              [取消]    [导入]         │
└──────────────────────────────────────┘
```

### 7.2 关键依赖

```bash
pnpm add exceljs json2csv
```

### 7.3 导出服务实现

**文件：`src/renderer/src/services/exportService.ts`**

```typescript
import ExcelJS from 'exceljs';

export type ExportFormat = 'csv' | 'json' | 'excel' | 'sql';

interface ExportOptions {
  format: ExportFormat;
  encoding?: string;
  includeHeaders?: boolean;
  tableName?: string;       // SQL 导出时需要
  delimiter?: string;       // CSV 分隔符
}

class ExportService {
  /**
   * 导出数据
   */
  async exportData(
    columns: { name: string }[],
    rows: Record<string, unknown>[],
    options: ExportOptions
  ): Promise<Blob> {
    switch (options.format) {
      case 'csv':
        return this.exportCSV(columns, rows, options);
      case 'json':
        return this.exportJSON(rows);
      case 'excel':
        return this.exportExcel(columns, rows);
      case 'sql':
        return this.exportSQL(columns, rows, options.tableName || 'table');
      default:
        throw new Error(`不支持的导出格式: ${options.format}`);
    }
  }

  /**
   * 导出为 CSV
   */
  private exportCSV(
    columns: { name: string }[],
    rows: Record<string, unknown>[],
    options: ExportOptions
  ): Blob {
    const delimiter = options.delimiter || ',';
    const lines: string[] = [];

    if (options.includeHeaders !== false) {
      lines.push(columns.map((c) => this.escapeCSV(c.name, delimiter)).join(delimiter));
    }

    for (const row of rows) {
      lines.push(
        columns
          .map((c) => {
            const value = row[c.name];
            if (value === null || value === undefined) return '';
            return this.escapeCSV(String(value), delimiter);
          })
          .join(delimiter)
      );
    }

    const bom = '\uFEFF'; // UTF-8 BOM
    return new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  }

  /**
   * 导出为 JSON
   */
  private exportJSON(rows: Record<string, unknown>[]): Blob {
    const json = JSON.stringify(rows, null, 2);
    return new Blob([json], { type: 'application/json;charset=utf-8' });
  }

  /**
   * 导出为 Excel
   */
  private async exportExcel(
    columns: { name: string }[],
    rows: Record<string, unknown>[]
  ): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');

    // 添加表头
    sheet.columns = columns.map((col) => ({
      header: col.name,
      key: col.name,
      width: 20,
    }));

    // 表头样式
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // 添加数据
    for (const row of rows) {
      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /**
   * 导出为 SQL INSERT 语句
   */
  private exportSQL(
    columns: { name: string }[],
    rows: Record<string, unknown>[],
    tableName: string
  ): Blob {
    const colNames = columns.map((c) => `"${c.name}"`).join(', ');
    const lines: string[] = [];

    for (const row of rows) {
      const values = columns
        .map((c) => {
          const value = row[c.name];
          if (value === null || value === undefined) return 'NULL';
          if (typeof value === 'number') return String(value);
          if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
          // 字符串转义
          return `'${String(value).replace(/'/g, "''")}'`;
        })
        .join(', ');

      lines.push(`INSERT INTO "${tableName}" (${colNames}) VALUES (${values});`);
    }

    return new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  }

  private escapeCSV(value: string, delimiter: string): string {
    if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * 触发文件下载
   */
  async downloadBlob(blob: Blob, filename: string): Promise<void> {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const exportService = new ExportService();
```

### 7.4 导入服务实现

**文件：`src/renderer/src/services/importService.ts`**

```typescript
interface ImportOptions {
  tableName: string;
  schema: string;
  hasHeader: boolean;
  delimiter: string;
  quoteChar: string;
  escapeChar: string;
  onConflict: 'skip' | 'update' | 'error';
  onProgress?: (imported: number, total: number) => void;
}

interface ImportResult {
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  errors: string[];
}

class ImportService {
  /**
   * 解析 CSV 文件内容
   */
  parseCSV(content: string, options: ImportOptions): Record<string, unknown>[] {
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return [];

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === options.quoteChar) {
          if (inQuotes && line[i + 1] === options.quoteChar) {
            current += options.quoteChar;
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === options.delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = options.hasHeader
      ? parseLine(lines[0])
      : parseLine(lines[0]).map((_, i) => `column_${i + 1}`);

    const dataLines = options.hasHeader ? lines.slice(1) : lines;

    return dataLines.map((line) => {
      const values = parseLine(line);
      const row: Record<string, unknown> = {};
      headers.forEach((header, i) => {
        const value = values[i] || '';
        // 尝试类型推断
        if (value === '' || value === 'NULL' || value === 'null') {
          row[header] = null;
        } else if (/^\d+$/.test(value)) {
          row[header] = parseInt(value, 10);
        } else if (/^\d+\.\d+$/.test(value)) {
          row[header] = parseFloat(value);
        } else if (value === 'true' || value === 'TRUE') {
          row[header] = true;
        } else if (value === 'false' || value === 'FALSE') {
          row[header] = false;
        } else {
          row[header] = value;
        }
      });
      return row;
    });
  }

  /**
   * 导入数据到数据库表
   */
  async importData(
    fileContent: string,
    options: ImportOptions
  ): Promise<ImportResult> {
    const rows = this.parseCSV(fileContent, options);
    const result: ImportResult = {
      totalRows: rows.length,
      importedRows: 0,
      skippedRows: 0,
      errorRows: 0,
      errors: [],
    };

    const columns = Object.keys(rows[0] || {});
    if (columns.length === 0) {
      throw new Error('文件中没有数据');
    }

    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const colNames = columns.map((c) => `"${c}"`).join(', ');

    const onConflictClause =
      options.onConflict === 'update'
        ? ` ON CONFLICT DO UPDATE SET ${columns.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ')}`
        : options.onConflict === 'skip'
        ? ' ON CONFLICT DO NOTHING'
        : '';

    for (let i = 0; i < rows.length; i++) {
      try {
        const values = columns.map((c) => rows[i][c]);
        const sql = `INSERT INTO "${options.schema}"."${options.tableName}" (${colNames}) VALUES (${placeholders})${onConflictClause}`;
        await window.electronAPI.db.execute(sql, values);
        result.importedRows++;
      } catch (error: any) {
        if (options.onConflict === 'error') {
          result.errorRows++;
          result.errors.push(`第 ${i + 1} 行: ${error.message}`);
        } else {
          result.skippedRows++;
        }
      }

      options.onProgress?.(i + 1, rows.length);
    }

    return result;
  }
}

export const importService = new ImportService();
```

---

## 8. 应用整体布局

### 8.1 主界面布局

```
┌──────────────────────────────────────────────────────────────────┐
│  File  Edit  View  Query  Tools  Help                  [−][□][×] │  ← 菜单栏
├──────────┬────────────────────────────────┬──────────────────────┤
│          │  [▶ 执行] [⏹] [🔽] [📋] [📂]  │                      │
│ 连接列表  │────────────────────────────────│   AI 助手面板        │
│          │                                │   (Phase 4 启用)     │
│ 🟢 生产库 │  SQL 编辑器区域                │                      │
│ 🟡 测试库 │  (Monaco Editor)              │  ┌─────────────────┐ │
│          │                                │  │ AI 对话          │ │
│          │                                │  │                 │ │
│──────────│                                │  │ 用户: 查询所有   │ │
│          │                                │  │ 活跃用户        │ │
│ 数据库结构│                                │  │                 │ │
│          │                                │  │ AI: 生成 SQL... │ │
│ 📦 public│                                │  │                 │ │
│  📋 users│                                │  └─────────────────┘ │
│  📋 orders                               │                      │
│  📋 products                             │                      │
│          │────────────────────────────────│                      │
│          │  查询结果区域                  │                      │
│          │  ┌──────────────────────────┐  │                      │
│          │  │ id │ name │ email │ ...  │  │                      │
│          │  │────┼──────┼───────┼───── │  │                      │
│          │  │ 1  │ Alice│ a@e.. │ ...  │  │                      │
│          │  └──────────────────────────┘  │                      │
│          │  <<  < 1/10 >  >>  [100 ▼]    │                      │
├──────────┴────────────────────────────────┴──────────────────────┤
│  🟢 已连接: postgres@localhost:5432  |  PostgreSQL 16.2  |  UTF-8│  ← 状态栏
└──────────────────────────────────────────────────────────────────┘
```

### 8.2 布局实现

**文件：`src/renderer/src/components/layout/AppShell.tsx`**

```tsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { StatusBar } from './StatusBar';
import { SqlEditor } from '../editor/SqlEditor';
import { ResultTable } from '../result/ResultTable';
import { SchemaTree } from '../schema/SchemaTree';
import { useEditorStore } from '@/store/editorStore';
import { useQueryStore } from '@/store/queryStore';
import { useConnectionStore } from '@/store/connectionStore';

export function AppShell() {
  const { tabs, activeTabId, updateTabContent } = useEditorStore();
  const { results, isLoading, errors } = useQueryStore();
  const { activeId } = useConnectionStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex flex-col h-screen">
      {/* 顶部标签栏 */}
      <TabBar />

      <PanelGroup direction="horizontal" className="flex-1">
        {/* 左侧边栏 */}
        <Panel defaultSize={20} minSize={15} maxSize={30}>
          <Sidebar />
        </Panel>
        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

        {/* 中间主区域 */}
        <Panel defaultSize={60} minSize={30}>
          <PanelGroup direction="vertical">
            {/* SQL 编辑器 */}
            <Panel defaultSize={50} minSize={20}>
              <SqlEditor
                value={activeTab?.content ?? ''}
                onChange={(value) =>
                  activeTabId && updateTabContent(activeTabId, value)
                }
                onExecute={() => {
                  // 执行查询逻辑
                }}
              />
            </Panel>
            <PanelResizeHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" />

            {/* 查询结果 */}
            <Panel defaultSize={50} minSize={20}>
              {activeTabId && (
                <ResultTable
                  columns={results[activeTabId]?.columns ?? []}
                  rows={results[activeTabId]?.rows ?? []}
                  isLoading={isLoading[activeTabId]}
                />
              )}
              {activeTabId && errors[activeTabId] && (
                <div className="p-4 text-red-500 bg-red-50 dark:bg-red-950/20">
                  {errors[activeTabId]}
                </div>
              )}
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

        {/* 右侧面板（Schema 浏览 / AI 面板） */}
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <SchemaTree
            connectionId={activeId ?? ''}
            onSelectTable={(schema, table) => {
              // 在编辑器中插入 SELECT 语句
            }}
          />
        </Panel>
      </PanelGroup>

      {/* 底部状态栏 */}
      <StatusBar />
    </div>
  );
}
```

---

## 9. 编辑器状态管理

**文件：`src/renderer/src/store/editorStore.ts`**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

interface EditorTab {
  id: string;
  title: string;
  content: string;
  connectionId?: string;
  filePath?: string;
  isDirty: boolean;
  createdAt: string;
}

interface EditorStore {
  tabs: EditorTab[];
  activeTabId: string | null;

  addTab: (tab?: Partial<EditorTab>) => string;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  updateTabTitle: (id: string, title: string) => void;
  markTabClean: (id: string) => void;
  setTabFilePath: (id: string, filePath: string) => void;
  getActiveTab: () => EditorTab | undefined;
}

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      addTab: (tab) => {
        const id = uuidv4();
        const newTab: EditorTab = {
          id,
          title: tab?.title ?? `查询 ${get().tabs.length + 1}`,
          content: tab?.content ?? '',
          connectionId: tab?.connectionId,
          filePath: tab?.filePath,
          isDirty: false,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id,
        }));
        return id;
      },

      removeTab: (id) =>
        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== id);
          let newActiveId = state.activeTabId;
          if (state.activeTabId === id) {
            const idx = state.tabs.findIndex((t) => t.id === id);
            newActiveId = newTabs[Math.min(idx, newTabs.length - 1)]?.id ?? null;
          }
          return { tabs: newTabs, activeTabId: newActiveId };
        }),

      setActiveTab: (id) => set({ activeTabId: id }),

      updateTabContent: (id, content) =>
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id ? { ...t, content, isDirty: true } : t
          ),
        })),

      updateTabTitle: (id, title) =>
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
        })),

      markTabClean: (id) =>
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, isDirty: false } : t)),
        })),

      setTabFilePath: (id, filePath) =>
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, filePath } : t)),
        })),

      getActiveTab: () => {
        const { tabs, activeTabId } = get();
        return tabs.find((t) => t.id === activeTabId);
      },
    }),
    {
      name: 'editor-tabs',
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({
          ...t,
          // 不持久化大内容，仅保留标题和路径
          content: t.filePath ? '' : t.content,
        })),
        activeTabId: state.activeTabId,
      }),
    }
  )
);
```

---

## 10. 依赖安装完整清单

按模块汇总所有需要安装的依赖：

```bash
# ============================================
# Phase 1: 基础框架
# ============================================
pnpm add @monaco-editor/react              # Monaco 代码编辑器
pnpm add @tanstack/react-table             # 表格组件
pnpm add @tanstack/react-virtual           # 虚拟滚动
pnpm add react-resizable-panels            # 可拖拽面板
pnpm add electron-log                      # 日志系统
pnpm add uuid                              # 唯一 ID 生成
pnpm add @types/uuid -D

# shadcn/ui 组件（按需安装）
pnpm dlx shadcn@latest add button input dialog select tabs \
  dropdown-menu tooltip scroll-area separator badge card \
  table textarea context-menu command popover sonner skeleton

# ============================================
# Phase 2: PostgreSQL 核心
# ============================================
pnpm add pg                                # PostgreSQL 驱动
pnpm add @types/pg -D
pnpm add sql-formatter                     # SQL 格式化
pnpm add node-sql-parser                   # SQL 解析器

# ============================================
# Phase 3: 高级功能
# ============================================
pnpm add exceljs                           # Excel 导出
pnpm add json2csv                          # JSON 转 CSV
pnpm add recharts                          # 图表库
pnpm add electron-updater                  # 自动更新
pnpm add electron-store                    # 持久化配置

# ============================================
# Phase 4: AI 集成（预留）
# ============================================
pnpm add openai                            # OpenAI SDK
pnpm add @anthropic-ai/sdk                 # Anthropic SDK（可选）
pnpm add eventsource-parser                # SSE 解析
```

---

## 11. 开发顺序与依赖关系

```
第 1 步：目录结构 + 基础组件安装
    │
    ▼
第 2 步：AppShell 布局 + 标签页系统
    │
    ▼
第 3 步：PostgreSQL 适配器 + 连接管理 (IPC)
    │
    ├──────────────────────────────────────┐
    ▼                                      ▼
第 4 步：SQL 编辑器 (Monaco)        第 5 步：Schema 浏览
    │                                      │
    ▼                                      │
第 6 步：查询执行 + 结果展示 ◄──────────────┘
    │
    ▼
第 7 步：数据导入导出
    │
    ▼
第 8 步：查询历史 + 高级功能
    │
    ▼
第 9 步：AI 集成（Phase 4）
```

每个步骤完成后应确保：
- 代码可编译通过 (`pnpm run typecheck`)
- 应用可正常启动 (`pnpm run dev`)
- 核心功能可手动验证