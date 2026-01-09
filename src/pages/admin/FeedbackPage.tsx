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
  SparklesIcon,
  ArrowPathIcon,
  ChartPieIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { CurriculumFeedback, FeedbackType } from '@/types/database'

// タブタイプ
type TabType = 'list' | 'stats' | 'suggestions'

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

// 統計データ型
interface FeedbackStats {
  overview: {
    totalFeedback: number
    pendingCount: number
    resolvedCount: number
    averageRating: number
    feedbackGrowth: number
  }
  byType: Array<{ type: FeedbackType; count: number; percentage: number }>
  byCurriculum: Array<{
    curriculumId: string
    curriculumName: string
    totalFeedback: number
    averageRating: number
    byType: Record<FeedbackType, number>
  }>
  trends: Array<{
    date: string
    total: number
    positive: number
    negative: number
    neutral: number
  }>
  recentSuggestions: Array<{
    id: string
    curriculumName: string
    suggestion: string
    generatedAt: string
  }>
}

// AI改善サジェスト型
interface AISuggestion {
  curriculumId: string
  curriculumName: string
  suggestion: string
  generatedAt: string
}

export function FeedbackPage() {
  const { role } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('list')
  const [feedback, setFeedback] = useState<FeedbackWithDetails[]>([])
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FeedbackType | ''>('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'resolved'>('all')
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackWithDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<string>('')

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

  // 統計データを取得
  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/.netlify/functions/admin-feedback-stats', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!response.ok) throw new Error('統計の取得に失敗しました')
      const data = await response.json()
      setStats(data)
    } catch (err) {
      console.error('Error fetching stats:', err)
      setError('統計の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // AI改善サジェストを生成
  const generateSuggestion = async (curriculumId: string) => {
    try {
      setIsGenerating(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/.netlify/functions/admin-feedback-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ curriculumId }),
      })

      if (!response.ok) throw new Error('サジェストの生成に失敗しました')
      const data = await response.json()

      setSuggestions(prev => [data.suggestion, ...prev.filter(s => s.curriculumId !== curriculumId)])
      setSuccessMessage('AI改善サジェストを生成しました')
    } catch (err) {
      console.error('Error generating suggestion:', err)
      setError('サジェストの生成に失敗しました')
    } finally {
      setIsGenerating(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'list') {
      fetchFeedback()
    } else if (activeTab === 'stats' || activeTab === 'suggestions') {
      fetchStats()
    }
  }, [activeTab, fetchFeedback, fetchStats])

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

  // 簡易統計（一覧タブ用）
  const simpleStats = useMemo(() => {
    const total = feedback.length
    const pending = feedback.filter(fb => !fb.is_resolved).length
    const resolved = feedback.filter(fb => fb.is_resolved).length
    const byType = Object.keys(FEEDBACK_TYPE_LABELS).reduce((acc, type) => {
      acc[type as FeedbackType] = feedback.filter(fb => fb.feedback_type === type).length
      return acc
    }, {} as Record<FeedbackType, number>)

    return { total, pending, resolved, byType }
  }, [feedback])

  // カリキュラム一覧（サジェスト生成用）
  const curricula = useMemo(() => {
    if (!stats?.byCurriculum) return []
    return stats.byCurriculum.map(c => ({
      id: c.curriculumId,
      name: c.curriculumName,
    }))
  }, [stats])

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

      {/* タブナビゲーション */}
      <Card>
        <div className="border-b border-border">
          <nav className="flex gap-4 px-4">
            <button
              onClick={() => setActiveTab('list')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'list'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-light hover:text-text'
              }`}
            >
              <ChatBubbleLeftRightIcon className="w-4 h-4" />
              フィードバック一覧
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'stats'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-light hover:text-text'
              }`}
            >
              <ChartPieIcon className="w-4 h-4" />
              統計
            </button>
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'suggestions'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-light hover:text-text'
              }`}
            >
              <SparklesIcon className="w-4 h-4" />
              AI改善サジェスト
            </button>
          </nav>
        </div>
      </Card>

      {/* 一覧タブ */}
      {activeTab === 'list' && (
        <>
          {/* 統計カード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <ChatBubbleLeftRightIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-text-light">総フィードバック</p>
                  <p className="text-2xl font-bold text-text">{simpleStats.total}</p>
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
                  <p className="text-2xl font-bold text-text">{simpleStats.pending}</p>
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
                  <p className="text-2xl font-bold text-text">{simpleStats.resolved}</p>
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
                  <p className="text-2xl font-bold text-text">{simpleStats.byType.error}</p>
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
        </>
      )}

      {/* 統計タブ */}
      {activeTab === 'stats' && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : stats ? (
            <div className="space-y-6">
              {/* 概要カード */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <ChatBubbleLeftRightIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-text-light">総フィードバック</p>
                      <p className="text-2xl font-bold text-text">{stats.overview.totalFeedback}</p>
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
                      <p className="text-2xl font-bold text-text">{stats.overview.pendingCount}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                      <HandThumbUpIcon className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="text-sm text-text-light">平均評価</p>
                      <p className="text-2xl font-bold text-text">
                        {stats.overview.averageRating.toFixed(1)}
                        <span className="text-sm text-text-light">/5</span>
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10">
                      <ChartPieIcon className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <p className="text-sm text-text-light">先月比</p>
                      <p className={`text-2xl font-bold ${stats.overview.feedbackGrowth >= 0 ? 'text-success' : 'text-error'}`}>
                        {stats.overview.feedbackGrowth >= 0 ? '+' : ''}{stats.overview.feedbackGrowth.toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* タイプ別内訳 */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-text mb-4">タイプ別内訳</h3>
                <div className="space-y-3">
                  {stats.byType.map(item => {
                    const Icon = FEEDBACK_TYPE_ICONS[item.type]
                    return (
                      <div key={item.type} className="flex items-center gap-4">
                        <div className="flex items-center gap-2 w-32">
                          <Icon className="w-4 h-4" />
                          <span className="text-sm text-text">{FEEDBACK_TYPE_LABELS[item.type]}</span>
                        </div>
                        <div className="flex-1">
                          <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                item.type === 'helpful' ? 'bg-success' :
                                item.type === 'error' ? 'bg-error' :
                                'bg-primary'
                              }`}
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                        </div>
                        <div className="w-20 text-right">
                          <span className="text-sm font-medium text-text">{item.count}</span>
                          <span className="text-sm text-text-light ml-1">({item.percentage.toFixed(0)}%)</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>

              {/* カリキュラム別フィードバック */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-text mb-4">カリキュラム別フィードバック</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-text-light border-b border-border">
                        <th className="pb-2 font-medium">カリキュラム</th>
                        <th className="pb-2 font-medium text-right">件数</th>
                        <th className="pb-2 font-medium text-right">評価</th>
                        <th className="pb-2 font-medium text-right">👍</th>
                        <th className="pb-2 font-medium text-right">❌</th>
                        <th className="pb-2 font-medium text-right">💡</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stats.byCurriculum.slice(0, 10).map(c => (
                        <tr key={c.curriculumId} className="text-sm">
                          <td className="py-3 font-medium text-text">{c.curriculumName}</td>
                          <td className="py-3 text-right text-text">{c.totalFeedback}</td>
                          <td className="py-3 text-right text-text">
                            {'★'.repeat(Math.round(c.averageRating))}
                            <span className="text-text-light ml-1">({c.averageRating.toFixed(1)})</span>
                          </td>
                          <td className="py-3 text-right text-success">{c.byType.helpful || 0}</td>
                          <td className="py-3 text-right text-error">{c.byType.error || 0}</td>
                          <td className="py-3 text-right text-primary">{c.byType.suggestion || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* トレンド */}
              {stats.trends.length > 0 && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-text mb-4">30日間のトレンド</h3>
                  <div className="h-48 flex items-end gap-1">
                    {stats.trends.map((day, i) => {
                      const maxTotal = Math.max(...stats.trends.map(t => t.total), 1)
                      const height = (day.total / maxTotal) * 100
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-primary/70 rounded-t hover:bg-primary transition-colors cursor-pointer"
                          style={{ height: `${height}%` }}
                          title={`${day.date}: ${day.total}件`}
                        />
                      )
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-text-light mt-2">
                    <span>{stats.trends[0]?.date}</span>
                    <span>{stats.trends[stats.trends.length - 1]?.date}</span>
                  </div>
                </Card>
              )}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-text-light">統計データがありません</p>
            </Card>
          )}
        </>
      )}

      {/* AI改善サジェストタブ */}
      {activeTab === 'suggestions' && (
        <div className="space-y-6">
          {/* サジェスト生成フォーム */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-primary" />
              AI改善サジェストを生成
            </h3>
            <p className="text-sm text-text-light mb-4">
              カリキュラムのフィードバックを分析し、AIが改善提案を生成します。
            </p>
            <div className="flex gap-4">
              <select
                value={selectedCurriculumId}
                onChange={(e) => setSelectedCurriculumId(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">カリキュラムを選択...</option>
                {curricula.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Button
                onClick={() => selectedCurriculumId && generateSuggestion(selectedCurriculumId)}
                disabled={!selectedCurriculumId || isGenerating}
                leftIcon={isGenerating ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
              >
                {isGenerating ? '生成中...' : 'サジェストを生成'}
              </Button>
            </div>
          </Card>

          {/* 生成されたサジェスト一覧 */}
          {suggestions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text">生成されたサジェスト</h3>
              {suggestions.map((s, i) => (
                <Card key={i} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="font-medium text-text">{s.curriculumName}</h4>
                      <p className="text-xs text-text-light">生成日時: {new Date(s.generatedAt).toLocaleString('ja-JP')}</p>
                    </div>
                    <Badge variant="primary" size="sm">
                      <SparklesIcon className="w-3 h-3 mr-1" />
                      AI生成
                    </Badge>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-text whitespace-pre-wrap">{s.suggestion}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* 最近のサジェスト（APIから取得） */}
          {stats?.recentSuggestions && stats.recentSuggestions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text">保存されたサジェスト</h3>
              {stats.recentSuggestions.map((s) => (
                <Card key={s.id} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="font-medium text-text">{s.curriculumName}</h4>
                      <p className="text-xs text-text-light">生成日時: {new Date(s.generatedAt).toLocaleString('ja-JP')}</p>
                    </div>
                    <Badge variant="default" size="sm">保存済み</Badge>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-text whitespace-pre-wrap">{s.suggestion}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {suggestions.length === 0 && (!stats?.recentSuggestions || stats.recentSuggestions.length === 0) && (
            <Card className="p-8 text-center">
              <SparklesIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-text-light">まだサジェストがありません</p>
              <p className="text-sm text-text-light mt-1">カリキュラムを選択してサジェストを生成してください</p>
            </Card>
          )}
        </div>
      )}
    </motion.div>
  )
}
