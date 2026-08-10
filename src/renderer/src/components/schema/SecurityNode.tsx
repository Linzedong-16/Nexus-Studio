import {
  ChevronDown,
  ChevronRight,
  KeyRound,
  Loader2,
  RefreshCw,
  Shield,
  User,
  UserCog,
  Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConnectionStore } from '@/store/connectionStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import type { RoleInfo } from '@/types/ipc'

interface SecurityNodeProps {
  connectionId: string
  connectionName: string
}

/**
 * 服务器级 Security 节点（Users / Roles）
 *
 * 角色是 PostgreSQL 集群级安全对象，与数据库列表平级、不属于任何单一数据库。
 * 展开时一次性加载全部角色，Users（可登录角色）与 Roles（全部角色）
 * 两个子分组均从同一份角色列表按 `canLogin` 分流展示，不重复请求。
 *
 * Roles 分组仅作角色清单展示，不可点击；Users 分组下的可登录角色可点击，
 * 打开一个按该角色过滤的表权限查询标签页（复用 query 标签页，而非业务表数据浏览）。
 */
export default function SecurityNode({
  connectionId,
  connectionName
}: SecurityNodeProps): React.JSX.Element {
  const security = useConnectionStore((s) => s.connections[connectionId]?.security)
  const toggleSecurityNode = useConnectionStore((s) => s.toggleSecurityNode)
  const loadRoles = useConnectionStore((s) => s.loadRoles)
  const activeDatabase = useConnectionStore((s) => s.connections[connectionId]?.activeDatabase)
  const firstDatabase = useConnectionStore(
    (s) => s.connections[connectionId]?.databases?.[0]?.name
  )
  const configDatabase = useConnectionStore((s) => s.connections[connectionId]?.config.database)
  const database = activeDatabase ?? firstDatabase ?? configDatabase

  const expanded = security?.expanded ?? false
  const roles = security?.roles
  const loading = security?.rolesLoading ?? false
  const error = security?.rolesError

  const handleToggle = (): void => toggleSecurityNode(connectionId)
  const handleRefresh = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void loadRoles(connectionId, { force: true })
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        className="group flex w-full items-center gap-1 px-2 py-0.5 text-left text-[13px] hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <Shield className="size-3.5 shrink-0 text-rose-500" />
        <span className="truncate">Security</span>
        {expanded && (
          <RefreshCw
            className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
            onClick={handleRefresh}
          />
        )}
      </button>

      {expanded && (
        <div>
          {loading && (
            <div className="flex items-center gap-1.5 px-2 py-1 pl-8 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              加载中…
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center gap-1.5 px-2 py-1 pl-8 text-xs text-destructive">
              <span className="truncate">{error}</span>
              <Button variant="ghost" size="sm" className="h-5 gap-1 px-1" onClick={handleRefresh}>
                <RefreshCw className="size-3" />
                重试
              </Button>
            </div>
          )}
          {!loading && !error && roles && (
            <>
              <SecurityGroup
                connectionId={connectionId}
                connectionName={connectionName}
                database={database}
                label="Users"
                icon={Users}
                roles={roles.filter((r) => r.canLogin)}
                clickable
              />
              <SecurityGroup
                connectionId={connectionId}
                connectionName={connectionName}
                database={database}
                label="Roles"
                icon={UserCog}
                roles={roles}
                clickable={false}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface SecurityGroupProps {
  connectionId: string
  connectionName: string
  database?: string
  label: 'Users' | 'Roles'
  icon: typeof Users
  roles: RoleInfo[]
  /** 该分组下的角色行是否可点击打开标签页（Roles 分组仅作清单展示） */
  clickable: boolean
}

function SecurityGroup({
  connectionId,
  connectionName,
  database,
  label,
  icon: Icon,
  roles,
  clickable
}: SecurityGroupProps): React.JSX.Element {
  const group = label === 'Users' ? 'users' : 'roles'
  const expanded = useConnectionStore((s) =>
    group === 'users'
      ? (s.connections[connectionId]?.security?.usersGroupExpanded ?? false)
      : (s.connections[connectionId]?.security?.rolesGroupExpanded ?? false)
  )
  const toggleSecurityGroup = useConnectionStore((s) => s.toggleSecurityGroup)

  const handleToggle = (): void => toggleSecurityGroup(connectionId, group)

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-1 px-2 py-0.5 pl-6 text-left text-[13px] hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <Icon className="size-3.5 shrink-0 text-amber-500" />
        <span className="truncate">{label}</span>
        {roles.length > 0 && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {roles.length}
          </span>
        )}
      </button>

      {expanded && (
        <div>
          {roles.length === 0 && (
            <div className="px-2 py-1 pl-10 text-xs text-muted-foreground">暂无数据</div>
          )}
          {roles.map((role) => (
            <RoleRow
              key={role.name}
              connectionId={connectionId}
              connectionName={connectionName}
              database={database}
              role={role}
              clickable={clickable}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RoleRow({
  connectionId,
  connectionName,
  database,
  role,
  clickable
}: {
  connectionId: string
  connectionName: string
  database?: string
  role: RoleInfo
  clickable: boolean
}): React.JSX.Element {
  const openTableTab = useWorkspaceStore((s) => s.openTableTab)

  const attrs = [
    role.isSuperuser && 'Superuser',
    role.canLogin && 'Can login',
    role.canCreateDb && 'Create DB',
    role.canCreateRole && 'Create role',
    role.isReplication && 'Replication'
  ].filter(Boolean)

  const content = (
    <>
      {role.canLogin ? (
        <User className="size-3.5 shrink-0 text-blue-500" />
      ) : (
        <Users className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{role.name}</span>
      {role.isSuperuser && <KeyRound className="size-3 shrink-0 text-amber-500" />}
    </>
  )

  if (!clickable) {
    return (
      <div
        title={attrs.join(' · ') || undefined}
        className="flex items-center gap-1.5 px-2 py-0.5 pl-10 text-[13px] text-muted-foreground"
      >
        {content}
      </div>
    )
  }

  const handleOpenPrivileges = (): void => {
    if (!database) return
    const escapedName = role.name.replace(/'/g, "''")
    openTableTab({
      connectionId,
      connectionName,
      database,
      schema: 'information_schema',
      table: 'table_privileges',
      filter: `grantee = '${escapedName}'`,
      breadcrumb: `Security · Users · ${role.name}`
    })
  }

  return (
    <button
      type="button"
      onClick={handleOpenPrivileges}
      disabled={!database}
      title={attrs.join(' · ') || undefined}
      className="flex w-full items-center gap-1.5 px-2 py-0.5 pl-10 text-left text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
    >
      {content}
    </button>
  )
}
