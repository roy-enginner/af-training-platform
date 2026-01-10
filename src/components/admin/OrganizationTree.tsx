import React, { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRightIcon,
  ChevronDownIcon,
  BuildingOffice2Icon,
  BuildingOfficeIcon,
  UsersIcon,
  UserIcon,
  PencilIcon,
  TrashIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui'
import type { Company, Department, Group, ProfileWithRelations } from '@/types/database'

// ノードタイプ定義
export type NodeType = 'company' | 'department' | 'group' | 'user'

// ツリーノードのデータ構造
export interface TreeNodeData {
  id: string
  type: NodeType
  name: string
  isActive?: boolean
  meta?: {
    email?: string
    role?: string
    userCount?: number
    groupCount?: number
    departmentCount?: number
  }
  children?: TreeNodeData[]
  data?: Company | Department | Group | ProfileWithRelations
}

// コンポーネントのProps
interface OrganizationTreeProps {
  companies: Company[]
  departments: Department[]
  groups: Group[]
  users: ProfileWithRelations[]
  onAddUser?: (group: Group) => void
  onEditCompany?: (company: Company) => void
  onEditDepartment?: (department: Department) => void
  onEditGroup?: (group: Group) => void
  onEditUser?: (user: ProfileWithRelations) => void
  onDeleteUser?: (user: ProfileWithRelations) => void
}

// コンテキストメニューの状態
interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  node: TreeNodeData | null
}

// TODO: 大量データ（100+企業/1000+ユーザー）の場合は仮想スクロール（react-window等）導入を検討

