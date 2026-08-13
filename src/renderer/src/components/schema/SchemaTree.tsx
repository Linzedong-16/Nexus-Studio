import { ScrollArea } from '@/components/ui/scroll-area'
import { useConnectionStore } from '@/store/connectionStore'
import ServerNode from './ServerNode'

/**
 * 结构树顶层容器
 *
 * 按连接顺序渲染各服务器节点；无任何已连接服务器时展示空态引导。
 */
export default function SchemaTree(): React.JSX.Element {
  // 选择器只返回 connections 本身（引用稳定），避免 Object.keys 每次求值产生新数组导致无限重渲染
  const connections = useConnectionStore((s) => s.connections)
  const connectionIds = Object.keys(connections)

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        {connectionIds.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            <p className="mb-1">暂无已连接的服务器</p>
            <p>在左侧新建连接并“保存并连接”后显示结构</p>
          </div>
        ) : (
          <div className="py-1">
            {connectionIds.map((id) => (
              <ServerNode key={id} connectionId={id} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
