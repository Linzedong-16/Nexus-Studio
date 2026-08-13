import { useLocation } from 'react-router'

/** 判断当前是否在 Code 模式下 */
export function useInCodeMode(): boolean {
  const location = useLocation()
  return location.pathname.startsWith('/code')
}