export function OrganizationTree({
  companies,
  departments,
  groups,
  users,
  onAddUser,
  onEditCompany,
  onEditDepartment,
  onEditGroup,
  onEditUser,
  onDeleteUser,
}: OrganizationTreeProps) {
  const navigate = useNavigate()
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    node: null,
  })

  // ユーザーノードを生成
  const buildUserNode = useCallback((user: ProfileWithRelations): TreeNodeData => ({
    id: `user-${user.id}`,
    type: 'user',
    name: user.name,
    meta: { role: user.role },
    data: user,
  }), [])

  // グループノードを生成
  const buildGroupNode = useCallback((group: Group): TreeNodeData => {
    const groupUsers = users.filter((u) => u.group_id === group.id)
    return {
      id: `group-${group.id}`,
      type: 'group',
      name: group.name,
      isActive: group.is_active,
      meta: { userCount: groupUsers.length },
      children: groupUsers.map(buildUserNode),
      data: group,
    }
  }, [users, buildUserNode])

  // 部署ノードを生成
  const buildDepartmentNode = useCallback((dept: Department): TreeNodeData => {
    const deptGroups = groups.filter((g) => g.department_id === dept.id)
    return {
      id: `dept-${dept.id}`,
      type: 'department',
      name: dept.name,
      isActive: dept.is_active,
      children: deptGroups.map(buildGroupNode),
      data: dept,
    }
  }, [groups, buildGroupNode])

  // 企業ノードを生成
  const buildCompanyNode = useCallback((company: Company): TreeNodeData => {
    const companyDepts = departments.filter((d) => d.company_id === company.id)
    const companyUserCount = users.filter((u) => u.company_id === company.id).length
    return {
      id: `company-${company.id}`,
      type: 'company',
      name: company.name,
      isActive: company.is_active,
      meta: { userCount: companyUserCount },
      children: companyDepts.map(buildDepartmentNode),
      data: company,
    }
  }, [departments, users, buildDepartmentNode])

  // ツリーデータを構築
  const treeData = useMemo(
    (): TreeNodeData[] => companies.map(buildCompanyNode),
    [companies, buildCompanyNode]
  )

  // ノードの展開/折畳を切り替え
  const toggleNode = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // 全ノードを展開
  const expandAll = useCallback(() => {
    const allIds = new Set<string>()
    const collectIds = (nodes: TreeNodeData[]) => {
      nodes.forEach((node) => {
        if (node.children?.length) {
          allIds.add(node.id)
          collectIds(node.children)
        }
      })
    }
    collectIds(treeData)
    setExpandedNodes(allIds)
  }, [treeData])

  // 全ノードを折畳
  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set())
  }, [])

  // コンテキストメニューを表示
  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNodeData) => {
    e.preventDefault()
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      node,
    })
  }, [])

  // コンテキストメニューを閉じる
  const closeContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, x: 0, y: 0, node: null })
  }, [])

  // ノードタイプに応じたアイコンを取得
  const getIcon = (type: NodeType) => {
    switch (type) {
      case 'company':
        return <BuildingOffice2Icon className="w-4 h-4 text-blue-500" />
      case 'department':
        return <BuildingOfficeIcon className="w-4 h-4 text-green-500" />
      case 'group':
        return <UsersIcon className="w-4 h-4 text-purple-500" />
      default:
        return <UserIcon className="w-4 h-4 text-gray-500" />
    }
  }

  // ロールに応じたバッジを取得
  const getRoleBadge = (role: string) => {
    const variant = role === 'super_admin' ? 'error' : role === 'group_admin' ? 'warning' : 'primary'
    const label = role === 'super_admin' ? 'SA' : role === 'group_admin' ? 'GA' : 'TR'
    return (
      <Badge variant={variant} size="sm">
        {label}
      </Badge>
    )
  }

  // ツリーノードをレンダリング
  const renderNode = (node: TreeNodeData, depth = 0): React.ReactElement => {
    const isExpanded = expandedNodes.has(node.id)
    const hasChildren = node.children && node.children.length > 0

    const handleClick = () => {
      if (hasChildren) {
        toggleNode(node.id)
      }
      // グループクリック時は詳細画面へ遷移
      if (node.type === 'group' && node.data) {
        navigate(`/admin/groups/${(node.data as Group).id}`)
      }
    }

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer rounded-lg"
          style={{ paddingLeft: 12 + depth * 24 }}
          onClick={handleClick}
          onContextMenu={(e) => handleContextMenu(e, node)}
        >
          {/* 展開/折畳ボタン */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleNode(node.id)
              }}
              className="p-0.5 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDownIcon className="w-4 h-4" />
              ) : (
                <ChevronRightIcon className="w-4 h-4" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {/* アイコン */}
          {getIcon(node.type)}

          {/* 名前 */}
          <span className="flex-1 text-sm">{node.name}</span>

          {/* ユーザーのロールバッジ */}
          {node.type === 'user' && node.meta?.role && getRoleBadge(node.meta.role)}

          {/* ユーザー数カウント */}
          {node.type !== 'user' && node.meta?.userCount !== undefined && (
            <span className="text-xs text-text-light">{node.meta.userCount}</span>
          )}
        </div>

        {/* 子ノード */}
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // コンテキストメニューの項目をレンダリング
  const renderContextMenu = () => {
    if (!contextMenu.isOpen || !contextMenu.node) return null

    const { node } = contextMenu

    return (
      <div
        className="fixed bg-white rounded-lg shadow-lg border py-1 z-50 min-w-[160px]"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 企業メニュー */}
        {node.type === 'company' && (
          <button
            onClick={() => {
              if (onEditCompany && node.data) {
                onEditCompany(node.data as Company)
              }
              closeContextMenu()
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex gap-2"
          >
            <PencilIcon className="w-4 h-4" />
            編集
          </button>
        )}

        {/* 部署メニュー */}
        {node.type === 'department' && (
          <button
            onClick={() => {
              if (onEditDepartment && node.data) {
                onEditDepartment(node.data as Department)
              }
              closeContextMenu()
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex gap-2"
          >
            <PencilIcon className="w-4 h-4" />
            編集
          </button>
        )}

        {/* グループメニュー */}
        {node.type === 'group' && (
          <>
            <button
              onClick={() => {
                if (node.data) {
                  navigate(`/admin/groups/${(node.data as Group).id}`)
                }
                closeContextMenu()
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
            >
              詳細を表示
            </button>
            <button
              onClick={() => {
                if (onAddUser && node.data) {
                  onAddUser(node.data as Group)
                }
                closeContextMenu()
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex gap-2"
            >
              <UserPlusIcon className="w-4 h-4" />
              ユーザー追加
            </button>
            <button
              onClick={() => {
                if (onEditGroup && node.data) {
                  onEditGroup(node.data as Group)
                }
                closeContextMenu()
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex gap-2"
            >
              <PencilIcon className="w-4 h-4" />
              編集
            </button>
          </>
        )}

        {/* ユーザーメニュー */}
        {node.type === 'user' && (
          <>
            <button
              onClick={() => {
                if (onEditUser && node.data) {
                  onEditUser(node.data as ProfileWithRelations)
                }
                closeContextMenu()
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex gap-2"
            >
              <PencilIcon className="w-4 h-4" />
              編集
            </button>
            <button
              onClick={() => {
                if (onDeleteUser && node.data) {
                  onDeleteUser(node.data as ProfileWithRelations)
                }
                closeContextMenu()
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 text-error flex gap-2"
            >
              <TrashIcon className="w-4 h-4" />
              削除
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="relative" onClick={closeContextMenu}>
      {/* 展開/折畳ボタン */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={expandAll}
          className="px-3 py-1.5 text-sm hover:bg-gray-100 rounded-lg"
        >
          全て展開
        </button>
        <button
          onClick={collapseAll}
          className="px-3 py-1.5 text-sm hover:bg-gray-100 rounded-lg"
        >
          全て折畳
        </button>
      </div>

      {/* ツリー */}
      <div className="space-y-1">
        {treeData.map((node) => renderNode(node))}
      </div>

      {/* コンテキストメニュー */}
      {renderContextMenu()}
    </div>
  )
}
