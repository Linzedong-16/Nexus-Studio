/**
 * Markdown 渲染性能工具集
 *
 * 针对流式输出场景的核心优化策略：
 * 1. 流式阶段使用哈希桶稳定 key，避免逐 token 挂载 ReactMarkdown 导致 AST 重解析
 * 2. 完成态 key 直接基于内容长度，确保内容变化时正确更新
 * 3. RAF 批量更新缓冲区 — 将多个 SSE 增量合并到同一帧提交，减少 Zustand set() 调用次数
 */

/** 流式阶段 key 的分桶粒度：每 N 字符生成一个新 key */
const STREAMING_KEY_BUCKET = 32

/** RAF 批量更新缓冲的最短刷新间隔（ms），确保内容不"迟滞" */
const RAF_FLUSH_MS = 16 // 1 frame at 60fps

/**
 * 流式阶段稳定 key
 *
 * 原理：对 content 取取 64 字符哈希 + 字符长度分桶（每 STREAMING_KEY_BUCKET 字符一档），
 * 使得 ReactMarkdown 不会因逐 token 追加而重新挂载，仅在内容足够积累时才触发一次 re-render。
 *
 * @param src - Markdown 文本内容
 * @returns 稳定 key 字符串
 */
export function streamingMarkdownKey(src: string): string {
  const bucket = Math.floor(src.length / STREAMING_KEY_BUCKET)
  return `stream:${bucket}`
}

/**
 * 完成态（非流式）稳定 key
 *
 * 只基于内容长度，不提取前缀以免在编辑/历史切换场景下产生 false-positive 复用。
 *
 * @param src - Markdown 文本内容
 * @returns 稳定 key 字符串
 */
export function completedMarkdownKey(src: string): string {
  return `done:${src.length}`
}

/** 累计内容 + 最近一次 flush 的时间戳 */
interface RafBuffer {
  text: string
  lastFlushAt: number
  scheduled: boolean
}

/**
 * 创建一个 RAF 批量更新缓冲区
 *
 * 每次 `append(delta)` 累积文本到缓冲区，在下一帧统一调用 `flush(str)`，
 * 将本帧内所有 SSE 增量合并为一次 Zustand set()，避免每个 token 触发一次 React 重渲染。
 *
 * @param flush - 累积后的完整文本回调
 * @returns `{ append, reset }`
 */
export function createRafBatcher(flush: (fullText: string) => void): {
  append: (delta: string) => void
  reset: () => void
} {
  const buf: RafBuffer = { text: '', lastFlushAt: 0, scheduled: false }

  const doFlush = (): void => {
    buf.scheduled = false
    buf.lastFlushAt = performance.now()
    const text = buf.text
    if (text.length > 0) flush(text)
  }

  return {
    append: (delta: string) => {
      const now = performance.now()
      buf.text += delta

      // 如果距上次刷新已超过 RAF_FLUSH_MS（防止内容"迟滞"），立即同步刷新
      if (now - buf.lastFlushAt >= RAF_FLUSH_MS && !buf.scheduled) {
        doFlush()
        return
      }

      if (!buf.scheduled) {
        buf.scheduled = true
        requestAnimationFrame(doFlush)
      }
    },
    reset: () => {
      buf.text = ''
      buf.lastFlushAt = 0
      buf.scheduled = false
    }
  }
}
