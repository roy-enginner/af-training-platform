import { useState, useEffect, useCallback } from 'react'
import { PlusIcon, TrashIcon, BuildingOffice2Icon, BuildingOfficeIcon, RectangleStackIcon, UserIcon } from '@heroicons/react/24/outline'
import { Button, Input, Badge, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { CurriculumAssignment, CurriculumTargetType, Company, Department, Group, Profile } from '@/types/database'

interface CurriculumAssignmentManagerProps {
  curriculumId: string
  curriculumName?: string
}

interface AssignmentWithDetails extends CurriculumAssignment {
  targetName: string
}

const TARGET_TYPE_LABELS: Record<CurriculumTargetType, string> = {
  company: '企業',
  department: '部署',
  group: 'グループ',
  individual: '個人',
}

const TARGET_TYPE_ICONS: Record<CurriculumTargetType, typeof BuildingOffice2Icon> = {
  company: BuildingOffice2Icon,
  department: BuildingOfficeIcon,
  group: RectangleStackIcon,
  individual: UserIcon,
}

const TARGET_TYPE_COLORS: Record<CurriculumTargetType, 'primary' | 'success' | 'warning' | 'error'> = {
  company: 'primary',
  department: 'success',
  group: 'warning',
  individual: 'error',
}

export function CurriculumAssignmentManager({ curriculumId }: CurriculumAssignmentManagerProps) {
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // New assignment form state
  const [targetType, setTargetType] = useState<CurriculumTargetType>('company')
  const [targetId, setTargetId] = useState<string>('')
  const [dueDate, setDueDate] = useState<string>('')
  const [isRequired, setIsRequired] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch all reference data
  const fetchReferenceData = useCallback(async () => {
    try {
      const [companiesRes, departmentsRes, groupsRes, usersRes] = await Promise.all([
        supabase.from('companies').select('*').eq('is_active', true).order('name'),
        supabase.from('departments').select('*').eq('is_active', true).order('name'),
        supabase.from('groups').select('*').eq('is_active', true).order('name'),
        supabase.from('profiles').select('*').eq('role', 'trainee').order('name'),
      ])

      if (companiesRes.error) throw companiesRes.error
      if (departmentsRes.error) throw departmentsRes.error
      if (groupsRes.error) throw groupsRes.error
      if (usersRes.error) throw usersRes.error

      setCompanies(companiesRes.data || [])
      setDepartments(departmentsRes.data || [])
      setGroups(groupsRes.data || [])
      setUsers(usersRes.data || [])
    } catch (err) {
      console.error('Error fetching reference data:', err)
    }
  }, [])

  // Fetch assignments for this curriculum
  const fetchAssignments = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data, error: fetchError } = await supabase
        .from('curriculum_assignments')
        .select('*')
        .eq('curriculum_id', curriculumId)
        .order('assigned_at', { ascending: false })

      if (fetchError) throw fetchError

      // Resolve target names
      const assignmentsWithNames: AssignmentWithDetails[] = await Promise.all(
        (data || []).map(async (assignment) => {
          let targetName = '不明'

          switch (assignment.target_type) {
            case 'company': {
              const { data: company } = await supabase
                .from('companies')
                .select('name')
                .eq('id', assignment.target_id)
                .single()
              targetName = company?.name || '削除された企業'
              break
            }
            case 'department': {
              const { data: dept } = await supabase
                .from('departments')
                .select('name')
                .eq('id', assignment.target_id)
                .single()
              targetName = dept?.name || '削除された部署'
              break
            }
            case 'group': {
              const { data: group } = await supabase
                .from('groups')
                .select('name')
                .eq('id', assignment.target_id)
                .single()
              targetName = group?.name || '削除されたグループ'
              break
            }
            case 'individual': {
              const { data: user } = await supabase
                .from('profiles')
                .select('name')
                .eq('id', assignment.target_id)
                .single()
              targetName = user?.name || '削除されたユーザー'
              break
            }
          }

          return { ...assignment, targetName }
        })
      )

      setAssignments(assignmentsWithNames)
    } catch (err) {
      console.error('Error fetching assignments:', err)
      setError('割当情報の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [curriculumId])

  useEffect(() => {
    fetchReferenceData()
    fetchAssignments()
  }, [fetchReferenceData, fetchAssignments])

  // Get available targets based on selected type
  const getAvailableTargets = () => {
    switch (targetType) {
      case 'company':
        return companies.map(c => ({ id: c.id, name: c.name }))
      case 'department':
        return departments.map(d => ({ id: d.id, name: d.name }))
      case 'group':
        return groups.map(g => ({ id: g.id, name: g.name }))
      case 'individual':
        return users.map(u => ({ id: u.id, name: `${u.name} (${u.email})` }))
      default:
        return []
    }
  }

  // Handle adding new assignment
  const handleAddAssignment = async () => {
    if (!targetId) {
      setError('割当先を選択してください')
      return
    }

    // Check for duplicate
    const exists = assignments.some(
      a => a.target_type === targetType && a.target_id === targetId
    )
    if (exists) {
      setError('この割当先はすでに登録されています')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error: insertError } = await supabase.from('curriculum_assignments').insert({
        curriculum_id: curriculumId,
        target_type: targetType,
        target_id: targetId,
        due_date: dueDate || null,
        is_required: isRequired,
        assigned_by: user?.id || null,
      })

      if (insertError) throw insertError

      setSuccessMessage('割当を追加しました')
      setTargetId('')
      setDueDate('')
      fetchAssignments()
    } catch (err) {
      console.error('Error adding assignment:', err)
      setError('割当の追加に失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle removing assignment
  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('curriculum_assignments')
        .delete()
        .eq('id', assignmentId)

      if (deleteError) throw deleteError

      setSuccessMessage('割当を削除しました')
      fetchAssignments()
    } catch (err) {
      console.error('Error removing assignment:', err)
      setError('割当の削除に失敗しました')
    }
  }

  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('ja-JP')
  }

  return (
    <div className="space-y-6">
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

      {/* Add new assignment form */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h4 className="font-medium text-text">新しい割当を追加</h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              割当タイプ
            </label>
            <select
              className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value as CurriculumTargetType)
                setTargetId('')
              }}
            >
              {(Object.keys(TARGET_TYPE_LABELS) as CurriculumTargetType[]).map((type) => (
                <option key={type} value={type}>
                  {TARGET_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              割当先
            </label>
            <select
              className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">選択してください</option>
              {getAvailableTargets().map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="期限日（任意）"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
              />
              <span className="text-sm font-medium text-text">必須カリキュラム</span>
            </label>
          </div>
        </div>

        <Button
          onClick={handleAddAssignment}
          isLoading={isSubmitting}
          leftIcon={<PlusIcon className="w-5 h-5" />}
          disabled={!targetId}
        >
          割当を追加
        </Button>
      </div>

      {/* Current assignments list */}
      <div>
        <h4 className="font-medium text-text mb-3">
          現在の割当（{assignments.length}件）
        </h4>

        {isLoading ? (
          <div className="text-center py-8 text-text-light">読み込み中...</div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-8 text-text-light bg-gray-50 rounded-lg">
            割当がありません
          </div>
        ) : (
          <div className="space-y-2">
            {assignments.map((assignment) => {
              const Icon = TARGET_TYPE_ICONS[assignment.target_type]
              return (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between p-3 bg-white border border-border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Icon className="w-5 h-5 text-text-light" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text">{assignment.targetName}</span>
                        <Badge
                          variant={TARGET_TYPE_COLORS[assignment.target_type]}
                          size="sm"
                        >
                          {TARGET_TYPE_LABELS[assignment.target_type]}
                        </Badge>
                        {assignment.is_required && (
                          <Badge variant="error" size="sm">必須</Badge>
                        )}
                      </div>
                      <div className="text-xs text-text-light mt-0.5">
                        期限: {formatDate(assignment.due_date)} |
                        割当日: {formatDate(assignment.assigned_at)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveAssignment(assignment.id)}
                    className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                    title="割当を削除"
                  >
                    <TrashIcon className="w-4 h-4 text-error" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
