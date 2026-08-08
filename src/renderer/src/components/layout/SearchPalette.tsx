import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useShellStore } from '@/store/shellStore'

/**
 * 全局搜索面板骨架（FR-017）
 * 纯展示：Esc / 点击遮罩关闭（Radix Dialog 内置），路由变化自动关闭（spec Edge Case）
 */
export default function SearchPalette(): React.JSX.Element {
  const searchOpen = useShellStore((s) => s.searchOpen)
  const setSearchOpen = useShellStore((s) => s.setSearchOpen)
  const location = useLocation()

  // 任何导航动作关闭搜索面板
  useEffect(() => {
    setSearchOpen(false)
  }, [location.pathname, setSearchOpen])

  return (
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogContent className="top-[28%] gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>全局搜索</DialogTitle>
          <DialogDescription>搜索连接、表与查询</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="搜索连接、表、查询…"
            className="h-12 border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          搜索面板骨架 · 后续接入真实搜索
        </div>
      </DialogContent>
    </Dialog>
  )
}
