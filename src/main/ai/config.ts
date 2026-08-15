/** Agent 模型提供方配置：`ModelProviderConfig` 的加载与解析 */

import { DEEPSEEK_MODEL_OPTIONS } from '../../renderer/src/types/agent'
import type { StoredModelProviderConfig } from '../../renderer/src/types/ipc'
import { configStore } from '../config/store'
import { decryptPassword } from '../config/crypto'

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
const DEFAULT_MODEL = DEEPSEEK_MODEL_OPTIONS[0]
const DEFAULT_MAX_ITERATIONS = 8
const DEFAULT_REQUEST_TIMEOUT_MS = 60000

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * 加载 DeepSeek 模型提供方配置
 *
 * `apiKey`/`baseURL`/`model` 完全由用户在设置面板"模型配置"页保存的内容决定
 * （持久化于 `configStore` 的 `deepseekConfig`，`apiKey` 经 `safeStorage` 加密），
 * 不依赖 `.env` 文件——避免终端用户需要理解/编辑 `.env` 才能完成配置。
 * `maxIterations`/`requestTimeoutMs` 暂未在设置面板开放，仍从环境变量读取（含默认值）。
 *
 * @returns 解析后的 `ModelProviderConfig`
 */
export function loadModelProviderConfig(): ModelProviderConfig {
  const stored = configStore.get('deepseekConfig') as StoredModelProviderConfig | undefined
  return {
    provider: 'deepseek',
    apiKey: stored?.encryptedApiKey ? decryptPassword(stored.encryptedApiKey) : null,
    baseURL: stored?.baseURL?.trim() || DEFAULT_BASE_URL,
    model: stored?.model?.trim() || DEFAULT_MODEL,
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
