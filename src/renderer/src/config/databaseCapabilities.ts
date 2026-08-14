/**
 * 数据库类型能力配置
 *
 * 声明各数据库类型在结构树中的模块清单，通用树渲染逻辑据此决定
 * 渲染哪些模块分组，不再硬编码某个数据库类型的专属分支（宪法 IV）。
 * 新增数据库类型时只需在此补充一条记录，并在其驱动中实现对应方法。
 */
import type { DatabaseType } from '@/types/ipc'
import type { DatabaseCapability } from '@/types/database'

export const DATABASE_CAPABILITIES: Record<DatabaseType, DatabaseCapability> = {
  postgresql: {
    hasSecurityModule: true,
    databaseLevelModules: ['query'],
    schemaLevelModules: ['query', 'tables', 'views', 'functions', 'procedures']
  },
  mysql: {
    hasSecurityModule: true,
    databaseLevelModules: ['query'],
    schemaLevelModules: ['query', 'tables', 'views', 'functions', 'procedures']
  }
}
