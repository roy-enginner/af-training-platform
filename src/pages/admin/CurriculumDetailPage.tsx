import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeftIcon,
  PencilIcon,
  ClockIcon,
  TagIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { Button, Card, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { CurriculumForm, type CurriculumFormSubmitData } from '@/components/admin/CurriculumForm'
import { ChapterManager } from '@/components/admin/ChapterManager'
import { CurriculumAssignmentManager } from '@/components/admin/CurriculumAssignmentManager'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { Curriculum, ContentType, DifficultyLevel } from '@/types/database'

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  document: 'ドキュメント',
  video: '動画',
  quiz: 'クイズ',
  external: '外部リンク',
}

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  beginner: '初級',
  intermediate: '中級',
  advanced: '上級',
}

const DIFFICULTY_COLORS: Record<DifficultyLevel, 'success' | 'warning' | 'error'> = {
  beginner: 'success',
  intermediate: 'warning',
  advanced: 'error',
}

export function CurriculumDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useAuth()
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null)
  const [assignmentCount, setAssignmentCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Fetch curriculum
  const fetchCurriculum = useCallback(async () => {
    if (!id) return

    try {
      setIsLoading(true)

      const { data, error: fetchError } = await supabase
        .from('curricula')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      setCurriculum(data)

      // Fetch assignment count
      const { count } = await supabase
        .from('curriculum_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('curriculum_id', id)

      setAssignmentCount(count || 0)
    } catch (err) {
      console.error('Error fetching curriculum:', err)
      setError('カリキュラムの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchCurriculum()
  }, [fetchCurriculum])

  // Check permission
  if (role && !hasPermission(role, 'canManageCurriculum')) {
    return <Navigate to="/admin" replace />
  }

  // Handle curriculum update
  const handleUpdateCurriculum = async (data: CurriculumFormSubmitData) => {
    if (!curriculum) return

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
        .eq('id', curriculum.id)

      if (updateError) throw updateError

      setSuccessMessage('カリキュラムを更新しました')
      setIsEditModalOpen(false)
      fetchCurriculum()
    } catch (err) {
      console.error('Error updating curriculum:', err)
      setError('カリキュラムの更新に失敗しました')
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-text-light">読み込み中...</div>
      </div>
    )
  }

  if (!curriculum) {
    return (
      <div className="text-center py-12">
        <p className="text-text-light">カリキュラムが見つかりません</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate('/admin/curricula')}
        >
          一覧に戻る
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/admin/curricula')}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors mt-1"
          >
            <ArrowLeftIcon className="w-5 h-5 text-text-light" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text">{curriculum.name}</h1>
              {!curriculum.is_active && (
                <Badge variant="default">無効</Badge>
              )}
            </div>
            {curriculum.description && (
              <p className="text-text-light mt-1">{curriculum.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            leftIcon={<UserGroupIcon className="w-5 h-5" />}
            onClick={() => setIsAssignModalOpen(true)}
          >
            割当管理
          </Button>
          <Button
            leftIcon={<PencilIcon className="w-5 h-5" />}
            onClick={() => setIsEditModalOpen(true)}
          >
            編集
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

      {/* Curriculum info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-text-light">コンテンツタイプ</p>
              <p className="font-medium text-text mt-1">
                {CONTENT_TYPE_LABELS[curriculum.content_type]}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-light">難易度</p>
              <div className="mt-1">
                <Badge variant={DIFFICULTY_COLORS[curriculum.difficulty_level]}>
                  {DIFFICULTY_LABELS[curriculum.difficulty_level]}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-sm text-text-light">所要時間</p>
              <p className="font-medium text-text mt-1 flex items-center gap-1">
                <ClockIcon className="w-4 h-4" />
                {formatDuration(curriculum.duration_minutes)}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-light">割当数</p>
              <p className="font-medium text-text mt-1 flex items-center gap-1">
                <UserGroupIcon className="w-4 h-4" />
                {assignmentCount}件
              </p>
            </div>
          </div>

          {curriculum.tags && curriculum.tags.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm text-text-light mb-2 flex items-center gap-1">
                <TagIcon className="w-4 h-4" />
                タグ
              </p>
              <div className="flex flex-wrap gap-2">
                {curriculum.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-sm bg-primary-light text-primary rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Chapter management */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card>
          <ChapterManager
            curriculumId={curriculum.id}
            curriculumName={curriculum.name}
            onChaptersChange={fetchCurriculum}
          />
        </Card>
      </motion.div>

      {/* Edit modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="カリキュラム編集"
        size="lg"
      >
        <CurriculumForm
          curriculum={curriculum}
          onSubmit={handleUpdateCurriculum}
          onCancel={() => setIsEditModalOpen(false)}
        />
      </Modal>

      {/* Assignment modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false)
          fetchCurriculum()
        }}
        title={`割当管理 - ${curriculum.name}`}
        size="lg"
      >
        <CurriculumAssignmentManager curriculumId={curriculum.id} />
        <ModalFooter>
          <Button
            onClick={() => {
              setIsAssignModalOpen(false)
              fetchCurriculum()
            }}
          >
            閉じる
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
