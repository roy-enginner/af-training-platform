import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  PlusIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  KeyIcon,
  UsersIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase, generateRandomPassword } from '@/lib/supabase'
import { UserForm } from '@/components/admin/UserForm'
import { UserWizard, type UserWizardSubmitData } from '@/components/admin/UserWizard'
import { CsvUpload } from '@/components/admin/CsvUpload'
import { useAuth } from '@/hooks/useAuth'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import type { ProfileWithRelations, Group, Company, Department, UserRole } from '@/types/database'
import { hasPermission } from '@/types/database'
import type { UserFormSubmitData } from '@/components/admin/UserForm'

type UserTab = 'trainees' | 'admins' | 'super_admins'
type SortField = 'name' | 'email' | 'createdAt'
type SortDirection = 'asc' | 'desc'

export function UsersPage() {
  const { user: currentUser, role: currentUserRole, profile } = useAuth()
  const [users, setUsers] = useState<ProfileWithRelations[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<UserTab>('trainees')
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [filterCompanyId, setFilterCompanyId] = useState<string>('')
  const [filterGroupId, setFilterGroupId] = useState<string>('')
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [isWizardModalOpen, setIsWizardModalOpen] = useState(false)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [selectedUser, setSelectedUser] = useState<ProfileWithRelations | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Check if current user can manage all users
  const canManageAllUsers = currentUserRole ? hasPermission(currentUserRole, 'canManageAllUsers') : false

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      let query = supabase
        .from('profiles')
        .select(`
          *,
          company:companies(*),
          department:departments(*),
          group:groups(*)
        `)

      // Group Admin can only see users in their own group
      if (!canManageAllUsers && profile?.group_id) {
        query = query.eq('group_id', profile.group_id)
      }

      const { data, error: fetchError } = await query.order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setUsers(data as ProfileWithRelations[])
    } catch (err) {
      console.error('Error fetching users:', err)
      setError('ユーザーの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [canManageAllUsers, profile?.group_id])

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('groups')
        .select('*')
        .order('name')

      if (fetchError) throw fetchError
      setGroups(data || [])
    } catch (err) {
      console.error('Error fetching groups:', err)
    }
  }, [])

  // Fetch companies
  const fetchCompanies = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('companies')
        .select('*')
        .order('name')

      if (fetchError) throw fetchError
      setCompanies(data || [])
    } catch (err) {
      console.error('Error fetching companies:', err)
    }
  }, [])

  // Fetch departments
  const fetchDepartments = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('departments')
        .select('*')
        .order('name')

      if (fetchError) throw fetchError
      setDepartments(data || [])
    } catch (err) {
      console.error('Error fetching departments:', err)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchGroups()
    fetchCompanies()
    fetchDepartments()
  }, [fetchUsers, fetchGroups, fetchCompanies, fetchDepartments])

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let result = users.filter((user) => {
      // Tab filter: trainees vs admins vs super_admins
      if (activeTab === 'trainees' && user.role !== 'trainee') return false
      if (activeTab === 'admins' && user.role !== 'group_admin') return false
      if (activeTab === 'super_admins' && user.role !== 'super_admin') return false

      // Search filter
      const matchesSearch =
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.group?.name?.toLowerCase().includes(searchQuery.toLowerCase())

      if (!matchesSearch) return false

      // Company filter
      if (filterCompanyId && user.company_id !== filterCompanyId) return false

      // Group filter
      if (filterGroupId && user.group_id !== filterGroupId) return false

      return true
    })

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'ja')
          break
        case 'email':
          comparison = (a.email || '').localeCompare(b.email || '', 'ja')
          break
        case 'createdAt':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [users, activeTab, searchQuery, filterCompanyId, filterGroupId, sortField, sortDirection])

  // Toggle sort (accepts string for Table component compatibility)
  const handleSort = (field: string) => {
    const sortableField = field as SortField
    if (sortField === sortableField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(sortableField)
      setSortDirection('asc')
    }
  }

  // Groups filtered by selected company
  const filteredGroupsForFilter = useMemo(() => {
    if (!filterCompanyId) return groups
    return groups.filter(g => g.company_id === filterCompanyId)
  }, [groups, filterCompanyId])

  // Handle user creation via Netlify Function
  const handleCreateUser = async (data: UserFormSubmitData) => {
    if (!data.email) {
      setError('メールアドレスは必須です')
      return
    }
    try {
      const password = generateRandomPassword()
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin

      // Get current session for authorization
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      // Create user via Netlify Function (server-side)
      const response = await fetch('/.netlify/functions/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: data.email,
          password,
          name: data.name,
          role: data.role,
          group_id: data.groupId,
          company_id: data.companyId,
          department_id: data.departmentId,
          is_individual: data.isIndividual,
          start_date: data.startDate,
          end_date: data.endDate,
          review_period_days: data.reviewPeriodDays,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to create user')

      // Send invitation email
      const emailResponse = await fetch('/.netlify/functions/send-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: data.email,
          name: data.name,
          password,
          loginUrl: `${appUrl}/login`,
        }),
      })

      if (!emailResponse.ok) {
        console.error('Failed to send invitation email')
      }

      setSuccessMessage('ユーザーを作成し、招待メールを送信しました')
      setIsUserModalOpen(false)
      fetchUsers()
    } catch (err) {
      console.error('Error creating user:', err)
      setError(err instanceof Error ? err.message : 'ユーザーの作成に失敗しました')
    }
  }

  // Handle user creation from wizard
  const handleWizardSubmit = async (data: UserWizardSubmitData) => {
    try {
      const password = generateRandomPassword()
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin

      // Get current session for authorization
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      // Create user via Netlify Function (server-side)
      const response = await fetch('/.netlify/functions/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: data.email,
          password,
          name: data.name,
          role: data.role,
          group_id: data.groupId,
          company_id: data.companyId,
          department_id: data.departmentId,
          is_individual: data.isIndividual,
          start_date: data.startDate,
          end_date: data.endDate,
          review_period_days: data.reviewPeriodDays,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to create user')

      // Send invitation email
      const emailResponse = await fetch('/.netlify/functions/send-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: data.email,
          name: data.name,
          password,
          loginUrl: `${appUrl}/login`,
        }),
      })

      if (!emailResponse.ok) {
        console.error('Failed to send invitation email')
      }

      setSuccessMessage('ユーザーを作成し、招待メールを送信しました')
      setIsWizardModalOpen(false)
      fetchUsers()
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
          role: data.role as UserRole,
          group_id: data.groupId,
          company_id: data.companyId,
          department_id: data.departmentId,
          is_individual: data.isIndividual,
          start_date: data.startDate,
          end_date: data.endDate,
          review_period_days: data.reviewPeriodDays,
        })
        .eq('id', selectedUser.id)

      if (updateError) throw updateError

      setSuccessMessage('ユーザーを更新しました')
      setIsUserModalOpen(false)
      setSelectedUser(null)
      fetchUsers()
    } catch (err) {
      console.error('Error updating user:', err)
      setError('ユーザーの更新に失敗しました')
    }
  }

  // Handle user deletion via Netlify Function
  const handleDeleteUser = async () => {
    if (!selectedUser) return

    // Prevent self-deletion
    if (selectedUser.id === currentUser?.id) {
      setError('自分自身を削除することはできません')
      setIsDeleteModalOpen(false)
      setSelectedUser(null)
      return
    }

    try {
      // Get current session for authorization
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      // Delete user via Netlify Function (server-side)
      const response = await fetch('/.netlify/functions/delete-user', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: selectedUser.id }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to delete user')

      setSuccessMessage('ユーザーを削除しました')
      setIsDeleteModalOpen(false)
      setSelectedUser(null)
      fetchUsers()
    } catch (err) {
      console.error('Error deleting user:', err)
      setError(err instanceof Error ? err.message : 'ユーザーの削除に失敗しました')
    }
  }

  // Handle password reset
  const handleResetPassword = async () => {
    if (!selectedUser || !selectedUser.email) {
      setError('メールアドレスが設定されていないため、パスワードをリセットできません')
      setIsResetPasswordModalOpen(false)
      setSelectedUser(null)
      return
    }

    // Prevent self password reset
    if (selectedUser.id === currentUser?.id) {
      setError('自分自身のパスワードはこの方法ではリセットできません')
      setIsResetPasswordModalOpen(false)
      setSelectedUser(null)
      return
    }

    setIsResettingPassword(true)
    try {
      const newPassword = generateRandomPassword()
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin

      // Get current session for authorization
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      // Reset password via Netlify Function
      const response = await fetch('/.netlify/functions/reset-user-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          newPassword,
          userEmail: selectedUser.email,
          userName: selectedUser.name,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to reset password')

      // Send password reset email
      const emailResponse = await fetch('/.netlify/functions/send-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: selectedUser.email,
          name: selectedUser.name,
          password: newPassword,
          loginUrl: `${appUrl}/login`,
        }),
      })

      if (!emailResponse.ok) {
        const emailError = await emailResponse.json()
        throw new Error(emailError.error || 'メール送信に失敗しました')
      }

      setSuccessMessage(`${selectedUser.name}のパスワードをリセットし、メールを送信しました`)
      setIsResetPasswordModalOpen(false)
      setSelectedUser(null)
      fetchUsers()
    } catch (err) {
      console.error('Error resetting password:', err)
      setError(err instanceof Error ? err.message : 'パスワードのリセットに失敗しました')
    } finally {
      setIsResettingPassword(false)
    }
  }

  // Handle CSV import via Netlify Function
  const handleCsvImport = async (importedUsers: import('@/types/database').CsvUserRow[]) => {
    try {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin
      let addedCount = 0
      let deletedCount = 0

      // Get current session for authorization
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      for (const user of importedUsers) {
        if (user.action === 'add') {
          // Find company if specified
          let companyId: string | null = null
          if (user.companyName) {
            const existingCompany = companies.find(
              (c) => c.name.toLowerCase() === user.companyName.toLowerCase()
            )
            if (existingCompany) {
              companyId = existingCompany.id
            }
          }

          // Find department if specified
          let departmentId: string | null = null
          if (user.departmentName && companyId) {
            const existingDept = departments.find(
              (d) => d.company_id === companyId && d.name.toLowerCase() === user.departmentName.toLowerCase()
            )
            if (existingDept) {
              departmentId = existingDept.id
            }
          }

          // Find or create group
          let groupId: string | null = null
          if (!user.isIndividual && user.groupName) {
            const existingGroup = groups.find(
              (g) => g.name.toLowerCase() === user.groupName.toLowerCase() &&
                    (companyId ? g.company_id === companyId : true)
            )
            if (existingGroup) {
              groupId = existingGroup.id
            } else {
              const { data: newGroup } = await supabase
                .from('groups')
                .insert({
                  name: user.groupName,
                  company_id: companyId,
                  department_id: departmentId,
                })
                .select()
                .single()
              if (newGroup) {
                groupId = newGroup.id
                setGroups((prev) => [...prev, newGroup])
              }
            }
          }

          // Create user via Netlify Function
          const password = generateRandomPassword()
          const response = await fetch('/.netlify/functions/create-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              email: user.email,
              password,
              name: user.userName,
              role: user.role || 'trainee',
              company_id: companyId,
              department_id: departmentId,
              group_id: groupId,
              is_individual: user.isIndividual,
            }),
          })

          if (!response.ok) {
            const result = await response.json()
            console.error(`Error creating user ${user.email}:`, result.error)
            continue
          }

          // Send invitation email
          const emailResponse = await fetch('/.netlify/functions/send-invitation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              email: user.email,
              name: user.userName,
              password,
              loginUrl: `${appUrl}/login`,
            }),
          })

          if (!emailResponse.ok) {
            console.error(`Failed to send invitation email to ${user.email}`)
          }

          addedCount++
        } else if (user.action === 'delete') {
          // Find user by email
          const existingUser = users.find((u) => u.email === user.email)
          if (!existingUser) {
            console.error(`User not found for deletion: ${user.email}`)
            continue
          }

          // Prevent self-deletion
          if (existingUser.id === currentUser?.id) {
            console.error(`Cannot delete self: ${user.email}`)
            continue
          }

          // Delete user via Netlify Function
          const response = await fetch('/.netlify/functions/delete-user', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ userId: existingUser.id }),
          })

          if (!response.ok) {
            const result = await response.json()
            console.error(`Error deleting user ${user.email}:`, result.error)
            continue
          }

          deletedCount++
        }
      }

      // Build success message
      const messages = []
      if (addedCount > 0) messages.push(`${addedCount}人を追加`)
      if (deletedCount > 0) messages.push(`${deletedCount}人を削除`)

      setSuccessMessage(messages.join('、') + 'しました')
      setIsCsvModalOpen(false)
      fetchUsers()
      fetchGroups()
    } catch (err) {
      console.error('Error importing users:', err)
      setError('CSVインポートに失敗しました')
    }
  }

  // Table columns
  const columns = [
    {
      key: 'name',
      header: '名前',
      sortable: true,
      render: (user: ProfileWithRelations) => (
        <span className="font-medium">{user.name}</span>
      ),
    },
    {
      key: 'email',
      header: 'メールアドレス',
      sortable: true,
      render: (user: ProfileWithRelations) => (
        <span className="text-text-light">{user.email || '-'}</span>
      ),
    },
    {
      key: 'company',
      header: '企業',
      render: (user: ProfileWithRelations) => user.company?.name || '-',
    },
    {
      key: 'department',
      header: '部署',
      render: (user: ProfileWithRelations) => user.department?.name || '-',
    },
    {
      key: 'group',
      header: 'グループ',
      render: (user: ProfileWithRelations) => user.group?.name || '-',
    },
    {
      key: 'actions',
      header: '',
      className: 'w-32',
      render: (user: ProfileWithRelations) => {
        const isSelf = user.id === currentUser?.id
        const canResetPassword = !isSelf && user.email
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSelectedUser(user)
                setIsUserModalOpen(true)
              }}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="編集"
            >
              <PencilIcon className="w-4 h-4 text-text-light" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (!canResetPassword) return
                setSelectedUser(user)
                setIsResetPasswordModalOpen(true)
              }}
              className={`p-2 rounded-lg transition-colors ${
                canResetPassword
                  ? 'hover:bg-amber-50'
                  : 'opacity-30 cursor-not-allowed'
              }`}
              title={isSelf ? '自分自身はリセットできません' : !user.email ? 'メールアドレスが未設定' : 'パスワードリセット'}
              disabled={!canResetPassword}
            >
              <KeyIcon className={`w-4 h-4 ${canResetPassword ? 'text-amber-600' : 'text-gray-400'}`} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (isSelf) return
                setSelectedUser(user)
                setIsDeleteModalOpen(true)
              }}
              className={`p-2 rounded-lg transition-colors ${
                isSelf
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:bg-red-50'
              }`}
              title={isSelf ? '自分自身は削除できません' : '削除'}
              disabled={isSelf}
            >
              <TrashIcon className={`w-4 h-4 ${isSelf ? 'text-gray-400' : 'text-error'}`} />
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb />

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">ユーザー管理</h1>
          <p className="text-text-light mt-1">研修生と管理者の管理</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            leftIcon={<ArrowUpTrayIcon className="w-5 h-5" />}
            onClick={() => setIsCsvModalOpen(true)}
          >
            CSV一括登録
          </Button>
          <Button
            leftIcon={<PlusIcon className="w-5 h-5" />}
            onClick={() => setIsWizardModalOpen(true)}
          >
            ユーザー追加
          </Button>
        </div>
      </div>

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

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('trainees')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'trainees'
              ? 'text-blue-600 border-blue-600'
              : 'text-text-light border-transparent hover:text-text'
          }`}
        >
          <UsersIcon className="w-5 h-5" />
          研修生
          <Badge variant="primary" size="sm">
            {users.filter(u => u.role === 'trainee').length}
          </Badge>
        </button>
        <button
          onClick={() => setActiveTab('admins')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'admins'
              ? 'text-green-600 border-green-600'
              : 'text-text-light border-transparent hover:text-text'
          }`}
        >
          <ShieldCheckIcon className="w-5 h-5" />
          グループ管理者
          <Badge variant="success" size="sm">
            {users.filter(u => u.role === 'group_admin').length}
          </Badge>
        </button>
        <button
          onClick={() => setActiveTab('super_admins')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'super_admins'
              ? 'text-amber-600 border-amber-600'
              : 'text-text-light border-transparent hover:text-text'
          }`}
        >
          <ShieldCheckIcon className="w-5 h-5" />
          マスター管理者
          <Badge variant="warning" size="sm">
            {users.filter(u => u.role === 'super_admin').length}
          </Badge>
        </button>
      </div>

      {/* Search and Filters */}
      <Card padding="sm">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="名前、メール、グループで検索..."
              leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {/* Company filter */}
            <select
              value={filterCompanyId}
              onChange={(e) => {
                setFilterCompanyId(e.target.value)
                setFilterGroupId('')
              }}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">全企業</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
            {/* Group filter */}
            <select
              value={filterGroupId}
              onChange={(e) => setFilterGroupId(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">全グループ</option>
              {filteredGroupsForFilter.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Users table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Table
          columns={columns}
          data={filteredUsers}
          keyExtractor={(user) => user.id}
          isLoading={isLoading}
          emptyMessage="ユーザーが登録されていません"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      </motion.div>

      {/* User wizard modal */}
      <Modal
        isOpen={isWizardModalOpen}
        onClose={() => setIsWizardModalOpen(false)}
        title="ユーザー追加"
        size="lg"
      >
        <UserWizard
          companies={companies}
          departments={departments}
          groups={groups}
          currentUserRole={currentUserRole}
          onSubmit={handleWizardSubmit}
          onCancel={() => setIsWizardModalOpen(false)}
        />
      </Modal>

      {/* User form modal (for editing) */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => {
          setIsUserModalOpen(false)
          setSelectedUser(null)
        }}
        title={selectedUser ? 'ユーザー編集' : 'ユーザー追加'}
      >
        <UserForm
          user={selectedUser}
          groups={groups}
          companies={companies}
          departments={departments}
          currentUserRole={currentUserRole}
          onSubmit={selectedUser ? handleUpdateUser : handleCreateUser}
          onCancel={() => {
            setIsUserModalOpen(false)
            setSelectedUser(null)
          }}
        />
      </Modal>

      {/* CSV upload modal */}
      <Modal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        title="CSV一括登録"
        size="lg"
      >
        <CsvUpload
          onImport={handleCsvImport}
          onCancel={() => setIsCsvModalOpen(false)}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
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
              setIsDeleteModalOpen(false)
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

      {/* Password reset confirmation modal */}
      <Modal
        isOpen={isResetPasswordModalOpen}
        onClose={() => {
          if (!isResettingPassword) {
            setIsResetPasswordModalOpen(false)
            setSelectedUser(null)
          }
        }}
        title="パスワードリセットの確認"
        size="md"
      >
        <p className="text-text">
          <span className="font-semibold">{selectedUser?.name}</span> のパスワードをリセットしますか？
        </p>
        <p className="text-text-light text-sm mt-2">
          新しいパスワードが生成され、ユーザーにメールで通知されます。<br></br>ユーザーは次回ログイン時にパスワード変更が必要になります。
        </p>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsResetPasswordModalOpen(false)
              setSelectedUser(null)
            }}
            disabled={isResettingPassword}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleResetPassword}
            isLoading={isResettingPassword}
          >
            リセットする
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
