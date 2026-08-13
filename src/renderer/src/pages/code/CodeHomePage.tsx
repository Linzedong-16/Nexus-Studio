import { CodeXml, Database, FileSearch, Import, Table2 } from 'lucide-react'
import ExplorerLayout from '@/components/layout/ExplorerLayout'
import HomeSkeleton from '@/components/common/HomeSkeleton'

/**
 * Code 模式首页：左侧共用 ExplorerLayout（连接树/文件管理），右侧为占位骨架
 */
export default function CodeHomePage(): React.JSX.Element {
  return (
    <ExplorerLayout>
      <HomeSkeleton
        titleIcon={CodeXml}
        title="Code with Nexus Studio"
        inputPlaceholder="帮你编写 SQL、优化查询、分析数据结构…（骨架占位）"
        quickActions={[
          { icon: Database, label: '新建连接' },
          { icon: FileSearch, label: 'SQL 查询' },
          { icon: Table2, label: '数据浏览' },
          { icon: Import, label: '导入导出' }
        ]}
      />
    </ExplorerLayout>
  )
}