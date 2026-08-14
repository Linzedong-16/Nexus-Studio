import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ToolExecutionResult } from '../../../renderer/src/types/agent'

export type { ToolExecutionResult }

/**
 * 标准化工具定义：`inputSchema` 同时用于运行时校验与派生 JSON Schema（供模型 function-calling 使用），
 * 避免"校验规则"与"讲给模型的工具说明"出现两份不同源的定义
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 无类型参数时需要 any 才能让不同工具的具体输入类型协变地放入同一个异构集合（unknown 会因 execute 参数的逆变位置报错）
export interface ToolDefinition<TInput = any, TOutput = any> {
  /** 全局唯一，格式为 `模块.动作`，如 `schema.listTables` */
  name: string
  /** 面向模型的功能描述，用于 function-calling 的 `description` 字段 */
  description: string
  /** 是否会修改数据库数据/结构；`true` 时 ReAct 循环在执行前需暂停等待用户确认 */
  mutates: boolean
  inputSchema: z.ZodType<TInput>
  execute: (input: TInput) => Promise<TOutput>
}

/**
 * 从 zod schema 派生出 DeepSeek function-calling 所需的 JSON Schema
 * @param schema 工具的输入参数 zod schema
 * @returns 符合 JSON Schema 规范的普通对象
 */
export function buildInputJsonSchema(schema: z.ZodType): object {
  return zodToJsonSchema(schema, { target: 'openApi3' })
}
