import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  ClockIcon,
  TagIcon,
  UserGroupIcon,
  SparklesIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { CurriculumForm, type CurriculumFormSubmitData } from '@/components/admin/CurriculumForm'
import { CurriculumGenerateForm } from '@/components/admin/CurriculumGenerateForm'
import { CurriculumFromMaterialForm } from '@/components/admin/CurriculumFromMaterialForm'
import { CurriculumAssignmentManager } from '@/components/admin/CurriculumAssignmentManager'
import { CurriculumJobsList } from '@/components/admin/CurriculumJobsList'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { Curriculum, ContentType, DifficultyLevel } from '@/types/database'

type SortField = 'name' | 'contentType' | 'difficulty' | 'sortOrder'
type SortDirection = 'asc' | 'desc'

interface CurriculumWithCount extends Curriculum {
  assignmentCount: number
}

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  document: 'ドキュメント',
  video: '動画',
  quiz: 'クイズ',
  external: '外部リンク',
}

const CONTENT_TYPE_COLORS: Record<ContentType, 'primary' | 'success' | 'warning' | 'error'> = {
  document: 'primary',
  video: 'success',
  quiz: 'warning',
  external: 'error',
}

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  beginner: '初級',
  intermediate: '中級',
  advanced: '上級',
  mixed: '混合',
}

const DIFFICULTY_COLORS: Record<DifficultyLevel, 'success' | 'warning' | 'error' | 'primary'> = {
  beginner: 'success',
  intermediate: 'warning',
  advanced: 'error',
  mixed: 'primary',
}

