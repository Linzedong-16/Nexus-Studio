import type { z } from 'zod'
import type { AgentToolSummary, ToolExecutionResult } from '../../../renderer/src/types/agent'
import { buildInputJsonSchema, type ToolDefinition } from './types'

/**
 * 工具注册表：全局单例，负责登记所有标准化工具并提供统一的调用入口
 */
class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  /**
   * 注册一个工具
   * @throws 当 `name` 已被占用时抛出（工具名全局唯一，属于启动期配置错误）
   */
  registerTool(def: ToolDefinition): void {
    if (this.tools.has(def.name)) {
      throw new Error(`工具名重复：${def.name}`)
    }
    this.tools.set(def.name, def)
  }

  /** 返回全部工具的展示信息，供渲染进程 `agent:list-tools` 使用 */
  list(): AgentToolSummary[] {
    return Array.from(this.tools.values()).map((def) => ({
      name: def.name,
      description: def.description,
      mutates: def.mutates,
      inputJsonSchema: buildInputJsonSchema(def.inputSchema)
    }))
  }

  /**
   * 获取指定名称的工具定义
   * @throws 当工具不存在时抛出
   */
  get(name: string): ToolDefinition {
    const def = this.tools.get(name)
    if (!def) {
      throw new Error(`未找到工具：${name}`)
    }
    return def
  }

  /**
   * 校验输入并执行工具，任何校验失败或执行异常都会被捕获为结构化错误，不向外抛出
   */
  async invoke(name: string, input: unknown): Promise<ToolExecutionResult<unknown>> {
    const def = this.get(name)
    const parsed = def.inputSchema.safeParse(input)
    if (!parsed.success) {
      return {
        status: 'error',
        error: { message: '输入参数校验失败', fieldErrors: flattenZodError(parsed.error) }
      }
    }
    try {
      const data = await def.execute(parsed.data)
      return { status: 'success', data }
    } catch (err) {
      return {
        status: 'error',
        error: { message: err instanceof Error ? err.message : String(err) }
      }
    }
  }
}

/** 将 zod 校验错误转换为 `字段路径 -> 错误信息` 的映射，供 FR-013 展示具体字段 */
function flattenZodError(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    fieldErrors[key] = issue.message
  }
  return fieldErrors
}

export const toolRegistry = new ToolRegistry()
