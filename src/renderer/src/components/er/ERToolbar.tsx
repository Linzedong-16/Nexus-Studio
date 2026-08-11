/**
 * ER 分析画布工具栏
 *
 * 悬浮于画布右上角，提供自动布局重排与导出图片操作。
 */
import { Download, Loader2, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ERToolbarProps {
  onAutoLayout: () => void
  onExport: () => void
  isLayouting: boolean
}

export default function ERToolbar({
  onAutoLayout,
  onExport,
  isLayouting
}: ERToolbarProps): React.JSX.Element {
  return (
    <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-border bg-background/80 p-1 shadow-sm backdrop-blur-sm">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        disabled={isLayouting}
        onClick={onAutoLayout}
      >
        {isLayouting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <LayoutGrid className="size-3.5" />
        )}
        自动布局
      </Button>
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={onExport}>
        <Download className="size-3.5" />
        导出图片
      </Button>
    </div>
  )
}