export function CurriculaPage() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [curricula, setCurricula] = useState<CurriculumWithCount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterContentType, setFilterContentType] = useState<ContentType | ''>('')
  const [filterDifficulty, setFilterDifficulty] = useState<DifficultyLevel | ''>('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false)
  const [isFromMaterialModalOpen, setIsFromMaterialModalOpen] = useState(false)
  const [selectedCurriculum, setSelectedCurriculum] = useState<CurriculumWithCount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('sortOrder')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Fetch curricula with assignment count
  const fetchCurricula = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data: curriculaData, error: curriculaError } = await supabase
        .from('curricula')
        .select('*')
        .order('sort_order')

      if (curriculaError) throw curriculaError

      // Fetch assignment counts for each curriculum
      const curriculaWithCounts = await Promise.all(
        (curriculaData || []).map(async (curriculum) => {
          const { count } = await supabase
            .from('curriculum_assignments')
            .select('*', { count: 'exact', head: true })
            .eq('curriculum_id', curriculum.id)

          return {
            ...curriculum,
            assignmentCount: count || 0,
          }
        })
      )

      setCurricula(curriculaWithCounts)
    } catch (err) {
      console.error('Error fetching curricula:', err)
      setError('カリキュラムの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCurricula()
  }, [fetchCurricula])

  // Check permission - only super_admin can access this page
  if (role && !hasPermission(role, 'canManageCurriculum')) {
    return <Navigate to="/admin" replace />
  }

  // Sort handler
  const handleSort = (field: string) => {
    const sortableField = field as SortField
    if (sortField === sortableField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(sortableField)
      setSortDirection('asc')
    }
  }

  // Filter and sort curricula
  const filteredCurricula = useMemo(() => {
    let result = curricula.filter((curriculum) => {
      const matchesSearch =
        curriculum.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        curriculum.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        curriculum.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      const matchesContentType = !filterContentType || curriculum.content_type === filterContentType
      const matchesDifficulty = !filterDifficulty || curriculum.difficulty_level === filterDifficulty
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && curriculum.is_active) ||
        (filterStatus === 'inactive' && !curriculum.is_active)
      return matchesSearch && matchesContentType && matchesDifficulty && matchesStatus
    })

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'ja')
          break
        case 'contentType':
          comparison = a.content_type.localeCompare(b.content_type)
          break
        case 'difficulty':
          const difficultyOrder: Record<DifficultyLevel, number> = { beginner: 1, intermediate: 2, advanced: 3, mixed: 4 }
          comparison = difficultyOrder[a.difficulty_level] - difficultyOrder[b.difficulty_level]
          break
        case 'sortOrder':
          comparison = a.sort_order - b.sort_order
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [curricula, searchQuery, filterContentType, filterDifficulty, filterStatus, sortField, sortDirection])

  // Handle curriculum creation
  const handleCreateCurriculum = async (data: CurriculumFormSubmitData) => {
    try {
      const { error: createError } = await supabase.from('curricula').insert({
        name: data.name,
        description: data.description,
        content_type: data.contentType,
        content_url: data.contentUrl,
        duration_minutes: data.durationMinutes,
        difficulty_level: data.difficultyLevel,
        tags: data.tags,
        sort_order: data.sortOrder,
        is_active: data.isActive,
      })

      if (createError) throw createError

      setSuccessMessage('カリキュラムを作成しました')
      setIsFormModalOpen(false)
      fetchCurricula()
    } catch (err) {
      console.error('Error creating curriculum:', err)
      setError('カリキュラムの作成に失敗しました')
    }
  }

  // Handle curriculum update
  const handleUpdateCurriculum = async (data: CurriculumFormSubmitData) => {
    if (!selectedCurriculum) return

    try {
      const { error: updateError } = await supabase
        .from('curricula')
        .update({
          name: data.name,
          description: data.description,
          content_type: data.contentType,
          content_url: data.contentUrl,
          duration_minutes: data.durationMinutes,
          difficulty_level: data.difficultyLevel,
          tags: data.tags,
          sort_order: data.sortOrder,
          is_active: data.isActive,
        })
        .eq('id', selectedCurriculum.id)

      if (updateError) throw updateError

      setSuccessMessage('カリキュラムを更新しました')
      setIsFormModalOpen(false)
      setSelectedCurriculum(null)
      fetchCurricula()
    } catch (err) {
      console.error('Error updating curriculum:', err)
      setError('カリキュラムの更新に失敗しました')
    }
  }

  // Handle curriculum deletion
  const handleDeleteCurriculum = async () => {
    if (!selectedCurriculum) return

    try {
      // Check if curriculum has assignments
      if (selectedCurriculum.assignmentCount > 0) {
        setError('割り当てがあるカリキュラムは削除できません')
        setIsDeleteModalOpen(false)
        return
      }

      const { error: deleteError } = await supabase
        .from('curricula')
        .delete()
        .eq('id', selectedCurriculum.id)

      if (deleteError) throw deleteError

      setSuccessMessage('カリキュラムを削除しました')
      setIsDeleteModalOpen(false)
      setSelectedCurriculum(null)
      fetchCurricula()
    } catch (err) {
      console.error('Error deleting curriculum:', err)
      setError('カリキュラムの削除に失敗しました')
    }
  }

  // Format duration
  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '-'
    if (minutes < 60) return `${minutes}分`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}時間${mins}分` : `${hours}時間`
  }

  // Table columns
  const columns = [
    {
      key: 'sortOrder',
      header: '順序',
      sortable: true,
      className: 'w-16',
      render: (curriculum: CurriculumWithCount) => (
        <span className="text-text-light">{curriculum.sort_order}</span>
      ),
    },
    {
      key: 'name',
      header: 'カリキュラム名',
      sortable: true,
      render: (curriculum: CurriculumWithCount) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{curriculum.name}</span>
            {!curriculum.is_active && <Badge variant="default" size="sm">無効</Badge>}
          </div>
          {curriculum.description && (
            <p className="text-sm text-text-light mt-1 line-clamp-1">
              {curriculum.description}
            </p>
          )}
          {curriculum.tags && curriculum.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <TagIcon className="w-3 h-3 text-text-light" />
              <span className="text-xs text-text-light">
                {curriculum.tags.slice(0, 3).join(', ')}
                {curriculum.tags.length > 3 && ` +${curriculum.tags.length - 3}`}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'contentType',
      header: 'タイプ',
      sortable: true,
      render: (curriculum: CurriculumWithCount) => (
        <Badge variant={CONTENT_TYPE_COLORS[curriculum.content_type]} size="sm">
          {CONTENT_TYPE_LABELS[curriculum.content_type]}
        </Badge>
      ),
    },
    {
      key: 'difficulty',
      header: '難易度',
      sortable: true,
      render: (curriculum: CurriculumWithCount) => (
        <Badge variant={DIFFICULTY_COLORS[curriculum.difficulty_level]} size="sm">
          {DIFFICULTY_LABELS[curriculum.difficulty_level]}
        </Badge>
      ),
    },
    {
      key: 'duration',
      header: '所要時間',
      render: (curriculum: CurriculumWithCount) => (
        <div className="flex items-center gap-1 text-sm text-text-light">
          <ClockIcon className="w-4 h-4" />
          <span>{formatDuration(curriculum.duration_minutes)}</span>
        </div>
      ),
    },
    {
      key: 'assignments',
      header: '割当',
      render: (curriculum: CurriculumWithCount) => (
        <div className="flex items-center gap-1 text-sm">
          <UserGroupIcon className="w-4 h-4 text-text-light" />
          <span>{curriculum.assignmentCount}件</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-32',
      render: (curriculum: CurriculumWithCount) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedCurriculum(curriculum)
              setIsAssignModalOpen(true)
            }}
            className="p-2 rounded-lg hover:bg-blue-50 transition-colors"
            title="割当管理"
          >
            <UserGroupIcon className="w-4 h-4 text-primary" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedCurriculum(curriculum)
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
              setSelectedCurriculum(curriculum)
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
          <h1 className="text-2xl font-bold text-text">カリキュラム管理</h1>
          <p className="text-text-light mt-1">研修カリキュラムの作成・管理</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            leftIcon={<DocumentDuplicateIcon className="w-5 h-5" />}
            onClick={() => setIsFromMaterialModalOpen(true)}
          >
            資料から生成
          </Button>
          <Button
            variant="outline"
            leftIcon={<SparklesIcon className="w-5 h-5" />}
            onClick={() => setIsGenerateModalOpen(true)}
          >
            AI自動生成
          </Button>
          <Button
            leftIcon={<PlusIcon className="w-5 h-5" />}
            onClick={() => {
              setSelectedCurriculum(null)
              setIsFormModalOpen(true)
            }}
          >
            カリキュラム追加
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

      {/* Active Jobs Section */}
      <CurriculumJobsList
        filter="active"
        maxItems={5}
        onJobAborted={fetchCurricula}
      />

      {/* Search and Filters */}
      <Card padding="sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="カリキュラム名・説明・タグで検索..."
                leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              value={filterContentType}
              onChange={(e) => setFilterContentType(e.target.value as ContentType | '')}
            >
              <option value="">すべてのタイプ</option>
              {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((type) => (
                <option key={type} value={type}>
                  {CONTENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <select
              className="px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value as DifficultyLevel | '')}
            >
              <option value="">すべての難易度</option>
              {(Object.keys(DIFFICULTY_LABELS) as DifficultyLevel[]).map((level) => (
                <option key={level} value={level}>
                  {DIFFICULTY_LABELS[level]}
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

      {/* Curricula table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Table
          columns={columns}
          data={filteredCurricula}
          keyExtractor={(curriculum) => curriculum.id}
          isLoading={isLoading}
          emptyMessage="カリキュラムが登録されていません"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
          onRowClick={(curriculum) => navigate(`/admin/curricula/${curriculum.id}`)}
        />
      </motion.div>

      {/* Curriculum form modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setSelectedCurriculum(null)
        }}
        title={selectedCurriculum ? 'カリキュラム編集' : 'カリキュラム追加'}
        size="lg"
      >
        <CurriculumForm
          curriculum={selectedCurriculum}
          onSubmit={selectedCurriculum ? handleUpdateCurriculum : handleCreateCurriculum}
          onCancel={() => {
            setIsFormModalOpen(false)
            setSelectedCurriculum(null)
          }}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedCurriculum(null)
        }}
        title="カリキュラム削除の確認"
        size="sm"
      >
        <p className="text-text">
          <span className="font-semibold">{selectedCurriculum?.name}</span>{' '}
          を削除してもよろしいですか？この操作は取り消せません。
        </p>
        {selectedCurriculum && selectedCurriculum.assignmentCount > 0 && (
          <Alert variant="warning" className="mt-4">
            このカリキュラムには{selectedCurriculum.assignmentCount}件の割り当てがあります。
            先に割り当てを解除してください。
          </Alert>
        )}
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setSelectedCurriculum(null)
            }}
          >
            キャンセル
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteCurriculum}
            disabled={selectedCurriculum ? selectedCurriculum.assignmentCount > 0 : false}
          >
            削除する
          </Button>
        </ModalFooter>
      </Modal>

      {/* Assignment modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false)
          setSelectedCurriculum(null)
          fetchCurricula() // Refresh to update assignment counts
        }}
        title={`割当管理 - ${selectedCurriculum?.name || ''}`}
        size="lg"
      >
        {selectedCurriculum && (
          <CurriculumAssignmentManager
            curriculumId={selectedCurriculum.id}
          />
        )}
        <ModalFooter>
          <Button
            onClick={() => {
              setIsAssignModalOpen(false)
              setSelectedCurriculum(null)
              fetchCurricula()
            }}
          >
            閉じる
          </Button>
        </ModalFooter>
      </Modal>

      {/* AI Generate modal */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title="AI自動生成"
        size="lg"
      >
        <CurriculumGenerateForm
          onGenerated={async (generated) => {
            try {
              // Calculate total duration
              const totalMinutes = generated.chapters.reduce(
                (sum, ch) => sum + ch.estimatedMinutes,
                0
              )

              // Create the curriculum
              const { error: createError } = await supabase.from('curricula').insert({
                name: generated.name,
                description: generated.description,
                content_type: 'document' as ContentType,
                content_url: null,
                duration_minutes: totalMinutes,
                difficulty_level: generated.difficultyLevel,
                tags: generated.tags,
                sort_order: curricula.length,
                is_active: true,
              })

              if (createError) throw createError

              setSuccessMessage('カリキュラムを作成しました')
              setIsGenerateModalOpen(false)
              fetchCurricula()
            } catch (err) {
              console.error('Error creating curriculum:', err)
              setError('カリキュラムの作成に失敗しました')
            }
          }}
          onCancel={() => setIsGenerateModalOpen(false)}
        />
      </Modal>

      {/* Generate from Material modal */}
      <Modal
        isOpen={isFromMaterialModalOpen}
        onClose={() => setIsFromMaterialModalOpen(false)}
        title="資料からカリキュラム生成"
        size="lg"
      >
        <CurriculumFromMaterialForm
          onGenerated={async (generated) => {
            try {
              // Calculate total duration
              const totalMinutes = generated.chapters.reduce(
                (sum, ch) => sum + ch.estimatedMinutes,
                0
              )

              // Create the curriculum with source_material_id
              const { error: createError } = await supabase.from('curricula').insert({
                name: generated.name,
                description: generated.description,
                content_type: 'document' as ContentType,
                content_url: null,
                duration_minutes: totalMinutes,
                difficulty_level: generated.difficultyLevel,
                tags: generated.tags,
                sort_order: curricula.length,
                is_active: true,
                source_material_id: generated.sourceMaterialId || null,
              })

              if (createError) throw createError

              setSuccessMessage('カリキュラムを作成しました')
              setIsFromMaterialModalOpen(false)
              fetchCurricula()
            } catch (err) {
              console.error('Error creating curriculum:', err)
              setError('カリキュラムの作成に失敗しました')
            }
          }}
          onCancel={() => setIsFromMaterialModalOpen(false)}
        />
      </Modal>
    </div>
  )
}
