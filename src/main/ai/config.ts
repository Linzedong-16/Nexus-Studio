/** Agent 模型提供方配置：`ModelProviderConfig` 的加载与解析（data-model.md §6） */

export type ModelProviderName = 'deepseek'

export interface ModelProviderConfig {
  provider: ModelProviderName
  apiKey: string | null
  baseURL: string
  model: string
  maxIterations: number
  requestTimeoutMs: number
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-v4-flash'
const DEFAULT_MAX_ITERATIONS = 8
const DEFAULT_REQUEST_TIMEOUT_MS = 60000

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * 从 `process.env` 读取 DeepSeek 模型提供方配置
 *
 * `.env` 文件由 `src/main/index.ts` 在 `app.whenReady()` 之前通过 `dotenv.config()` 加载到
 * `process.env`，本函数只负责读取与默认值填充，不涉及文件系统。
 *
 * @returns 解析后的 `ModelProviderConfig`
 */
export function loadModelProviderConfig(): ModelProviderConfig {
  return {
    provider: 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() || null,
    baseURL: process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL,
    maxIterations: parseIntEnv(process.env.AGENT_MAX_ITERATIONS, DEFAULT_MAX_ITERATIONS),
    requestTimeoutMs: parseIntEnv(process.env.AGENT_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS)
  }
}

/**
 * 判定模型提供方是否已配置（FR-008）
 *
 * `apiKey` 为空即视为未配置，供 ReAct 循环在第一次思考前直接返回
 * `error.code = 'provider_not_configured'`，不发起任何网络调用。
 *
 * @param config - `loadModelProviderConfig()` 的返回值
 * @returns 是否已配置有效密钥
 */
export function isProviderConfigured(config: ModelProviderConfig): boolean {
  return Boolean(config.apiKey)
}
