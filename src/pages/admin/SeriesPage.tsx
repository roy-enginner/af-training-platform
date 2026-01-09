import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  BookOpenIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { CurriculumSeries, DifficultyLevel } from '@/types/database'
import { SeriesForm, type SeriesFormSubmitData } from '@/components/admin/SeriesForm'

// シリーズタイプのラベル
const SERIES_TYPE_LABELS: Record<string, string> = {
  sequential: '順序型',
  modular: 'モジュール型',
}

// 難易度ラベル
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

interface SeriesWithCount extends CurriculumSeries {
  curriculumCount: number
}

export function SeriesPage() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [series, setSeries] = useState<SeriesWithCount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedSeries, setSelectedSeries] = useState<SeriesWithCount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // シリーズ一覧を取得
  const fetchSeries = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data, error: fetchError } = await supabase
        .from('curriculum_series')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      // カリキュラム数を取得
      const seriesWithCounts = await Promise.all(
        (data || []).map(async (s) => {
          const { count } = await supabase
            .from('curricula')
            .select('*', { count: 'exact', head: true })
            .eq('series_id', s.id)

          return {
            ...s,
            curriculumCount: count || 0,
          }
        })
      )

      setSeries(seriesWithCounts)
    } catch (err) {
      console.error('Error fetching series:', err)
      setError('シリーズの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSeries()
  }, [fetchSeries])

  // 権限チェック
  if (role && !hasPermission(role, 'canManageCurriculum')) {
    return <Navigate to="/admin" replace />
  }

  // フィルタリング
  const filteredSeries = useMemo(() => {
    return series.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      const matchesType = !filterType || s.series_type === filterType
      return matchesSearch && matchesType
    })
  }, [series, searchQuery, filterType])

  // シリーズ作成
  const handleCreateSeries = async (data: SeriesFormSubmitData) => {
    try {
      const { error: createError } = await supabase.from('curriculum_series').insert({
        name: data.name,
        description: data.description,
        series_type: data.seriesType,
        target_audience: data.targetAudience,
        difficulty_level: data.difficultyLevel,
        total_duration_minutes: data.totalDurationMinutes,
        tags: data.tags,
        is_active: true,
      })

      if (createError) throw createError

      setSuccessMessage('シリーズを作成しました')
      setIsFormModalOpen(false)
      fetchSeries()
    } catch (err) {
      console.error('Error creating series:', err)
      setError('シリーズの作成に失敗しました')
    }
  }

  // シリーズ更新
  const handleUpdateSeries = async (data: SeriesFormSubmitData) => {
    if (!selectedSeries) return

    try {
      const { error: updateError } = await supabase
        .from('curriculum_series')
        .update({
          name: data.name,
          description: data.description,
          series_type: data.seriesType,
          target_audience: data.targetAudience,
          difficulty_level: data.difficultyLevel,
          total_duration_minutes: data.totalDurationMinutes,
          tags: data.tags,
        })
        .eq('id', selectedSeries.id)

      if (updateError) throw updateError

      setSuccessMessage('シリーズを更新しました')
      setIsFormModalOpen(false)
      setSelectedSeries(null)
      fetchSeries()
    } catch (err) {
      console.error('Error updating series:', err)
      setError('シリーズの更新に失敗しました')
    }
  }

  // シリーズ削除（論理削除）
  const handleDeleteSeries = async () => {
    if (!selectedSeries) return

    // カリキュラムが含まれている場合は削除不可
    if (selectedSeries.curriculumCount > 0) {
      setError('カリキュラムが含まれているシリーズは削除できません')
      setIsDeleteModalOpen(false)
      return
    }

    try {
      const { error: deleteError } = await supabase
        .from('curriculum_series')
        .update({ is_active: false })
        .eq('id', selectedSeries.id)

      if (deleteError) throw deleteError

      setSuccessMessage('シリーズを削除しました')
      setIsDeleteModalOpen(false)
      setSelectedSeries(null)
      fetchSeries()
    } catch (err) {
      console.error('Error deleting series:', err)
      setError('シリーズの削除に失敗しました')
    }
  }

  // 時間フォーマット
  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '-'
    if (minutes < 60) return `${minutes}分`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}時間${mins}分` : `${hours}時間`
  }

  // テーブルカラム
  const columns = [
    {
      key: 'name',
      header: 'シリーズ名',
      render: (s: SeriesWithCount) => (
        <div>
          <div className="font-medium text-text">{s.name}</div>
          {s.description && (
            <p className="text-sm text-text-light mt-1 line-clamp-1">{s.description}</p>
          )}
          {s.tags && s.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {s.tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">
                  {tag}
                </span>
              ))}
              {s.tags.length > 3 && (
                <span className="text-xs text-text-light">+{s.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'タイプ',
      render: (s: SeriesWithCount) => (
        <Badge variant="primary" size="sm">
          {SERIES_TYPE_LABELS[s.series_type] || s.series_type}
        </Badge>
      ),
    },
    {
      key: 'difficulty',
      header: '難易度',
      render: (s: SeriesWithCount) => s.difficulty_level ? (
        <Badge variant={DIFFICULTY_COLORS[s.difficulty_level]} size="sm">
          {DIFFICULTY_LABELS[s.difficulty_level]}
        </Badge>
      ) : (
        <span className="text-text-light">-</span>
      ),
    },
    {
      key: 'duration',
      header: '合計時間',
      render: (s: SeriesWithCount) => (
        <div className="flex items-center gap-1 text-sm text-text-light">
          <ClockIcon className="w-4 h-4" />
          <span>{formatDuration(s.total_duration_minutes)}</span>
        </div>
      ),
    },
    {
      key: 'curricula',
      header: 'カリキュラム',
      render: (s: SeriesWithCount) => (
        <div className="flex items-center gap-1 text-sm">
          <BookOpenIcon className="w-4 h-4 text-text-light" />
          <span>{s.curriculumCount}件</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (s: SeriesWithCount) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedSeries(s)
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
              setSelectedSeries(s)
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">シリーズ管理</h1>
          <p className="mt-1 text-sm text-text-light">
            複数カリキュラムをまとめたシリーズを管理します
          </p>
        </div>
        <Button onClick={() => {
          setSelectedSeries(null)
          setIsFormModalOpen(true)
        }}>
          <PlusIcon className="h-5 w-5 mr-2" />
          シリーズ追加
        </Button>
      </div>

      {/* アラート */}
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

      {/* フィルター */}
      <Card>
        <div className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex-1">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-light" />
                <Input
                  type="text"
                  placeholder="シリーズ名、説明、タグで検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">すべてのタイプ</option>
                {Object.entries(SERIES_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* シリーズ一覧 */}
      <Card>
        <Table
          columns={columns}
          data={filteredSeries}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyMessage="シリーズがありません"
          onRowClick={(s) => navigate(`/admin/series/${s.id}`)}
        />
      </Card>

      {/* フォームモーダル */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setSelectedSeries(null)
        }}
        title={selectedSeries ? 'シリーズ編集' : 'シリーズ追加'}
        size="lg"
      >
        <SeriesForm
          series={selectedSeries}
          onSubmit={selectedSeries ? handleUpdateSeries : handleCreateSeries}
          onCancel={() => {
            setIsFormModalOpen(false)
            setSelectedSeries(null)
          }}
        />
      </Modal>

      {/* 削除確認モーダル */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedSeries(null)
        }}
        title="シリーズの削除"
      >
        <p className="text-text-light">
          「{selectedSeries?.name}」を削除してもよろしいですか？
          <br />
          この操作は取り消せません。
        </p>
        {selectedSeries && selectedSeries.curriculumCount > 0 && (
          <Alert variant="warning" className="mt-4">
            このシリーズには{selectedSeries.curriculumCount}件のカリキュラムが含まれています。
            先にカリキュラムを削除またはシリーズから解除してください。
          </Alert>
        )}
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setSelectedSeries(null)
            }}
          >
            キャンセル
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteSeries}
            disabled={selectedSeries ? selectedSeries.curriculumCount > 0 : false}
          >
            削除
          </Button>
        </ModalFooter>
      </Modal>
    </motion.div>
  )
}
