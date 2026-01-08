import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  BuildingOfficeIcon,
  UsersIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { DepartmentForm, type DepartmentFormSubmitData } from '@/components/admin/DepartmentForm'
import { DepartmentCsvUpload, type CsvDepartmentRow } from '@/components/admin/DepartmentCsvUpload'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { Department, Company } from '@/types/database'

type SortField = 'name' | 'company' | 'groupCount' | 'userCount'
type SortDirection = 'asc' | 'desc'

interface DepartmentWithCounts extends Department {
  companyName: string
  parentDepartmentName: string | null
  groupCount: number
  userCount: number
}

export function DepartmentsPage() {
  const { role } = useAuth()
  const [departments, setDepartments] = useState<DepartmentWithCounts[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCompanyId, setFilterCompanyId] = useState<string>('')
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentWithCounts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

  // Fetch companies for filter and form
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

  // Fetch departments with counts
  const fetchDepartments = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data: departmentsData, error: departmentsError } = await supabase
        .from('departments')
        .select('*')
        .order('company_id')
        .order('sort_order')
        .order('name')

      if (departmentsError) throw departmentsError

      // Fetch counts and company names
      const departmentsWithDetails = await Promise.all(
        (departmentsData || []).map(async (dept) => {
          const [companyResult, parentResult, groupResult, userResult] = await Promise.all([
            supabase.from('companies').select('name').eq('id', dept.company_id).single(),
            dept.parent_department_id
              ? supabase.from('departments').select('name').eq('id', dept.parent_department_id).single()
              : Promise.resolve({ data: null }),
            supabase.from('groups').select('*', { count: 'exact', head: true }).eq('department_id', dept.id),
            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('department_id', dept.id),
          ])

          return {
            ...dept,
            companyName: companyResult.data?.name || '不明',
            parentDepartmentName: parentResult.data?.name || null,
            groupCount: groupResult.count || 0,
            userCount: userResult.count || 0,
          }
        })
      )

      setDepartments(departmentsWithDetails)
    } catch (err) {
      console.error('Error fetching departments:', err)
      setError('部署の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCompanies()
    fetchDepartments()
  }, [fetchCompanies, fetchDepartments])

  // Check permission - only super_admin can access this page
  if (role && !hasPermission(role, 'canManageDepartments')) {
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

  // Filter and sort departments
  const filteredDepartments = useMemo(() => {
    let result = departments.filter((dept) => {
      const matchesSearch = dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            dept.companyName.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCompany = !filterCompanyId || dept.company_id === filterCompanyId
      const matchesStatus = filterStatus === 'all' ||
                            (filterStatus === 'active' && dept.is_active) ||
                            (filterStatus === 'inactive' && !dept.is_active)
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
          comparison = a.companyName.localeCompare(b.companyName, 'ja')
          break
        case 'groupCount':
          comparison = a.groupCount - b.groupCount
          break
        case 'userCount':
          comparison = a.userCount - b.userCount
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [departments, searchQuery, filterCompanyId, filterStatus, sortField, sortDirection])

  // Handle department creation
  const handleCreateDepartment = async (data: DepartmentFormSubmitData) => {
    try {
      const { error: createError } = await supabase
        .from('departments')
        .insert({
          name: data.name,
          company_id: data.companyId,
          parent_department_id: data.parentDepartmentId,
          sort_order: data.sortOrder,
          is_active: data.isActive,
        })

      if (createError) throw createError

      setSuccessMessage('部署を追加しました')
      setIsFormModalOpen(false)
      fetchDepartments()
    } catch (err) {
      console.error('Error creating department:', err)
      setError('部署の追加に失敗しました')
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

      setSuccessMessage('部署情報を更新しました')
      setIsFormModalOpen(false)
      setSelectedDepartment(null)
      fetchDepartments()
    } catch (err) {
      console.error('Error updating department:', err)
      setError('部署情報の更新に失敗しました')
    }
  }

  // Handle department deletion
  const handleDeleteDepartment = async () => {
    if (!selectedDepartment) return

    try {
      // Check if department has related data
      if (selectedDepartment.groupCount > 0 || selectedDepartment.userCount > 0) {
        setError('関連データがある部署は削除できません。先にグループ・ユーザーを削除してください。')
        setIsDeleteModalOpen(false)
        return
      }

      // Check for child departments
      const hasChildren = departments.some(d => d.parent_department_id === selectedDepartment.id)
      if (hasChildren) {
        setError('子部署がある部署は削除できません。先に子部署を削除してください。')
        setIsDeleteModalOpen(false)
        return
      }

      const { error: deleteError } = await supabase
        .from('departments')
        .delete()
        .eq('id', selectedDepartment.id)

      if (deleteError) throw deleteError

      setSuccessMessage('部署を削除しました')
      setIsDeleteModalOpen(false)
      setSelectedDepartment(null)
      fetchDepartments()
    } catch (err) {
      console.error('Error deleting department:', err)
      setError('部署の削除に失敗しました')
    }
  }

  // Handle CSV import
  const handleCsvImport = async (csvDepartments: CsvDepartmentRow[]) => {
    try {
      let addCount = 0
      let deleteCount = 0
      const errors: string[] = []

      for (const row of csvDepartments) {
        const company = companies.find(c => c.name.toLowerCase() === row.companyName.toLowerCase())
        if (!company) {
          errors.push(`企業「${row.companyName}」が見つかりません`)
          continue
        }

        // Find parent department if specified
        let parentDepartmentId: string | null = null
        if (row.parentDepartmentName) {
          const parent = departments.find(
            d => d.company_id === company.id && d.name.toLowerCase() === row.parentDepartmentName.toLowerCase()
          )
          if (!parent) {
            errors.push(`親部署「${row.parentDepartmentName}」が見つかりません（${row.departmentName}）`)
            continue
          }
          parentDepartmentId = parent.id
        }

        if (row.action === 'add') {
          // Check if department already exists
          const existing = departments.find(
            d => d.company_id === company.id && d.name.toLowerCase() === row.departmentName.toLowerCase()
          )
          if (existing) {
            errors.push(`部署「${row.departmentName}」は既に存在します`)
            continue
          }

          const { error: insertError } = await supabase
            .from('departments')
            .insert({
              name: row.departmentName,
              company_id: company.id,
              parent_department_id: parentDepartmentId,
              sort_order: row.sortOrder,
              is_active: true,
            })

          if (insertError) {
            errors.push(`部署「${row.departmentName}」の追加に失敗: ${insertError.message}`)
          } else {
            addCount++
          }
        } else if (row.action === 'delete') {
          const existing = departments.find(
            d => d.company_id === company.id && d.name.toLowerCase() === row.departmentName.toLowerCase()
          )
          if (!existing) {
            errors.push(`部署「${row.departmentName}」が見つかりません`)
            continue
          }

          // Check for related data
          const deptWithCounts = departments.find(d => d.id === existing.id) as DepartmentWithCounts | undefined
          if (deptWithCounts && (deptWithCounts.groupCount > 0 || deptWithCounts.userCount > 0)) {
            errors.push(`部署「${row.departmentName}」には関連データがあるため削除できません`)
            continue
          }

          const { error: deleteError } = await supabase
            .from('departments')
            .delete()
            .eq('id', existing.id)

          if (deleteError) {
            errors.push(`部署「${row.departmentName}」の削除に失敗: ${deleteError.message}`)
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
        fetchDepartments()
      }

      setIsCsvModalOpen(false)
    } catch (err) {
      console.error('Error importing CSV:', err)
      setError('CSVインポートに失敗しました')
    }
  }

  // Get raw departments for the form (without counts)
  const rawDepartments = departments.map(d => ({
    id: d.id,
    company_id: d.company_id,
    parent_department_id: d.parent_department_id,
    name: d.name,
    sort_order: d.sort_order,
    is_active: d.is_active,
    created_at: d.created_at,
    updated_at: d.updated_at,
  })) as Department[]

  // Table columns
  const columns = [
    {
      key: 'name',
      header: '部署名',
      sortable: true,
      render: (dept: DepartmentWithCounts) => (
        <div className="flex items-center gap-2">
          <BuildingOfficeIcon className="w-5 h-5 text-primary" />
          <div>
            <span className="font-medium">{dept.name}</span>
            {dept.parentDepartmentName && (
              <span className="text-sm text-text-light ml-2">
                (親: {dept.parentDepartmentName})
              </span>
            )}
          </div>
          {!dept.is_active && (
            <Badge variant="default" size="sm">無効</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'company',
      header: '所属企業',
      sortable: true,
      render: (dept: DepartmentWithCounts) => (
        <span className="text-sm">{dept.companyName}</span>
      ),
    },
    {
      key: 'groupCount',
      header: '構成',
      sortable: true,
      render: (dept: DepartmentWithCounts) => (
        <div className="flex items-center gap-4 text-sm text-text-light">
          <span>グループ: {dept.groupCount}</span>
          <span className="flex items-center gap-1">
            <UsersIcon className="w-4 h-4" />
            {dept.userCount}人
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (dept: DepartmentWithCounts) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedDepartment(dept)
              setIsFormModalOpen(true)
            }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="編集"
          >
            <PencilIcon className="w-4 h-4 text-text-light" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedDepartment(dept)
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
          <h1 className="text-2xl font-bold text-text">部署管理</h1>
          <p className="text-text-light mt-1">企業内の部署構造を管理</p>
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
              setSelectedDepartment(null)
              setIsFormModalOpen(true)
            }}
          >
            部署追加
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

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="部署名・企業名で検索..."
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

      {/* Departments table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Table
          columns={columns}
          data={filteredDepartments}
          keyExtractor={(dept) => dept.id}
          isLoading={isLoading}
          emptyMessage="部署が登録されていません"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      </motion.div>

      {/* Department form modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setSelectedDepartment(null)
        }}
        title={selectedDepartment ? '部署編集' : '部署追加'}
      >
        <DepartmentForm
          department={selectedDepartment}
          companies={companies}
          departments={rawDepartments}
          onSubmit={selectedDepartment ? handleUpdateDepartment : handleCreateDepartment}
          onCancel={() => {
            setIsFormModalOpen(false)
            setSelectedDepartment(null)
          }}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedDepartment(null)
        }}
        title="部署削除の確認"
        size="sm"
      >
        <p className="text-text">
          <span className="font-semibold">{selectedDepartment?.name}</span>{' '}
          を削除してもよろしいですか？この操作は取り消せません。
        </p>
        {selectedDepartment && (selectedDepartment.groupCount > 0 || selectedDepartment.userCount > 0) && (
          <Alert variant="warning" className="mt-4">
            この部署には以下のデータが存在します：
            <ul className="list-disc list-inside mt-2">
              {selectedDepartment.groupCount > 0 && <li>グループ: {selectedDepartment.groupCount}件</li>}
              {selectedDepartment.userCount > 0 && <li>ユーザー: {selectedDepartment.userCount}人</li>}
            </ul>
            先にこれらのデータを削除してください。
          </Alert>
        )}
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setSelectedDepartment(null)
            }}
          >
            キャンセル
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteDepartment}
            disabled={
              selectedDepartment
                ? selectedDepartment.groupCount > 0 || selectedDepartment.userCount > 0
                : false
            }
          >
            削除する
          </Button>
        </ModalFooter>
      </Modal>

      {/* CSV import modal */}
      <Modal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        title="部署CSVインポート"
        size="lg"
      >
        <DepartmentCsvUpload
          companies={companies}
          onImport={handleCsvImport}
          onCancel={() => setIsCsvModalOpen(false)}
        />
      </Modal>
    </div>
  )
}
