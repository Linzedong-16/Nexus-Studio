import { Cable, FolderKanban, History, ShieldCheck } from 'lucide-react'
import HomeSkeleton from '@/components/common/HomeSkeleton'

/**
 * Work 模式默认首页（占位骨架，FR-019/020）
 * 后续迭代替换为连接管理工作区
 */
export default function WorkHomePage(): React.JSX.Element {
  return (
    <HomeSkeleton
      title="Work with DB Client"
      inputPlaceholder="管理你的数据库连接与工作区…（骨架占位）"
      quickActions={[
        { icon: Cable, label: '连接管理' },
        { icon: FolderKanban, label: '工作区' },
        { icon: History, label: '最近使用' },
        { icon: ShieldCheck, label: '凭据管理' }
      ]}
    />
  )
}
