import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowPathIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { Button, Card, Badge, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ジョブステータスの型
type JobStatus = 'queued' | 'connecting' | 'generating' | 'parsing' | 'completed' | 'failed'

// ジョブの型
interface CurriculumJob {
  id: string
  user_id: string
  job_type: 'structure' | 'content'
  status: JobStatus
  progress: number
  current_step: string | null
  input_params: {
    goal: string
    targetAudience?: string
    durationMinutes?: number
    difficultyLevel?: string
  }
  error_message: string | null
  tokens_used: number | null
  model_used: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

// ステータスの表示設定
const STATUS_CONFIG: Record<JobStatus, { label: string; color: 'primary' | 'success' | 'warning' | 'error' | 'default'; borderColor: string; icon: React.ReactNode }> = {
  queued: {
    label: 'キュー待ち',
    color: 'default',
    borderColor: 'border-l-gray-400',
    icon: <ClockIcon className="w-4 h-4" />,
  },
  connecting: {
    label: '接続中',
    color: 'primary',
    borderColor: 'border-l-primary',
    icon: <ArrowPathIcon className="w-4 h-4 animate-spin" />,
  },
  generating: {
    label: '生成中',
    color: 'primary',
    borderColor: 'border-l-primary',
    icon: <SparklesIcon className="w-4 h-4 animate-pulse" />,
  },
  parsing: {
    label: '処理中',
    color: 'warning',
    borderColor: 'border-l-warning',
    icon: <ArrowPathIcon className="w-4 h-4 animate-spin" />,
  },
  completed: {
    label: '完了',
    color: 'success',
    borderColor: 'border-l-success',
    icon: <CheckCircleIcon className="w-4 h-4" />,
  },
  failed: {
    label: '失敗',
    color: 'error',
    borderColor: 'border-l-error',
    icon: <ExclamationCircleIcon className="w-4 h-4" />,
  },
}

// ジョブタイプの表示
const JOB_TYPE_LABELS: Record<string, string> = {
  structure: '構成生成',
  content: 'コンテンツ生成',
}

interface CurriculumJobsListProps {
  // 表示するジョブの種類（全て、処理中のみなど）
  filter?: 'all' | 'active' | 'completed'
  // 最大表示件数
  maxItems?: number
  // コンパクト表示
  compact?: boolean
  // ジョブがアボートされた時のコールバック
  onJobAborted?: () => void
}

export function CurriculumJobsList({
  filter = 'active',
  maxItems = 10,
  compact = false,
  onJobAborted,
}: CurriculumJobsListProps) {
  const { session } = useAuth()
  const [jobs, setJobs] = useState<CurriculumJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abortingJobId, setAbortingJobId] = useState<string | null>(null)

  // ジョブ一覧を取得
  const fetchJobs = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      let query = supabase
        .from('curriculum_generation_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(maxItems)

      // フィルター適用
      if (filter === 'active') {
        query = query.in('status', ['queued', 'connecting', 'generating', 'parsing'])
      } else if (filter === 'completed') {
        query = query.in('status', ['completed', 'failed'])
      }

      const { data, error: fetchError } = await query

      if (fetchError) {
        throw fetchError
      }

      setJobs(data || [])
    } catch (err) {
      console.error('Error fetching jobs:', err)
      setError('ジョブ一覧の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [filter, maxItems])

  // 初回読み込み
  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Realtime subscription
  useEffect(() => {
    let channel: RealtimeChannel | null = null

    const setupSubscription = () => {
      channel = supabase
        .channel('curriculum-jobs-list')
        .on(
          'postgres_changes',
          {
            event: '*', // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'curriculum_generation_jobs',
          },
          (payload) => {
            console.log('Jobs list update:', payload)

            if (payload.eventType === 'INSERT') {
              const newJob = payload.new as CurriculumJob
              // フィルターに合致する場合のみ追加
              if (filter === 'all' ||
                  (filter === 'active' && ['queued', 'connecting', 'generating', 'parsing'].includes(newJob.status)) ||
                  (filter === 'completed' && ['completed', 'failed'].includes(newJob.status))) {
                setJobs(prev => [newJob, ...prev].slice(0, maxItems))
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedJob = payload.new as CurriculumJob
              setJobs(prev => {
                const existingIndex = prev.findIndex(j => j.id === updatedJob.id)
                if (existingIndex >= 0) {
                  // フィルターに合致しなくなった場合は削除
                  if ((filter === 'active' && ['completed', 'failed'].includes(updatedJob.status)) ||
                      (filter === 'completed' && !['completed', 'failed'].includes(updatedJob.status))) {
                    return prev.filter(j => j.id !== updatedJob.id)
                  }
                  // 更新
                  const updated = [...prev]
                  updated[existingIndex] = updatedJob
                  return updated
                } else {
                  // フィルターに合致する場合は追加
                  if (filter === 'all' ||
                      (filter === 'active' && ['queued', 'connecting', 'generating', 'parsing'].includes(updatedJob.status)) ||
                      (filter === 'completed' && ['completed', 'failed'].includes(updatedJob.status))) {
                    return [updatedJob, ...prev].slice(0, maxItems)
                  }
                }
                return prev
              })
            } else if (payload.eventType === 'DELETE') {
              const deletedJob = payload.old as CurriculumJob
              setJobs(prev => prev.filter(j => j.id !== deletedJob.id))
            }
          }
        )
        .subscribe()
    }

    setupSubscription()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [filter, maxItems])

  // ジョブをアボート
  const handleAbortJob = async (jobId: string) => {
    if (!session?.access_token) return

    try {
      setAbortingJobId(jobId)
      setError(null)

      const response = await fetch('/.netlify/functions/abort-curriculum-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ jobId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'アボートに失敗しました')
      }

      // 成功時はRealtimeで自動更新されるが、念のためコールバック実行
      onJobAborted?.()
    } catch (err) {
      console.error('Error aborting job:', err)
      setError(err instanceof Error ? err.message : 'ジョブのアボートに失敗しました')
    } finally {
      setAbortingJobId(null)
    }
  }

  // 時間をフォーマット
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // ジョブが処理中かどうか
  const isJobActive = (status: JobStatus) => {
    return ['queued', 'connecting', 'generating', 'parsing'].includes(status)
  }

  if (isLoading) {
    return (
      <Card padding="sm">
        <div className="flex items-center justify-center py-8">
          <ArrowPathIcon className="w-6 h-6 text-primary animate-spin" />
          <span className="ml-2 text-text-light">読み込み中...</span>
        </div>
      </Card>
    )
  }

  if (jobs.length === 0 && filter === 'active') {
    return null // アクティブジョブがない場合は表示しない
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {jobs.length === 0 ? (
        <Card padding="sm">
          <p className="text-center text-text-light py-4">
            ジョブがありません
          </p>
        </Card>
      ) : (
        <AnimatePresence>
          {jobs.map((job) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <Card padding="sm" className={`border-l-4 ${STATUS_CONFIG[job.status].borderColor}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={STATUS_CONFIG[job.status].color} size="sm">
                        <span className="flex items-center gap-1">
                          {STATUS_CONFIG[job.status].icon}
                          {STATUS_CONFIG[job.status].label}
                        </span>
                      </Badge>
                      <Badge variant="default" size="sm">
                        {JOB_TYPE_LABELS[job.job_type]}
                      </Badge>
                      {job.model_used && (
                        <span className="text-xs text-text-light">
                          {job.model_used.includes('opus') ? 'Opus 4.5' : 'Sonnet 4.5'}
                        </span>
                      )}
                    </div>

                    {!compact && (
                      <p className="text-sm text-text truncate mb-1">
                        {job.input_params.goal}
                      </p>
                    )}

                    {job.current_step && (
                      <p className="text-xs text-text-light">
                        {job.current_step}
                      </p>
                    )}

                    {job.error_message && (
                      <p className="text-xs text-error mt-1">
                        {job.error_message}
                      </p>
                    )}

                    {/* 進捗バー */}
                    {isJobActive(job.status) && (
                      <div className="mt-2">
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${job.progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        <p className="text-xs text-text-light mt-1">
                          {job.progress}%
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-text-light mt-2">
                      開始: {formatTime(job.created_at)}
                      {job.completed_at && ` → 終了: ${formatTime(job.completed_at)}`}
                    </p>
                  </div>

                  {/* アボートボタン */}
                  {isJobActive(job.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAbortJob(job.id)}
                      disabled={abortingJobId === job.id}
                      className="text-error hover:bg-red-50"
                    >
                      {abortingJobId === job.id ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <XMarkIcon className="w-4 h-4" />
                      )}
                      <span className="ml-1">中断</span>
                    </Button>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  )
}
