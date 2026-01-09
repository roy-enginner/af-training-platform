import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  HandThumbUpIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { CurriculumFeedback, FeedbackType } from '@/types/database'

// フィードバックタイプのラベル
const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  helpful: '役に立った',
  unclear: 'わかりにくい',
  too_easy: '簡単すぎる',
  too_hard: '難しすぎる',
  error: 'エラー・誤り',
  suggestion: '提案',
}

// フィードバックタイプのアイコン
const FEEDBACK_TYPE_ICONS: Record<FeedbackType, React.ComponentType<{ className?: string }>> = {
  helpful: HandThumbUpIcon,
  unclear: QuestionMarkCircleIcon,
  too_easy: CheckCircleIcon,
  too_hard: ExclamationTriangleIcon,
  error: ExclamationTriangleIcon,
  suggestion: LightBulbIcon,
}

// フィードバックタイプのカラー
const FEEDBACK_TYPE_COLORS: Record<FeedbackType, 'success' | 'warning' | 'error' | 'primary' | 'default'> = {
  helpful: 'success',
  unclear: 'warning',
  too_easy: 'primary',
  too_hard: 'warning',
  error: 'error',
  suggestion: 'primary',
}

interface FeedbackWithDetails extends CurriculumFeedback {
  curriculum?: {
    id: string
    name: string
  }
  chapter?: {
    id: string
    title: string
  }
  profile?: {
    id: string
    full_name: string
    email: string
  }
}

