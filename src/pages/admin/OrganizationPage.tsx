import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { OrganizationTree } from '@/components/admin/OrganizationTree'
import { CompanyForm, type CompanyFormSubmitData } from '@/components/admin/CompanyForm'
import { DepartmentForm, type DepartmentFormSubmitData } from '@/components/admin/DepartmentForm'
import { GroupForm, type GroupFormSubmitData } from '@/components/admin/GroupForm'
import { UserForm, type UserFormSubmitData } from '@/components/admin/UserForm'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { Company, Department, Group, ProfileWithRelations } from '@/types/database'

// ランダムパスワード生成用
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function OrganizationPage() {
  const { role, session } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [users, setUsers] = useState<ProfileWithRelations[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Modals
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false)
  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false)
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false)

  // Selected items
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [selectedUser, setSelectedUser] = useState<ProfileWithRelations | null>(null)
  const [selectedGroupForUserAdd, setSelectedGroupForUserAdd] = useState<Group | null>(null)

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)

      const [companiesRes, departmentsRes, groupsRes, usersRes] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('departments').select('*').order('name'),
        supabase.from('groups').select('*').order('name'),
        supabase.from('profiles').select(`
          *,
          company:companies(*),
          department:departments(*),
          group:groups(*)
        `).order('name'),
      ])

      setCompanies(companiesRes.data || [])
      setDepartments(departmentsRes.data || [])
      setGroups(groupsRes.data || [])
      setUsers(usersRes.data as ProfileWithRelations[] || [])
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('データの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Permission check
  if (role && !hasPermission(role, 'canManageCompanies')) {
    return <Navigate to="/admin" replace />
  }

  // Handle company update
  const handleUpdateCompany = async (data: CompanyFormSubmitData) => {
    if (!selectedCompany) return

    try {
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          name: data.name,
          contract_start_date: data.contractStartDate,
          contract_end_date: data.contractEndDate,
          daily_token_limit: data.dailyTokenLimit,
          is_active: data.isActive,
          notes: data.notes,
        })
        .eq('id', selectedCompany.id)

      if (updateError) throw updateError

      setSuccessMessage('企業を更新しました')
      setIsCompanyModalOpen(false)
      setSelectedCompany(null)
      fetchData()
    } catch (err) {
      console.error('Error updating company:', err)
      setError('企業の更新に失敗しました')
    }
  }

  // Handle department update
  const handleUpdateDepartment = async (data: DepartmentFormSubmitData) => {
    if (!selectedDepartment) return

    try {
      const { error: updateError } = await supabase
        .from('departments')
        .update({
          name: data.name,
          company_id: data.companyId,
          parent_department_id: data.parentDepartmentId,
          sort_order: data.sortOrder,
          is_active: data.isActive,
        })
        .eq('id', selectedDepartment.id)

      if (updateError) throw updateError

      setSuccessMessage('部署を更新しました')
      setIsDepartmentModalOpen(false)
      setSelectedDepartment(null)
      fetchData()
    } catch (err) {
      console.error('Error updating department:', err)
      setError('部署の更新に失敗しました')
    }
  }

  // Handle group update
  const handleUpdateGroup = async (data: GroupFormSubmitData) => {
    if (!selectedGroup) return

    try {
      const { error: updateError } = await supabase
        .from('groups')
        .update({
          name: data.name,
          company_id: data.companyId,
          department_id: data.departmentId,
          daily_token_limit: data.dailyTokenLimit,
          start_date: data.startDate,
          end_date: data.endDate,
          review_period_days: data.reviewPeriodDays,
          is_active: data.isActive,
        })
        .eq('id', selectedGroup.id)

      if (updateError) throw updateError

      setSuccessMessage('グループを更新しました')
      setIsGroupModalOpen(false)
      setSelectedGroup(null)
      fetchData()
    } catch (err) {
      console.error('Error updating group:', err)
      setError('グループの更新に失敗しました')
    }
  }

  // Handle user creation
  const handleCreateUser = async (data: UserFormSubmitData) => {
    if (!selectedGroupForUserAdd) return

    try {
      const password = generatePassword()
      const response = await fetch('/.netlify/functions/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          email: data.email,
          password,
          name: data.name,
          role: data.role,
          group_id: selectedGroupForUserAdd.id,
          company_id: selectedGroupForUserAdd.company_id,
          department_id: selectedGroupForUserAdd.department_id,
          is_individual: false,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'ユーザー作成に失敗しました')
      }

      // 招待メール送信
      await fetch('/.netlify/functions/send-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          email: data.email,
          name: data.name,
          password,
        }),
      })

      setSuccessMessage(`${data.name}さんを追加しました`)
      setIsUserModalOpen(false)
      setSelectedGroupForUserAdd(null)
      fetchData()
    } catch (err) {
      console.error('Error creating user:', err)
      setError(err instanceof Error ? err.message : 'ユーザーの作成に失敗しました')
    }
  }

  // Handle user update
  const handleUpdateUser = async (data: UserFormSubmitData) => {
    if (!selectedUser) return

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          name: data.name,
          role: data.role,
          company_id: data.companyId,
          department_id: data.departmentId,
          group_id: data.groupId,
          is_individual: data.isIndividual,
          start_date: data.startDate,
          end_date: data.endDate,
          review_period_days: data.reviewPeriodDays,
        })
        .eq('id', selectedUser.id)

      if (updateError) throw updateError

      setSuccessMessage(`${data.name}さんの情報を更新しました`)
      setIsUserModalOpen(false)
      setSelectedUser(null)
      fetchData()
    } catch (err) {
      console.error('Error updating user:', err)
      setError('ユーザーの更新に失敗しました')
    }
  }

  // Handle user deletion
  const handleDeleteUser = async () => {
    if (!selectedUser) return

    try {
      const response = await fetch('/.netlify/functions/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId: selectedUser.id }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'ユーザー削除に失敗しました')
      }

      setSuccessMessage(`${selectedUser.name}さんを削除しました`)
      setIsDeleteUserModalOpen(false)
      setSelectedUser(null)
      fetchData()
    } catch (err) {
      console.error('Error deleting user:', err)
      setError(err instanceof Error ? err.message : 'ユーザーの削除に失敗しました')
    }
  }

  // Filter data by search query
  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb />

      {/* Alerts */}
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert variant="success" onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">組織管理</h1>
          <p className="text-text-light mt-1">企業・部署・グループ・ユーザーの階層構造を管理</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            leftIcon={<BuildingOffice2Icon className="w-5 h-5" />}
            onClick={() => {
              setSelectedCompany(null)
              setIsCompanyModalOpen(true)
            }}
          >
            企業追加
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card padding="sm">
        <Input
          placeholder="企業名で検索..."
          leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Card>

      {/* Organization Tree */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <OrganizationTree
            companies={filteredCompanies}
            departments={departments}
            groups={groups}
            users={users}
            onAddUser={(group) => {
              setSelectedGroupForUserAdd(group)
              setSelectedUser(null)
              setIsUserModalOpen(true)
            }}
            onEditCompany={(company) => {
              setSelectedCompany(company)
              setIsCompanyModalOpen(true)
            }}
            onEditDepartment={(department) => {
              setSelectedDepartment(department)
              setIsDepartmentModalOpen(true)
            }}
            onEditGroup={(group) => {
              setSelectedGroup(group)
              setIsGroupModalOpen(true)
            }}
            onEditUser={(user) => {
              setSelectedUser(user)
              setSelectedGroupForUserAdd(null)
              setIsUserModalOpen(true)
            }}
            onDeleteUser={(user) => {
              setSelectedUser(user)
              setIsDeleteUserModalOpen(true)
            }}
          />
        </Card>
      </motion.div>

      {/* Company Modal */}
      <Modal
        isOpen={isCompanyModalOpen}
        onClose={() => {
          setIsCompanyModalOpen(false)
          setSelectedCompany(null)
        }}
        title={selectedCompany ? '企業編集' : '企業追加'}
      >
        <CompanyForm
          company={selectedCompany}
          onSubmit={handleUpdateCompany}
          onCancel={() => {
            setIsCompanyModalOpen(false)
            setSelectedCompany(null)
          }}
        />
      </Modal>

      {/* Department Modal */}
      <Modal
        isOpen={isDepartmentModalOpen}
        onClose={() => {
          setIsDepartmentModalOpen(false)
          setSelectedDepartment(null)
        }}
        title="部署編集"
      >
        {selectedDepartment && (
          <DepartmentForm
            department={selectedDepartment}
            companies={companies}
            departments={departments}
            onSubmit={handleUpdateDepartment}
            onCancel={() => {
              setIsDepartmentModalOpen(false)
              setSelectedDepartment(null)
            }}
          />
        )}
      </Modal>

      {/* Group Modal */}
      <Modal
        isOpen={isGroupModalOpen}
        onClose={() => {
          setIsGroupModalOpen(false)
          setSelectedGroup(null)
        }}
        title="グループ編集"
      >
        {selectedGroup && (
          <GroupForm
            group={selectedGroup}
            companies={companies}
            departments={departments}
            onSubmit={handleUpdateGroup}
            onCancel={() => {
              setIsGroupModalOpen(false)
              setSelectedGroup(null)
            }}
          />
        )}
      </Modal>

      {/* User Modal */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => {
          setIsUserModalOpen(false)
          setSelectedUser(null)
          setSelectedGroupForUserAdd(null)
        }}
        title={selectedUser ? 'ユーザー編集' : 'ユーザー追加'}
      >
        <UserForm
          user={selectedUser}
          groups={groups}
          companies={companies}
          departments={departments}
          currentUserRole={role}
          defaultCompanyId={selectedGroupForUserAdd?.company_id}
          defaultDepartmentId={selectedGroupForUserAdd?.department_id}
          defaultGroupId={selectedGroupForUserAdd?.id}
          onSubmit={selectedUser ? handleUpdateUser : handleCreateUser}
          onCancel={() => {
            setIsUserModalOpen(false)
            setSelectedUser(null)
            setSelectedGroupForUserAdd(null)
          }}
        />
      </Modal>

      {/* Delete User Modal */}
      <Modal
        isOpen={isDeleteUserModalOpen}
        onClose={() => {
          setIsDeleteUserModalOpen(false)
          setSelectedUser(null)
        }}
        title="ユーザー削除の確認"
        size="sm"
      >
        <p className="text-text">
          <span className="font-semibold">{selectedUser?.name}</span>{' '}
          を削除してもよろしいですか？この操作は取り消せません。
        </p>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteUserModalOpen(false)
              setSelectedUser(null)
            }}
          >
            キャンセル
          </Button>
          <Button variant="danger" onClick={handleDeleteUser}>
            削除する
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
