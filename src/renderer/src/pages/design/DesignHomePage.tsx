import { BarChart3, Boxes, GitBranch, Workflow } from 'lucide-react'
import HomeSkeleton from '@/components/common/HomeSkeleton'

/**
 * Design 模式默认首页（占位骨架，FR-019/020）
 * 后续迭代替换为数据模型设计工作区
 */
export default function DesignHomePage(): React.JSX.Element {
  return (
    <HomeSkeleton
      title="Design with DB Client"
      inputPlaceholder="设计表结构、关系与可视化模型…（骨架占位）"
      quickActions={[
        { icon: Boxes, label: '模型设计' },
        { icon: Workflow, label: 'ER 图' },
        { icon: GitBranch, label: 'Schema 对比' },
        { icon: BarChart3, label: '数据可视化' }
      ]}
    />
  )
}
