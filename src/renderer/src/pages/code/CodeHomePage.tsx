import { CodeXml, Database, FileSearch, Import, Table2 } from 'lucide-react'
import HomeSkeleton from '@/components/common/HomeSkeleton'

/**
 * Code 模式默认首页（占位骨架，FR-019/020）
 * 后续迭代将输入框替换为 SQL 编辑器、快捷操作接入真实动作
 */
export default function CodeHomePage(): React.JSX.Element {
  return (
    <HomeSkeleton
      titleIcon={CodeXml}
      title="Code with DB Client"
      inputPlaceholder="帮你编写 SQL、优化查询、分析数据结构…（骨架占位）"
      quickActions={[
        { icon: Database, label: '新建连接' },
        { icon: FileSearch, label: 'SQL 查询' },
        { icon: Table2, label: '数据浏览' },
        { icon: Import, label: '导入导出' }
      ]}
    />
  )
}
