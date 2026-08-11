/**
 * 数据库日志器
 *
 * 全局单例，记录数据库驱动/连接生命周期与实际执行的 SQL 语句，
 * 供渲染进程的日志面板（Ctrl+J）读取历史（getBacklog）与订阅实时推送（onLog）。
 */
import { EventEmitter } from 'events'
import type { DbLogCategory, DbLogEntry, DbLogLevel } from '../../renderer/src/types/ipc'

const MAX_BACKLOG = 500

class DbLogger extends EventEmitter {
  private backlog: DbLogEntry[] = []
  private nextId = 1

  log(
    level: DbLogLevel,
    category: DbLogCategory,
    message: string,
    meta?: { connectionId?: string; database?: string }
  ): void {
    const entry: DbLogEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      level,
      category,
      message,
      ...meta
    }
    this.backlog.push(entry)
    if (this.backlog.length > MAX_BACKLOG) {
      this.backlog.shift()
    }
    this.emit('log', entry)
  }

  getBacklog(): DbLogEntry[] {
    return this.backlog
  }

  onLog(listener: (entry: DbLogEntry) => void): () => void {
    this.on('log', listener)
    return () => this.off('log', listener)
  }
}

export const dbLogger = new DbLogger()
