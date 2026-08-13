import ExplorerLayout from '@/components/layout/ExplorerLayout'
import ConversationView from '@/components/code/ConversationView'

/**
 * Code 模式首页：左侧共用 ExplorerLayout（连接树/文件管理），右侧为对话视图
 */
export default function CodeHomePage(): React.JSX.Element {
  return (
    <ExplorerLayout>
      <ConversationView />
    </ExplorerLayout>
  )
}
