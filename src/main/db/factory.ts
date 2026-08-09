/**
 * 数据库驱动工厂
 *
 * 唯一导入具体驱动实现的地方。新增数据库类型时，
 * 只需在对应目录实现 IDatabaseDriver 并在此注册即可。
 */
import type { IDatabaseDriver } from './core/IDatabaseDriver'
import type { DatabaseType } from './core/types'
import { PostgreSQLDriver } from './driver/pg'

export function createDriver(type: DatabaseType, id: string): IDatabaseDriver {
  switch (type) {
    case 'postgresql':
      return new PostgreSQLDriver(id)
    default:
      throw new Error(`不支持的数据库类型: ${type}`)
  }
}
