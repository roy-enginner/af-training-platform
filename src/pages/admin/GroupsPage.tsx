import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  UsersIcon,
  CalendarDaysIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { GroupForm, type GroupFormSubmitData } from '@/components/admin/GroupForm'
import { GroupCsvUpload, type CsvGroupRow } from '@/components/admin/GroupCsvUpload'
import { TrainingDatesManager } from '@/components/admin/TrainingDatesManager'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { Group, GroupTrainingDate, Company, Department } from '@/types/database'

type SortField = 'name' | 'company' | 'memberCount' | 'startDate'
type SortDirection = 'asc' | 'desc'

interface GroupWithCount extends Group {
  memberCount: number
  companyName?: string
  departmentName?: string
  training_dates?: GroupTrainingDate[]
}

export function GroupsPage() {
  const { role } = useAuth()
  const [groups, setGroups] = useState<GroupWithCount[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCompanyId, setFilterCompanyId] = useState<string>('')
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isTrainingDatesModalOpen, setIsTrainingDatesModalOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<GroupWithCount | null>(null)
  const [trainingDates, setTrainingDates] = useState<GroupTrainingDate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

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

  // Fetch groups with member count and company/department names
  const fetchGroups = useCallback(async () => {
    try {
      setIsLoading(true)

      // Fetch groups
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('*')
        .order('name')

      if (groupsError) throw groupsError

      // Fetch member counts and names for each group
      const groupsWithDetails = await Promise.all(
        (groupsData || []).map(async (group) => {
          const [countResult, companyResult, deptResult] = await Promise.all([
            supabase
              .from('profiles')
              .select('*', { count: 'exact', head: true })
              .eq('group_id', group.id),
            group.company_id
              ? supabase.from('companies').select('name').eq('id', group.company_id).single()
              : Promise.resolve({ data: null }),
            group.department_id
              ? supabase.from('departments').select('name').eq('id', group.department_id).single()
              : Promise.resolve({ data: null }),
          ])

          return {
            ...group,
            memberCount: countResult.count || 0,
            companyName: companyResult.data?.name,
            departmentName: deptResult.data?.name,
          }
        })
      )

      setGroups(groupsWithDetails)
    } catch (err) {
      console.error('Error fetching groups:', err)
      setError('グループの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
    fetchCompanies()
    fetchDepartments()
  }, [fetchGroups, fetchCompanies, fetchDepartments])

  // Fetch training dates for a specific group
  const fetchTrainingDates = useCallback(async (groupId: string) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('group_training_dates')
        .select('*')
        .eq('group_id', groupId)
        .order('training_date')

      if (fetchError) throw fetchError
      setTrainingDates(data || [])
    } catch (err) {
      console.error('Error fetching training dates:', err)
      setTrainingDates([])
    }
  }, [])

  // Check permission - only super_admin can access this page
  if (role && !hasPermission(role, 'canManageGroups')) {
    return <Navigate to="/admin" replace />
  }

  // Sort handler (accepts string for Table component compatibility)
  const handleSort = (field: string) => {
    const sortableField = field as SortField
    if (sortField === sortableField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(sortableField)
      setSortDirection('asc')
    }
  }

  // Filter and sort groups
  const filteredGroups = useMemo(() => {
    let result = groups.filter((group) => {
      const matchesSearch = group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            group.companyName?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCompany = !filterCompanyId || group.company_id === filterCompanyId
      const matchesStatus = filterStatus === 'all' ||
                            (filterStatus === 'active' && group.is_active) ||
                            (filterStatus === 'inactive' && !group.is_active)
      return matchesSearch && matchesCompany && matchesStatus
    })

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'ja')
          break
        case 'company':
          comparison = (a.companyName || '').localeCompare(b.companyName || '', 'ja')
          break
        case 'memberCount':
          comparison = a.memberCount - b.memberCount
          break
        case 'startDate':
          comparison = (a.start_date || '').localeCompare(b.start_date || '')
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [groups, searchQuery, filterCompanyId, filterStatus, sortField, sortDirection])

  // Handle group creation
  const handleCreateGroup = async (data: GroupFormSubmitData) => {
    try {
      const { error: createError } = await supabase
        .from('groups')
        .insert({
          name: data.name,
          company_id: data.companyId,
          department_id: data.departmentId,
          daily_token_limit: data.dailyTokenLimit,
          start_date: data.startDate,
          end_date: data.endDate,
          review_period_days: data.reviewPeriodDays,
          is_active: data.isActive,
        })

      if (createError) throw createError

      setSuccessMessage('グループを作成しました')
      setIsGroupModalOpen(false)
      fetchGroups()
    } catch (err) {
      console.error('Error creating group:', err)
      setError('グループの作成に失敗しました')
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
      fetchGroups()
    } catch (err) {
      console.error('Error updating group:', err)
      setError('グループの更新に失敗しました')
    }
  }

  // Handle group deletion
  const handleDeleteGroup = async () => {
    if (!selectedGroup) return

    try {
      // Check if group has members
      if (selectedGroup.memberCount > 0) {
        setError('所属メンバーがいるグループは削除できません')
        setIsDeleteModalOpen(false)
        return
      }

      const { error: deleteError } = await supabase
        .from('groups')
        .delete()
        .eq('id', selectedGroup.id)

      if (deleteError) throw deleteError

      setSuccessMessage('グループを削除しました')
      setIsDeleteModalOpen(false)
      setSelectedGroup(null)
      fetchGroups()
    } catch (err) {
      console.error('Error deleting group:', err)
      setError('グループの削除に失敗しました')
    }
  }

  // Handle CSV import
  const handleCsvImport = async (csvGroups: CsvGroupRow[]) => {
    try {
      let addCount = 0
      let deleteCount = 0
      const errors: string[] = []

      for (const row of csvGroups) {
        const company = companies.find(c => c.name.toLowerCase() === row.companyName.toLowerCase())
        if (!company) {
          errors.push(`企業「${row.companyName}」が見つかりません`)
          continue
        }

        // Find department if specified
        let departmentId: string | null = null
        if (row.departmentName) {
          const dept = departments.find(
            d => d.company_id === company.id && d.name.toLowerCase() === row.departmentName.toLowerCase()
          )
          if (!dept) {
            errors.push(`部署「${row.departmentName}」が見つかりません（${row.groupName}）`)
            continue
          }
          departmentId = dept.id
        }

        if (row.action === 'add') {
          // Check if group already exists
          const existing = groups.find(
            g => g.company_id === company.id && g.name.toLowerCase() === row.groupName.toLowerCase()
          )
          if (existing) {
            errors.push(`グループ「${row.groupName}」は既に存在します`)
            continue
          }

          const { error: insertError } = await supabase
            .from('groups')
            .insert({
              name: row.groupName,
              company_id: company.id,
              department_id: departmentId,
              daily_token_limit: row.dailyTokenLimit,
              start_date: row.startDate || null,
              end_date: row.endDate || null,
              review_period_days: row.reviewPeriodDays,
              is_active: true,
            })

          if (insertError) {
            errors.push(`グループ「${row.groupName}」の追加に失敗: ${insertError.message}`)
          } else {
            addCount++
          }
        } else if (row.action === 'delete') {
          const existing = groups.find(
            g => g.company_id === company.id && g.name.toLowerCase() === row.groupName.toLowerCase()
          )
          if (!existing) {
            errors.push(`グループ「${row.groupName}」が見つかりません`)
            continue
          }

          // Check for members
          if (existing.memberCount > 0) {
            errors.push(`グループ「${row.groupName}」にはメンバーがいるため削除できません`)
            continue
          }

          const { error: deleteError } = await supabase
            .from('groups')
            .delete()
            .eq('id', existing.id)

          if (deleteError) {
            errors.push(`グループ「${row.groupName}」の削除に失敗: ${deleteError.message}`)
          } else {
            deleteCount++
          }
        }
      }

      if (errors.length > 0) {
        setError(`一部のインポートに失敗しました:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...他${errors.length - 5}件` : ''}`)
      }

      if (addCount > 0 || deleteCount > 0) {
        setSuccessMessage(`CSV処理完了: 追加${addCount}件、削除${deleteCount}件`)
        fetchGroups()
      }

      setIsCsvModalOpen(false)
    } catch (err) {
      console.error('Error importing CSV:', err)
      setError('CSVインポートに失敗しました')
    }
  }

  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  // Table columns
  const columns = [
    {
      key: 'name',
      header: 'グループ名',
      sortable: true,
      render: (group: GroupWithCount) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{group.name}</span>
          {!group.is_active && (
            <Badge variant="default" size="sm">無効</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'company',
      header: '所属',
      sortable: true,
      render: (group: GroupWithCount) => (
        <div className="text-sm">
          {group.companyName ? (
            <div>
              <span className="text-text">{group.companyName}</span>
              {group.departmentName && (
                <span className="text-text-light"> / {group.departmentName}</span>
              )}
            </div>
          ) : (
            <span className="text-text-light">-</span>
          )}
        </div>
      ),
    },
    {
      key: 'memberCount',
      header: '人数',
      sortable: true,
      render: (group: GroupWithCount) => (
        <div className="flex items-center gap-2">
          <UsersIcon className="w-4 h-4 text-text-light" />
          <span>{group.memberCount}人</span>
        </div>
      ),
    },
    {
      key: 'startDate',
      header: '研修期間',
      sortable: true,
      render: (group: GroupWithCount) => (
        <span className="text-sm">
          {formatDate(group.start_date)} 〜 {formatDate(group.end_date)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-32',
      render: (group: GroupWithCount) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedGroup(group)
              fetchTrainingDates(group.id)
              setIsTrainingDatesModalOpen(true)
            }}
            className="p-2 rounded-lg hover:bg-blue-50 transition-colors"
            title="研修日管理"
          >
            <CalendarDaysIcon className="w-4 h-4 text-primary" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedGroup(group)
              setIsGroupModalOpen(true)
            }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="編集"
          >
            <PencilIcon className="w-4 h-4 text-text-light" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedGroup(group)
              setIsDeleteModalOpen(true)
            }}
            className="p-2 rounded-lg hover:bg-red-50 transition-colors"
            title="削除"
          >
            <TrashIcon className="w-4 h-4 text-error" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">グループ管理</h1>
          <p className="text-text-light mt-1">研修グループの管理（同じ研修を受けるユーザーの集まり）</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            leftIcon={<ArrowUpTrayIcon className="w-5 h-5" />}
            onClick={() => setIsCsvModalOpen(true)}
          >
            CSVインポート
          </Button>
          <Button
            leftIcon={<PlusIcon className="w-5 h-5" />}
            onClick={() => {
              setSelectedGroup(null)
              setIsGroupModalOpen(true)
            }}
          >
            グループ追加
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

      {/* Search and Filters */}
      <Card padding="sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="グループ名・企業名で検索..."
                leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              value={filterCompanyId}
              onChange={(e) => setFilterCompanyId(e.target.value)}
            >
              <option value="">すべての企業</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <select
              className="px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">すべてのステータス</option>
              <option value="active">有効のみ</option>
              <option value="inactive">無効のみ</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Groups table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Table
          columns={columns}
          data={filteredGroups}
          keyExtractor={(group) => group.id}
          isLoading={isLoading}
          emptyMessage="グループが登録されていません"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      </motion.div>

      {/* Group form modal */}
      <Modal
        isOpen={isGroupModalOpen}
        onClose={() => {
          setIsGroupModalOpen(false)
          setSelectedGroup(null)
        }}
        title={selectedGroup ? 'グループ編集' : 'グループ追加'}
      >
        <GroupForm
          group={selectedGroup}
          companies={companies}
          departments={departments}
          onSubmit={selectedGroup ? handleUpdateGroup : handleCreateGroup}
          onCancel={() => {
            setIsGroupModalOpen(false)
            setSelectedGroup(null)
          }}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedGroup(null)
        }}
        title="グループ削除の確認"
        size="sm"
      >
        <p className="text-text">
          <span className="font-semibold">{selectedGroup?.name}</span>{' '}
          を削除してもよろしいですか？この操作は取り消せません。
        </p>
        {selectedGroup && selectedGroup.memberCount > 0 && (
          <Alert variant="warning" className="mt-4">
            このグループには{selectedGroup.memberCount}人のメンバーが所属しています。
            先にメンバーを別のグループに移動してください。
          </Alert>
        )}
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setSelectedGroup(null)
            }}
          >
            キャンセル
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteGroup}
            disabled={selectedGroup ? selectedGroup.memberCount > 0 : false}
          >
            削除する
          </Button>
        </ModalFooter>
      </Modal>

      {/* Training dates modal */}
      <Modal
        isOpen={isTrainingDatesModalOpen}
        onClose={() => {
          setIsTrainingDatesModalOpen(false)
          setSelectedGroup(null)
          setTrainingDates([])
        }}
        title={`研修日管理 - ${selectedGroup?.name || ''}`}
        size="lg"
      >
        {selectedGroup && (
          <TrainingDatesManager
            groupId={selectedGroup.id}
            trainingDates={trainingDates}
            onUpdate={() => fetchTrainingDates(selectedGroup.id)}
          />
        )}
        <ModalFooter>
          <Button
            onClick={() => {
              setIsTrainingDatesModalOpen(false)
              setSelectedGroup(null)
              setTrainingDates([])
            }}
          >
            閉じる
          </Button>
        </ModalFooter>
      </Modal>

      {/* CSV import modal */}
      <Modal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        title="グループCSVインポート"
        size="lg"
      >
        <GroupCsvUpload
          companies={companies}
          departments={departments}
          onImport={handleCsvImport}
          onCancel={() => setIsCsvModalOpen(false)}
        />
      </Modal>
    </div>
  )
}
