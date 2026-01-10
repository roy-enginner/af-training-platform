import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  BuildingOffice2Icon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { CompanyForm, type CompanyFormSubmitData } from '@/components/admin/CompanyForm'
import { useAuth } from '@/hooks/useAuth'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import { hasPermission } from '@/types/database'
import type { Company } from '@/types/database'

type SortField = 'name' | 'userCount' | 'contractStartDate'
type SortDirection = 'asc' | 'desc'

interface CompanyWithCounts extends Company {
  departmentCount: number
  groupCount: number
  userCount: number
}

export function CompaniesPage() {
  const { role } = useAuth()
  const [companies, setCompanies] = useState<CompanyWithCounts[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithCounts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Fetch companies with counts
  const fetchCompanies = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('*')
        .order('name')

      if (companiesError) throw companiesError

      // Fetch counts for each company
      const companiesWithCounts = await Promise.all(
        (companiesData || []).map(async (company) => {
          const [deptResult, groupResult, userResult] = await Promise.all([
            supabase
              .from('departments')
              .select('*', { count: 'exact', head: true })
              .eq('company_id', company.id),
            supabase
              .from('groups')
              .select('*', { count: 'exact', head: true })
              .eq('company_id', company.id),
            supabase
              .from('profiles')
              .select('*', { count: 'exact', head: true })
              .eq('company_id', company.id),
          ])

          return {
            ...company,
            departmentCount: deptResult.count || 0,
            groupCount: groupResult.count || 0,
            userCount: userResult.count || 0,
          }
        })
      )

      setCompanies(companiesWithCounts)
    } catch (err) {
      console.error('Error fetching companies:', err)
      setError('企業の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  // Check permission - only super_admin can access this page
  if (role && !hasPermission(role, 'canManageCompanies')) {
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

  // Filter and sort companies
  const filteredCompanies = useMemo(() => {
    let result = companies.filter((company) =>
      company.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'ja')
          break
        case 'userCount':
          comparison = a.userCount - b.userCount
          break
        case 'contractStartDate':
          comparison = (a.contract_start_date || '').localeCompare(b.contract_start_date || '')
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [companies, searchQuery, sortField, sortDirection])

  // Handle company creation
  const handleCreateCompany = async (data: CompanyFormSubmitData) => {
    try {
      const { error: createError } = await supabase
        .from('companies')
        .insert({
          name: data.name,
          daily_token_limit: data.dailyTokenLimit,
          contract_start_date: data.contractStartDate,
          contract_end_date: data.contractEndDate,
          notes: data.notes,
          is_active: data.isActive,
        })

      if (createError) throw createError

      setSuccessMessage('企業を追加しました')
      setIsFormModalOpen(false)
      fetchCompanies()
    } catch (err) {
      console.error('Error creating company:', err)
      setError('企業の追加に失敗しました')
    }
  }

  // Handle company update
  const handleUpdateCompany = async (data: CompanyFormSubmitData) => {
    if (!selectedCompany) return

    try {
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          name: data.name,
          daily_token_limit: data.dailyTokenLimit,
          contract_start_date: data.contractStartDate,
          contract_end_date: data.contractEndDate,
          notes: data.notes,
          is_active: data.isActive,
        })
        .eq('id', selectedCompany.id)

      if (updateError) throw updateError

      setSuccessMessage('企業情報を更新しました')
      setIsFormModalOpen(false)
      setSelectedCompany(null)
      fetchCompanies()
    } catch (err) {
      console.error('Error updating company:', err)
      setError('企業情報の更新に失敗しました')
    }
  }

  // Handle company deletion
  const handleDeleteCompany = async () => {
    if (!selectedCompany) return

    try {
      // Check if company has related data
      if (selectedCompany.departmentCount > 0 || selectedCompany.groupCount > 0 || selectedCompany.userCount > 0) {
        setError('関連データがある企業は削除できません。先に部署・グループ・ユーザーを削除してください。')
        setIsDeleteModalOpen(false)
        return
      }

      const { error: deleteError } = await supabase
        .from('companies')
        .delete()
        .eq('id', selectedCompany.id)

      if (deleteError) throw deleteError

      setSuccessMessage('企業を削除しました')
      setIsDeleteModalOpen(false)
      setSelectedCompany(null)
      fetchCompanies()
    } catch (err) {
      console.error('Error deleting company:', err)
      setError('企業の削除に失敗しました')
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
      header: '企業名',
      sortable: true,
      render: (company: CompanyWithCounts) => (
        <div className="flex items-center gap-2">
          <BuildingOffice2Icon className="w-5 h-5 text-primary" />
          <span className="font-medium">{company.name}</span>
          {!company.is_active && (
            <Badge variant="default" size="sm">無効</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'userCount',
      header: '構成',
      sortable: true,
      render: (company: CompanyWithCounts) => (
        <div className="flex items-center gap-4 text-sm text-text-light">
          <span>部署: {company.departmentCount}</span>
          <span>グループ: {company.groupCount}</span>
          <span className="flex items-center gap-1">
            <UsersIcon className="w-4 h-4" />
            {company.userCount}人
          </span>
        </div>
      ),
    },
    {
      key: 'contractStartDate',
      header: '契約期間',
      sortable: true,
      render: (company: CompanyWithCounts) => (
        <span className="text-sm">
          {formatDate(company.contract_start_date)} 〜 {formatDate(company.contract_end_date)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (company: CompanyWithCounts) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedCompany(company)
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
              setSelectedCompany(company)
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
      {/* Breadcrumb */}
      <Breadcrumb />

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">企業管理</h1>
          <p className="text-text-light mt-1">契約企業の登録・管理</p>
        </div>
        <Button
          leftIcon={<PlusIcon className="w-5 h-5" />}
          onClick={() => {
            setSelectedCompany(null)
            setIsFormModalOpen(true)
          }}
        >
          企業追加
        </Button>
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

      {/* Search */}
      <Card padding="sm">
        <Input
          placeholder="企業名で検索..."
          leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Card>

      {/* Companies table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Table
          columns={columns}
          data={filteredCompanies}
          keyExtractor={(company) => company.id}
          isLoading={isLoading}
          emptyMessage="企業が登録されていません"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      </motion.div>

      {/* Company form modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setSelectedCompany(null)
        }}
        title={selectedCompany ? '企業編集' : '企業追加'}
      >
        <CompanyForm
          company={selectedCompany}
          onSubmit={selectedCompany ? handleUpdateCompany : handleCreateCompany}
          onCancel={() => {
            setIsFormModalOpen(false)
            setSelectedCompany(null)
          }}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedCompany(null)
        }}
        title="企業削除の確認"
        size="sm"
      >
        <p className="text-text">
          <span className="font-semibold">{selectedCompany?.name}</span>{' '}
          を削除してもよろしいですか？この操作は取り消せません。
        </p>
        {selectedCompany && (selectedCompany.departmentCount > 0 || selectedCompany.groupCount > 0 || selectedCompany.userCount > 0) && (
          <Alert variant="warning" className="mt-4">
            この企業には以下のデータが存在します：
            <ul className="list-disc list-inside mt-2">
              {selectedCompany.departmentCount > 0 && <li>部署: {selectedCompany.departmentCount}件</li>}
              {selectedCompany.groupCount > 0 && <li>グループ: {selectedCompany.groupCount}件</li>}
              {selectedCompany.userCount > 0 && <li>ユーザー: {selectedCompany.userCount}人</li>}
            </ul>
            先にこれらのデータを削除してください。
          </Alert>
        )}
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setSelectedCompany(null)
            }}
          >
            キャンセル
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteCompany}
            disabled={
              selectedCompany
                ? selectedCompany.departmentCount > 0 || selectedCompany.groupCount > 0 || selectedCompany.userCount > 0
                : false
            }
          >
            削除する
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
