/**
 * 查询结果行数上限
 *
 * 采用"先物化再裁剪"策略：驱动层已将结果一次性物化到内存后，
 * 再对超过上限的部分进行裁剪，避免结果集无限增长拖累应用内存与渲染性能。
 */

/** 查询结果预览展示的最大行数 */
export const MAX_RESULT_ROWS = 50_000

/**
 * 按上限裁剪行数组
 *
 * @param rows - 原始行数组（裁剪前）
 * @param limit - 行数上限
 * @returns 裁剪后的行数组与是否发生了截断
 */
export function truncateRows<T>(rows: T[], limit: number): { rows: T[]; truncated: boolean } {
  if (rows.length <= limit) {
    return { rows, truncated: false }
  }
  return { rows: rows.slice(0, limit), truncated: true }
}
