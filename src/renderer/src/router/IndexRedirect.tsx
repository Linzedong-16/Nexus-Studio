import { Navigate } from 'react-router'
import { MODES } from '@/config/modes'
import { useShellStore } from '@/store/shellStore'

/** 根路径重定向：读取持久化的最近模式（FR-008） */
export default function IndexRedirect(): React.JSX.Element {
  const lastMode = useShellStore((s) => s.lastMode)
  const target = MODES.find((m) => m.id === lastMode)?.basePath ?? MODES[0].basePath
  return <Navigate to={target} replace />
}