export function FeedbackPage() {
  const { role } = useAuth()
  const [feedback, setFeedback] = useState<FeedbackWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FeedbackType | ''>('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'resolved'>('all')
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackWithDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // フィードバック一覧を取得
  const fetchFeedback = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data, error: fetchError } = await supabase
        .from('curriculum_feedback')
        .select(`
          *,
          curriculum:curricula (
            id,
            name
          ),
          chapter:chapters (
            id,
            title
          ),
          profile:profiles (
            id,
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setFeedback(data || [])
    } catch (err) {
      console.error('Error fetching feedback:', err)
      setError('フィードバックの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFeedback()
  }, [fetchFeedback])

  // 権限チェック
  if (role && !hasPermission(role, 'canManageCurriculum')) {
    return <Navigate to="/admin" replace />
  }

  // フィルタリング
  const filteredFeedback = useMemo(() => {
    return feedback.filter((fb) => {
      const matchesSearch =
        fb.comment?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fb.curriculum?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fb.chapter?.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fb.profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = !filterType || fb.feedback_type === filterType
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'pending' && !fb.is_resolved) ||
        (filterStatus === 'resolved' && fb.is_resolved)
      return matchesSearch && matchesType && matchesStatus
    })
  }, [feedback, searchQuery, filterType, filterStatus])

  // 統計
  const stats = useMemo(() => {
    const total = feedback.length
    const pending = feedback.filter(fb => !fb.is_resolved).length
    const resolved = feedback.filter(fb => fb.is_resolved).length
    const byType = Object.keys(FEEDBACK_TYPE_LABELS).reduce((acc, type) => {
      acc[type as FeedbackType] = feedback.filter(fb => fb.feedback_type === type).length
      return acc
    }, {} as Record<FeedbackType, number>)

    return { total, pending, resolved, byType }
  }, [feedback])

  // フィードバックを解決済みにする
  const handleResolveFeedback = async (feedbackId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('curriculum_feedback')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', feedbackId)

      if (updateError) throw updateError

      setSuccessMessage('フィードバックを解決済みにしました')
      setIsDetailModalOpen(false)
      setSelectedFeedback(null)
      fetchFeedback()
    } catch (err) {
      console.error('Error resolving feedback:', err)
      setError('フィードバックの更新に失敗しました')
    }
  }

  // フィードバックを未解決に戻す
  const handleUnresolveFeedback = async (feedbackId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('curriculum_feedback')
        .update({
          is_resolved: false,
          resolved_at: null,
        })
        .eq('id', feedbackId)

      if (updateError) throw updateError

      setSuccessMessage('フィードバックを未解決に戻しました')
      setIsDetailModalOpen(false)
      setSelectedFeedback(null)
      fetchFeedback()
    } catch (err) {
      console.error('Error unresolving feedback:', err)
      setError('フィードバックの更新に失敗しました')
    }
  }

  // 日時フォーマット
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // テーブルカラム
  const columns = [
    {
      key: 'type',
      header: 'タイプ',
      render: (fb: FeedbackWithDetails) => {
        const Icon = FEEDBACK_TYPE_ICONS[fb.feedback_type]
        return (
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" />
            <Badge variant={FEEDBACK_TYPE_COLORS[fb.feedback_type]} size="sm">
              {FEEDBACK_TYPE_LABELS[fb.feedback_type]}
            </Badge>
          </div>
        )
      },
    },
    {
      key: 'curriculum',
      header: 'カリキュラム',
      render: (fb: FeedbackWithDetails) => (
        <div>
          <div className="font-medium text-text">{fb.curriculum?.name || '-'}</div>
          {fb.chapter && (
            <div className="text-sm text-text-light">{fb.chapter.title}</div>
          )}
        </div>
      ),
    },
    {
      key: 'comment',
      header: 'コメント',
      render: (fb: FeedbackWithDetails) => (
        <div className="max-w-xs truncate text-text-light">
          {fb.comment || '-'}
        </div>
      ),
    },
    {
      key: 'user',
      header: '投稿者',
      render: (fb: FeedbackWithDetails) => (
        <div className="text-sm">
          <div className="font-medium text-text">{fb.profile?.full_name || '-'}</div>
          <div className="text-text-light">{formatDate(fb.created_at)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'ステータス',
      render: (fb: FeedbackWithDetails) => (
        fb.is_resolved ? (
          <Badge variant="success" size="sm">解決済み</Badge>
        ) : (
          <Badge variant="warning" size="sm">未対応</Badge>
        )
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
          <h1 className="text-2xl font-bold text-text">フィードバック管理</h1>
          <p className="mt-1 text-sm text-text-light">
            研修生からのフィードバックを管理します
          </p>
        </div>
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

      {/* 統計カード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ChatBubbleLeftRightIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-text-light">総フィードバック</p>
              <p className="text-2xl font-bold text-text">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <ExclamationTriangleIcon className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-text-light">未対応</p>
              <p className="text-2xl font-bold text-text">{stats.pending}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <CheckCircleIcon className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-text-light">解決済み</p>
              <p className="text-2xl font-bold text-text">{stats.resolved}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-error/10">
              <ExclamationTriangleIcon className="h-5 w-5 text-error" />
            </div>
            <div>
              <p className="text-sm text-text-light">エラー報告</p>
              <p className="text-2xl font-bold text-text">{stats.byType.error}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* フィルター */}
      <Card>
        <div className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex-1">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-light" />
                <Input
                  type="text"
                  placeholder="コメント、カリキュラム名、投稿者で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as FeedbackType | '')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">すべてのタイプ</option>
                {Object.entries(FEEDBACK_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'pending' | 'resolved')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">すべてのステータス</option>
                <option value="pending">未対応のみ</option>
                <option value="resolved">解決済みのみ</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* フィードバック一覧 */}
      <Card>
        <Table
          columns={columns}
          data={filteredFeedback}
          keyExtractor={(fb) => fb.id}
          isLoading={isLoading}
          emptyMessage="フィードバックがありません"
          onRowClick={(fb) => {
            setSelectedFeedback(fb)
            setIsDetailModalOpen(true)
          }}
        />
      </Card>

      {/* 詳細モーダル */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedFeedback(null)
        }}
        title="フィードバック詳細"
        size="lg"
      >
        {selectedFeedback && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {(() => {
                const Icon = FEEDBACK_TYPE_ICONS[selectedFeedback.feedback_type]
                return <Icon className="w-5 h-5" />
              })()}
              <Badge variant={FEEDBACK_TYPE_COLORS[selectedFeedback.feedback_type]}>
                {FEEDBACK_TYPE_LABELS[selectedFeedback.feedback_type]}
              </Badge>
              {selectedFeedback.is_resolved ? (
                <Badge variant="success">解決済み</Badge>
              ) : (
                <Badge variant="warning">未対応</Badge>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm text-text-light">カリキュラム</p>
                <p className="font-medium text-text">{selectedFeedback.curriculum?.name || '-'}</p>
              </div>
              {selectedFeedback.chapter && (
                <div>
                  <p className="text-sm text-text-light">チャプター</p>
                  <p className="font-medium text-text">{selectedFeedback.chapter.title}</p>
                </div>
              )}
              {selectedFeedback.rating && (
                <div>
                  <p className="text-sm text-text-light">評価</p>
                  <p className="font-medium text-text">{'★'.repeat(selectedFeedback.rating)}{'☆'.repeat(5 - selectedFeedback.rating)}</p>
                </div>
              )}
            </div>

            {selectedFeedback.comment && (
              <div>
                <p className="text-sm text-text-light mb-1">コメント</p>
                <p className="text-text whitespace-pre-wrap bg-white border border-border rounded-lg p-4">
                  {selectedFeedback.comment}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between text-sm text-text-light">
              <div>
                投稿者: {selectedFeedback.profile?.full_name || '-'}
              </div>
              <div>
                投稿日時: {formatDate(selectedFeedback.created_at)}
              </div>
            </div>

            {selectedFeedback.is_resolved && selectedFeedback.resolved_at && (
              <div className="text-sm text-success">
                解決日時: {formatDate(selectedFeedback.resolved_at)}
              </div>
            )}
          </div>
        )}

        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDetailModalOpen(false)
              setSelectedFeedback(null)
            }}
          >
            閉じる
          </Button>
          {selectedFeedback && (
            selectedFeedback.is_resolved ? (
              <Button
                variant="outline"
                onClick={() => handleUnresolveFeedback(selectedFeedback.id)}
              >
                未解決に戻す
              </Button>
            ) : (
              <Button
                onClick={() => handleResolveFeedback(selectedFeedback.id)}
                leftIcon={<CheckCircleIcon className="w-4 h-4" />}
              >
                解決済みにする
              </Button>
            )
          )}
        </ModalFooter>
      </Modal>
    </motion.div>
  )
}
