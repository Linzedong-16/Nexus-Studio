/**
 * SQL 模板常量与模板生成函数
 *
 * 为结构树中各"添加"按钮提供预填充的 SQL 模板，
 * 支持根据上下文（schema、表名）动态填充模板内容。
 */

/** 创建操作类型 */
export type CreateActionKind =
  | 'createDatabase'
  | 'createTable'
  | 'insertRow'
  | 'createView'
  | 'createProcedure'
  | 'createFunction'

/** 模板上下文 */
export interface TemplateContext {
  schema?: string
  table?: string
}

/** 使用双引号包裹标识符，防止关键字冲突 */
function quote(name: string): string {
  return `"${name}"`
}

/** 根据操作类型和上下文生成 SQL 模板 */
export function getSqlTemplate(kind: CreateActionKind, context: TemplateContext): string {
  const schema = context.schema ?? 'public'
  const table = context.table ?? 'table_name'

  switch (kind) {
    case 'createDatabase':
      return `CREATE DATABASE database_name;\n`

    case 'createTable':
      return `CREATE TABLE ${quote(schema)}.${quote(table)} (\n  id SERIAL PRIMARY KEY,\n  ...\n);\n`

    case 'insertRow':
      return `INSERT INTO ${quote(schema)}.${quote(table)} (column1, column2)\nVALUES (value1, value2);\n`

    case 'createView':
      return `CREATE VIEW ${quote(schema)}.view_name AS\nSELECT ...;\n`

    case 'createProcedure':
      return `CREATE PROCEDURE ${quote(schema)}.procedure_name()\nLANGUAGE SQL\nAS $$\n  ...\n$$;\n`

    case 'createFunction':
      return `CREATE FUNCTION ${quote(schema)}.function_name()\nRETURNS ...\nLANGUAGE SQL\nAS $$\n  ...\n$$;\n`

    default:
      return '-- 在此输入 SQL\n'
  }
}
