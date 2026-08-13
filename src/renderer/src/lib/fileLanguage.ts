/**
 * 文件扩展名 → Monaco language id 映射
 */

/** 文件扩展名 → Monaco language id 映射表 */
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  html: 'html',
  css: 'css',
  py: 'python',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'pgsql'
}

/** 根据文件名后缀推断 Monaco language id，未识别的扩展名回退为 `plaintext` */
export function languageFromFileName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1) return 'plaintext'
  const ext = fileName.slice(dotIndex + 1).toLowerCase()
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'plaintext'
}
