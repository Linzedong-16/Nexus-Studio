/**
 * 生成稳定的 Markdown key
 *
 * 使用内容长度 + 前 80 字符作为 key，对流式场景既能避免逐 token 重渲染又能捕获内容变化。
 *
 * @param src - Markdown 文本内容
 * @returns 稳定 key 字符串，同一内容的 key 相同
 */
export function markdownKey(src: string): string {
  return `${src.length}:${src.slice(0, 80)}`
}
