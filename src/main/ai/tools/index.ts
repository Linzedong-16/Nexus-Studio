import { toolRegistry } from './registry'
import { schemaTools } from './schemaTools'
import { sqlTools } from './sqlTools'
import { fileTools } from './fileTools'

/** 应用启动期注册全部标准化工具，供 ReAct 循环与 `agent:run-tool` 共用 */
for (const tool of [...schemaTools, ...sqlTools, ...fileTools]) {
  toolRegistry.registerTool(tool)
}

export { toolRegistry }
