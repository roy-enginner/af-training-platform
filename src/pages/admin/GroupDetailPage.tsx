import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeftIcon,
  PencilIcon,
  UserPlusIcon,
  TrashIcon,
  KeyIcon,
  CalendarDaysIcon,
  BookOpenIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { Button, Card, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { GroupForm, type GroupFormSubmitData } from '@/components/admin/GroupForm'
import { UserForm, type UserFormSubmitData } from '@/components/admin/UserForm'
import { TrainingDatesManager } from '@/components/admin/TrainingDatesManager'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import { generatePassword } from '@/utils/password'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { Group, GroupTrainingDate, Company, Department, ProfileWithRelations, Curriculum } from '@/types/database'

interface GroupWithDetails extends Group {
  company?: Company | null
  department?: Department | null
}

interface CurriculumAssignment {
  id: string
  curriculum_id: string
  curriculum: Curriculum
}

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role, session } = useAuth()

  const [group, setGroup] = useState<GroupWithDetails | null>(null)
  const [members, setMembers] = useState<ProfileWithRelations[]>([])
  const [trainingDates, setTrainingDates] = useState<GroupTrainingDate[]>([])
  const [assignments, setAssignments] = useState<CurriculumAssignment[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isUserAddModalOpen, setIsUserAddModalOpen] = useState(false)
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false)
  const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false)
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false)
  const [isTrainingDatesModalOpen, setIsTrainingDatesModalOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<ProfileWithRelations | null>(null)
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  // Fetch group details
  const fetchGroup = useCallback(async () => {
    if (!id) return

    try {
      setIsLoading(true)
      const { data, error: fetchError } = await supabase
        .from('groups')
        .select(`
          *,
          company:companies(*),
          department:departments(*)
        `)
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError
      setGroup(data)
    } catch (err) {
      console.error('Error fetching group:', err)
      setError('グループの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  // Fetch group members
  const fetchMembers = useCallback(async () => {
    if (!id) return

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select(`
          *,
          company:companies(*),
          department:departments(*),
          group:groups(*)
        `)
        .eq('group_id', id)
        .order('name')

      if (fetchError) throw fetchError
      setMembers(data as ProfileWithRelations[])
    } catch (err) {
      console.error('Error fetching members:', err)
    }
  }, [id])

  // Fetch training dates
  const fetchTrainingDates = useCallback(async () => {
    if (!id) return

    try {
      const { data, error: fetchError } = await supabase
        .from('group_training_dates')
        .select('*')
        .eq('group_id', id)
        .order('training_date')

      if (fetchError) throw fetchError
      setTrainingDates(data || [])
    } catch (err) {
      console.error('Error fetching training dates:', err)
    }
  }, [id])

  // Fetch curriculum assignments
  const fetchAssignments = useCallback(async () => {
    if (!id) return

    try {
      const { data, error: fetchError } = await supabase
        .from('curriculum_assignments')
        .select(`
          id,
          curriculum_id,
          curriculum:curricula(*)
        `)
        .eq('group_id', id)

      if (fetchError) throw fetchError
      setAssignments((data || []) as unknown as CurriculumAssignment[])
    } catch (err) {
      console.error('Error fetching assignments:', err)
    }
  }, [id])

  // Fetch companies and departments for forms
  const fetchCompaniesAndDepartments = useCallback(async () => {
    try {
      const [companiesRes, departmentsRes, groupsRes] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('departments').select('*').order('name'),
        supabase.from('groups').select('*').order('name'),
      ])
      setCompanies(companiesRes.data || [])
      setDepartments(departmentsRes.data || [])
      setGroups(groupsRes.data || [])
    } catch (err) {
      console.error('Error fetching companies/departments:', err)
    }
  }, [])

  useEffect(() => {
    fetchGroup()
    fetchMembers()
    fetchTrainingDates()
    fetchAssignments()
    fetchCompaniesAndDepartments()
  }, [fetchGroup, fetchMembers, fetchTrainingDates, fetchAssignments, fetchCompaniesAndDepartments])

  // Permission check
  if (role && !hasPermission(role, 'canManageGroups')) {
    return <Navigate to="/admin" replace />
  }

  // Handle group update
  const handleUpdateGroup = async (data: GroupFormSubmitData) => {
    if (!group) return

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
        .eq('id', group.id)

      if (updateError) throw updateError

      setSuccessMessage('グループを更新しました')
      setIsEditModalOpen(false)
      fetchGroup()
    } catch (err) {
      console.error('Error updating group:', err)
      setError('グループの更新に失敗しました')
    }
  }

  // Handle user creation
  const handleCreateUser = async (data: UserFormSubmitData) => {
    if (!group) return

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
          group_id: group.id,
          company_id: group.company_id,
          department_id: group.department_id,
          is_individual: false,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'ユーザー作成に失敗しました')
      }

      // 招待メール送信
      const emailResponse = await fetch('/.netlify/functions/send-invitation', {
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

      if (!emailResponse.ok) {
        console.error('Failed to send invitation email')
        setSuccessMessage(`${data.name}さんを追加しました（※招待メールの送信に失敗しました）`)
      } else {
        setSuccessMessage(`${data.name}さんを追加し、招待メールを送信しました`)
      }
      setIsUserAddModalOpen(false)
      fetchMembers()
    } catch (err) {
      console.error('Error creating user:', err)
      setError(err instanceof Error ? err.message : 'ユーザーの作成に失敗しました')
    }
  }

  // Handle user update
  const handleUpdateUser = async (data: UserFormSubmitData) => {
    if (!selectedMember) return

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
        .eq('id', selectedMember.id)

      if (updateError) throw updateError

      setSuccessMessage(`${data.name}さんの情報を更新しました`)
      setIsUserEditModalOpen(false)
      setSelectedMember(null)
      fetchMembers()
    } catch (err) {
      console.error('Error updating user:', err)
      setError('ユーザーの更新に失敗しました')
    }
  }

  // Handle user deletion
  const handleDeleteUser = async () => {
    if (!selectedMember) return

    try {
      const response = await fetch('/.netlify/functions/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId: selectedMember.id }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'ユーザー削除に失敗しました')
      }

      setSuccessMessage(`${selectedMember.name}さんを削除しました`)
      setIsDeleteUserModalOpen(false)
      setSelectedMember(null)
      fetchMembers()
    } catch (err) {
      console.error('Error deleting user:', err)
      setError(err instanceof Error ? err.message : 'ユーザーの削除に失敗しました')
    }
  }

  // Handle password reset
  const handleResetPassword = async () => {
    if (!selectedMember) return

    try {
      setIsResettingPassword(true)
      const newPassword = generatePassword()

      const response = await fetch('/.netlify/functions/reset-user-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          userId: selectedMember.id,
          newPassword,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'パスワードリセットに失敗しました')
      }

      setSuccessMessage(`${selectedMember.name}さんのパスワードをリセットしました`)
      setIsResetPasswordModalOpen(false)
      setSelectedMember(null)
    } catch (err) {
      console.error('Error resetting password:', err)
      setError(err instanceof Error ? err.message : 'パスワードのリセットに失敗しました')
    } finally {
      setIsResettingPassword(false)
    }
  }

  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  // Role badge
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <Badge variant="error" size="sm">スーパー管理者</Badge>
      case 'group_admin':
        return <Badge variant="warning" size="sm">グループ管理者</Badge>
      default:
        return <Badge variant="primary" size="sm">研修生</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="text-center py-12">
        <p className="text-text-light">グループが見つかりません</p>
        <Button onClick={() => navigate('/admin/groups')} className="mt-4">
          グループ一覧に戻る
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb
        dynamicLabels={{ [id!]: group.name }}
      />

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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/groups')}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 text-text-light" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text">{group.name}</h1>
              {!group.is_active && <Badge variant="default">無効</Badge>}
            </div>
            <p className="text-text-light mt-1">
              {group.company?.name && `${group.company.name}`}
              {group.department?.name && ` / ${group.department.name}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            leftIcon={<CalendarDaysIcon className="w-5 h-5" />}
            onClick={() => setIsTrainingDatesModalOpen(true)}
          >
            研修日管理
          </Button>
          <Button
            variant="outline"
            leftIcon={<PencilIcon className="w-5 h-5" />}
            onClick={() => setIsEditModalOpen(true)}
          >
            編集
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <UsersIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-text-light">メンバー数</p>
              <p className="text-xl font-bold text-text">{members.length}人</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CalendarDaysIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-text-light">研修期間</p>
              <p className="text-sm font-medium text-text">
                {formatDate(group.start_date)} 〜 {formatDate(group.end_date)}
              </p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <BookOpenIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-text-light">割当カリキュラム</p>
              <p className="text-xl font-bold text-text">{assignments.length}件</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Members Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">メンバー ({members.length}人)</h2>
            <Button
              size="sm"
              leftIcon={<UserPlusIcon className="w-4 h-4" />}
              onClick={() => setIsUserAddModalOpen(true)}
            >
              メンバー追加
            </Button>
          </div>
          <div className="divide-y divide-border">
            {members.length === 0 ? (
              <div className="p-8 text-center text-text-light">
                メンバーがいません
              </div>
            ) : (
              members.map((member) => (
                <div key={member.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-medium">
                        {member.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-text">{member.name}</p>
                      <p className="text-sm text-text-light">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getRoleBadge(member.role)}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setSelectedMember(member)
                          setIsUserEditModalOpen(true)
                        }}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        title="編集"
                      >
                        <PencilIcon className="w-4 h-4 text-text-light" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedMember(member)
                          setIsResetPasswordModalOpen(true)
                        }}
                        className="p-2 rounded-lg hover:bg-yellow-50 transition-colors"
                        title="パスワードリセット"
                      >
                        <KeyIcon className="w-4 h-4 text-yellow-600" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedMember(member)
                          setIsDeleteUserModalOpen(true)
                        }}
                        className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                        title="削除"
                      >
                        <TrashIcon className="w-4 h-4 text-error" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </motion.div>

      {/* Training Dates Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">研修日 ({trainingDates.length}件)</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsTrainingDatesModalOpen(true)}
            >
              管理
            </Button>
          </div>
          <div className="p-4">
            {trainingDates.length === 0 ? (
              <p className="text-text-light text-center py-4">研修日が設定されていません</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {trainingDates.map((td) => (
                  <div key={td.id} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm">
                    {formatDate(td.training_date)}
                    {td.description && (
                      <span className="text-blue-500 ml-1">({td.description})</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Curriculum Assignments Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <Card>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">割当カリキュラム ({assignments.length}件)</h2>
            <Link to="/admin/curricula">
              <Button size="sm" variant="outline">
                カリキュラム管理へ
              </Button>
            </Link>
          </div>
          <div className="divide-y divide-border">
            {assignments.length === 0 ? (
              <div className="p-8 text-center text-text-light">
                カリキュラムが割り当てられていません
              </div>
            ) : (
              assignments.map((assignment) => (
                <Link
                  key={assignment.id}
                  to={`/admin/curricula/${assignment.curriculum_id}`}
                  className="p-4 flex items-center justify-between hover:bg-gray-50 block"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <BookOpenIcon className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-text">{assignment.curriculum.name}</p>
                      {assignment.curriculum.description && (
                        <p className="text-sm text-text-light line-clamp-1">
                          {assignment.curriculum.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant="secondary" size="sm">
                    {assignment.curriculum.difficulty_level === 'beginner' && '初級'}
                    {assignment.curriculum.difficulty_level === 'intermediate' && '中級'}
                    {assignment.curriculum.difficulty_level === 'advanced' && '上級'}
                    {assignment.curriculum.difficulty_level === 'mixed' && '混合'}
                  </Badge>
                </Link>
              ))
            )}
          </div>
        </Card>
      </motion.div>

      {/* Edit Group Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="グループ編集"
      >
        <GroupForm
          group={group}
          companies={companies}
          departments={departments}
          onSubmit={handleUpdateGroup}
          onCancel={() => setIsEditModalOpen(false)}
        />
      </Modal>

      {/* Add User Modal */}
      <Modal
        isOpen={isUserAddModalOpen}
        onClose={() => setIsUserAddModalOpen(false)}
        title={`メンバー追加 - ${group.name}`}
      >
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg text-sm">
            <p className="font-medium text-blue-700">追加先グループ</p>
            <p className="text-blue-600 mt-1">
              {group.company?.name && `${group.company.name} / `}
              {group.department?.name && `${group.department.name} / `}
              {group.name}
            </p>
          </div>
          <UserForm
            groups={groups}
            companies={companies}
            departments={departments}
            currentUserRole={role}
            defaultCompanyId={group.company_id}
            defaultDepartmentId={group.department_id}
            defaultGroupId={group.id}
            onSubmit={handleCreateUser}
            onCancel={() => setIsUserAddModalOpen(false)}
          />
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={isUserEditModalOpen}
        onClose={() => {
          setIsUserEditModalOpen(false)
          setSelectedMember(null)
        }}
        title="メンバー編集"
      >
        {selectedMember && (
          <UserForm
            user={selectedMember}
            groups={groups}
            companies={companies}
            departments={departments}
            currentUserRole={role}
            onSubmit={handleUpdateUser}
            onCancel={() => {
              setIsUserEditModalOpen(false)
              setSelectedMember(null)
            }}
          />
        )}
      </Modal>

      {/* Delete User Modal */}
      <Modal
        isOpen={isDeleteUserModalOpen}
        onClose={() => {
          setIsDeleteUserModalOpen(false)
          setSelectedMember(null)
        }}
        title="メンバー削除の確認"
        size="sm"
      >
        <p className="text-text">
          <span className="font-semibold">{selectedMember?.name}</span>{' '}
          を削除してもよろしいですか？この操作は取り消せません。
        </p>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteUserModalOpen(false)
              setSelectedMember(null)
            }}
          >
            キャンセル
          </Button>
          <Button variant="danger" onClick={handleDeleteUser}>
            削除する
          </Button>
        </ModalFooter>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={isResetPasswordModalOpen}
        onClose={() => {
          setIsResetPasswordModalOpen(false)
          setSelectedMember(null)
        }}
        title="パスワードリセットの確認"
        size="sm"
      >
        <p className="text-text">
          <span className="font-semibold">{selectedMember?.name}</span>{' '}
          のパスワードをリセットしますか？新しいパスワードがメールで送信されます。
        </p>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsResetPasswordModalOpen(false)
              setSelectedMember(null)
            }}
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

      {/* Training Dates Modal */}
      <Modal
        isOpen={isTrainingDatesModalOpen}
        onClose={() => setIsTrainingDatesModalOpen(false)}
        title={`研修日管理 - ${group.name}`}
        size="lg"
      >
        <TrainingDatesManager
          groupId={group.id}
          trainingDates={trainingDates}
          onUpdate={fetchTrainingDates}
        />
        <ModalFooter>
          <Button onClick={() => setIsTrainingDatesModalOpen(false)}>
            閉じる
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
