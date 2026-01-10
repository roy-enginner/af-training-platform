import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  SparklesIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PencilIcon,
  ClockIcon,
  AcademicCapIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, ModalFooter, Alert, Badge } from '@/components/ui'
import { apiPost, ApiError } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { DifficultyLevel } from '@/types/database'
import type { RealtimeChannel } from '@supabase/supabase-js'

const generateSchema = z.object({
  goal: z.string().min(10, '研修ゴールを10文字以上で入力してください'),
  targetAudience: z.string().optional(),
  durationMinutes: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(15, '最小15分以上を設定してください')
    .max(480, '最大480分（8時間）まで設定できます'),
  difficultyLevel: z.enum(['beginner', 'intermediate', 'advanced'] as const),
})

type GenerateFormData = z.infer<typeof generateSchema>

// ジョブステータスの型
type JobStatus = 'queued' | 'connecting' | 'generating' | 'parsing' | 'completed' | 'failed'

// ジョブの型
interface CurriculumJob {
  id: string
  status: JobStatus
  progress: number
  current_step: string | null
  result: GeneratedStructure | GeneratedCurriculum | null
  error_message: string | null
  tokens_used: number | null
  model_used: string | null
}

// 構成の型
interface ChapterStructure {
  order: number
  title: string
  summary: string
  learningObjectives: string[]
  estimatedMinutes: number
}

interface GeneratedStructure {
  name: string
  description: string
  difficultyLevel: DifficultyLevel
  targetAudience: string
  durationMinutes: number
  tags: string[]
  chapters: ChapterStructure[]
}

// 最終カリキュラムの型
interface GeneratedChapter {
  order: number
  title: string
  content: string
  taskDescription: string
  estimatedMinutes: number
}

interface GeneratedCurriculum {
  name: string
  description: string
  difficultyLevel: DifficultyLevel
  tags: string[]
  chapters: GeneratedChapter[]
}

interface CurriculumGenerateFormProps {
  onGenerated: (curriculum: GeneratedCurriculum) => void
  onCancel: () => void
}

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  beginner: '初級',
  intermediate: '中級',
  advanced: '上級',
  mixed: '混合',
}

// ステータスに応じた表示テキスト
const STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'キューに追加しました',
  connecting: 'AIに接続中...',
  generating: '生成中...',
  parsing: '結果を処理中...',
  completed: '完了',
  failed: 'エラー',
}

type Step = 'input' | 'structure_generating' | 'structure_review' | 'content_generating' | 'complete'

export function CurriculumGenerateForm({ onGenerated, onCancel }: CurriculumGenerateFormProps) {
  const [step, setStep] = useState<Step>('input')
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<GenerateFormData | null>(null)

  // ジョブ関連の状態
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState<number>(0)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [jobStep, setJobStep] = useState<string>('')

  // 生成結果
  const [generatedStructure, setGeneratedStructure] = useState<GeneratedStructure | null>(null)
  const [generatedCurriculum, setGeneratedCurriculum] = useState<GeneratedCurriculum | null>(null)
  const [usageInfo, setUsageInfo] = useState<{
    structure?: { tokens: number; model: string }
    content?: { tokens: number; model: string }
  }>({})

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GenerateFormData>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      goal: '',
      targetAudience: '企業の一般社員',
      durationMinutes: 60,
      difficultyLevel: 'beginner',
    },
  })

  // stepの現在値を参照するためのref（useEffect内でstale closureを回避）
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  }, [step])

  // Realtime subscription でジョブの進捗を監視
  useEffect(() => {
    if (!currentJobId) return

    let channel: RealtimeChannel | null = null

    const setupSubscription = async () => {
      channel = supabase
        .channel(`job-${currentJobId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'curriculum_generation_jobs',
            filter: `id=eq.${currentJobId}`,
          },
          (payload) => {
            const job = payload.new as CurriculumJob
            const currentStep = stepRef.current
            console.log('Job update received:', job, 'current step:', currentStep)

            setJobProgress(job.progress)
            setJobStatus(job.status)
            setJobStep(job.current_step || '')

            // 完了時の処理
            if (job.status === 'completed' && job.result) {
              if (currentStep === 'structure_generating') {
                // 構成生成完了
                setGeneratedStructure(job.result as GeneratedStructure)
                setUsageInfo((prev) => ({
                  ...prev,
                  structure: {
                    tokens: job.tokens_used || 0,
                    model: job.model_used || 'Claude Opus 4.5',
                  },
                }))
                setStep('structure_review')
                setCurrentJobId(null)
              } else if (currentStep === 'content_generating') {
                // コンテンツ生成完了
                setGeneratedCurriculum(job.result as GeneratedCurriculum)
                setUsageInfo((prev) => ({
                  ...prev,
                  content: {
                    tokens: job.tokens_used || 0,
                    model: job.model_used || 'Claude Sonnet 4.5',
                  },
                }))
                setStep('complete')
                setCurrentJobId(null)
              }
            }

            // エラー時の処理
            if (job.status === 'failed') {
              setError(job.error_message || '生成中にエラーが発生しました')
              if (currentStep === 'structure_generating') {
                setStep('input')
              } else if (currentStep === 'content_generating') {
                setStep('structure_review')
              }
              setCurrentJobId(null)
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
  }, [currentJobId]) // stepを依存配列から削除

  // 構成生成ジョブを作成
  const handleGenerateStructure = useCallback(async (data: GenerateFormData) => {
    setError(null)
    setFormData(data)
    setStep('structure_generating')
    setJobProgress(0)
    setJobStatus('queued')
    setJobStep('ジョブを開始しています...')

    try {
      const result = await apiPost<{ jobId: string; status: string; message: string }>(
        'create-curriculum-job',
        {
          jobType: 'structure',
          goal: data.goal,
          targetAudience: data.targetAudience,
          durationMinutes: data.durationMinutes,
          difficultyLevel: data.difficultyLevel,
        }
      )

      setCurrentJobId(result.jobId)
    } catch (err) {
      console.error('Error creating structure job:', err)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : '構成生成ジョブの作成に失敗しました')
      }
      setStep('input')
    }
  }, [])

  // コンテンツ生成ジョブを作成（構成承認後）
  const handleGenerateContent = useCallback(async () => {
    if (!generatedStructure || !formData) return

    setError(null)
    setStep('content_generating')
    setJobProgress(0)
    setJobStatus('queued')
    setJobStep('コンテンツ生成ジョブを開始しています...')

    try {
      const result = await apiPost<{ jobId: string; status: string; message: string }>(
        'create-curriculum-job',
        {
          jobType: 'content',
          goal: formData.goal,
          targetAudience: generatedStructure.targetAudience,
          durationMinutes: generatedStructure.durationMinutes,
          difficultyLevel: generatedStructure.difficultyLevel,
          structure: {
            name: generatedStructure.name,
            description: generatedStructure.description,
            chapters: generatedStructure.chapters,
            tags: generatedStructure.tags,
          },
        }
      )

      setCurrentJobId(result.jobId)
    } catch (err) {
      console.error('Error creating content job:', err)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'コンテンツ生成ジョブの作成に失敗しました')
      }
      setStep('structure_review')
    }
  }, [generatedStructure, formData])

  const handleUseGenerated = () => {
    if (generatedCurriculum) {
      onGenerated(generatedCurriculum)
    }
  }

  const handleRestart = () => {
    setStep('input')
    setGeneratedStructure(null)
    setGeneratedCurriculum(null)
    setUsageInfo({})
    setError(null)
    setCurrentJobId(null)
    setJobProgress(0)
    setJobStatus(null)
    setJobStep('')
  }

  // ステップインジケーター
  const StepIndicator = () => {
    const steps: { key: Step; label: string }[] = [
      { key: 'input', label: '入力' },
      { key: 'structure_generating', label: '構成生成' },
      { key: 'structure_review', label: '構成確認' },
      { key: 'content_generating', label: 'コンテンツ' },
      { key: 'complete', label: '完了' },
    ]

    const currentIndex = steps.findIndex((s) => s.key === step || (step === 'structure_generating' && s.key === 'structure_generating'))

    return (
      <div className="flex items-center justify-center gap-1 mb-6">
        {steps.map((s, index) => (
          <div key={s.key} className="flex items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                index < currentIndex
                  ? 'bg-success text-white'
                  : index === currentIndex
                    ? 'bg-primary text-white'
                    : 'bg-gray-200 text-text-light'
              }`}
            >
              {index < currentIndex ? <CheckCircleIcon className="w-4 h-4" /> : index + 1}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-6 h-0.5 ${index < currentIndex ? 'bg-success' : 'bg-gray-200'}`}
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  // 進捗表示コンポーネント
  const ProgressDisplay = ({ title, description }: { title: string; description: string }) => (
    <div className="space-y-4">
      <StepIndicator />

      <div className="bg-primary-light/50 rounded-lg p-4 flex items-start gap-3">
        <SparklesIcon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5 animate-pulse" />
        <div className="text-sm">
          <p className="font-medium text-text">{title}</p>
          <p className="text-text-light mt-1">{description}</p>
        </div>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 進捗バー */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-light">{jobStep}</span>
          <span className="text-text font-medium">{jobProgress}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${jobProgress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* ステータスアイコン */}
      <div className="flex items-center justify-center gap-2 py-4">
        {jobStatus === 'failed' ? (
          <XCircleIcon className="w-8 h-8 text-error" />
        ) : jobStatus === 'completed' ? (
          <CheckCircleIcon className="w-8 h-8 text-success" />
        ) : (
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        )}
        <span className="text-text-light">
          {jobStatus ? STATUS_LABELS[jobStatus] : '準備中...'}
        </span>
      </div>
    </div>
  )

  // Step 1: 入力フォーム
  if (step === 'input') {
    return (
      <form onSubmit={handleSubmit(handleGenerateStructure)} className="space-y-4">
        <StepIndicator />

        <div className="bg-primary-light/50 rounded-lg p-4 flex items-start gap-3">
          <SparklesIcon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-text">Step 1: 構成の自動生成</p>
            <p className="text-text-light mt-1">
              Claude Opus 4.5 がカリキュラムの構成を設計します。構成を確認・承認後、詳細コンテンツを生成します。
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            研修ゴール <span className="text-error">*</span>
          </label>
          <textarea
            className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
              transition-colors duration-200 min-h-[100px]
              focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
            placeholder="例：生成AIを業務で活用するための基礎知識と実践スキルを習得する"
            {...register('goal')}
          />
          {errors.goal && <p className="mt-1 text-sm text-error">{errors.goal.message}</p>}
        </div>

        <Input
          label="対象者"
          placeholder="企業の一般社員"
          helperText="研修の対象となる受講者の属性を入力してください"
          {...register('targetAudience')}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="目標所要時間（分）"
            type="number"
            placeholder="60"
            error={errors.durationMinutes?.message}
            {...register('durationMinutes', { valueAsNumber: true })}
          />

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">難易度</label>
            <select
              className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
              {...register('difficultyLevel')}
            >
              {(['beginner', 'intermediate', 'advanced'] as DifficultyLevel[]).map((level) => (
                <option key={level} value={level}>
                  {DIFFICULTY_LABELS[level]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            キャンセル
          </Button>
          <Button type="submit" leftIcon={<SparklesIcon className="w-5 h-5" />}>
            構成を生成
          </Button>
        </ModalFooter>
      </form>
    )
  }

  // Step 2: 構成生成中
  if (step === 'structure_generating') {
    return (
      <ProgressDisplay
        title="構成を生成中..."
        description="Claude Opus 4.5 がカリキュラムの構成を設計しています。しばらくお待ちください。"
      />
    )
  }

  // Step 3: 構成確認・承認
  if (step === 'structure_review' && generatedStructure) {
    const totalMinutes = generatedStructure.chapters.reduce((sum, ch) => sum + ch.estimatedMinutes, 0)

    return (
      <div className="space-y-4">
        <StepIndicator />

        <div className="bg-green-50 rounded-lg p-4 flex items-start gap-3">
          <CheckCircleIcon className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-text">Step 2: 構成の確認・承認</p>
            <p className="text-text-light mt-1">
              カリキュラム構成が生成されました。内容を確認し、承認するとコンテンツ生成に進みます。
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
          {/* カリキュラムヘッダー */}
          <div>
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-semibold text-lg text-text">{generatedStructure.name}</h3>
              <Badge
                variant={
                  DIFFICULTY_LABELS[generatedStructure.difficultyLevel] === '初級'
                    ? 'success'
                    : DIFFICULTY_LABELS[generatedStructure.difficultyLevel] === '中級'
                      ? 'warning'
                      : 'error'
                }
              >
                {DIFFICULTY_LABELS[generatedStructure.difficultyLevel]}
              </Badge>
            </div>
            <p className="text-sm text-text-light mt-2">{generatedStructure.description}</p>
          </div>

          {/* メタ情報 */}
          <div className="flex flex-wrap gap-4 text-sm text-text-light">
            <span className="flex items-center gap-1">
              <ClockIcon className="w-4 h-4" />
              合計 {totalMinutes}分
            </span>
            <span className="flex items-center gap-1">
              <AcademicCapIcon className="w-4 h-4" />
              {generatedStructure.chapters.length}チャプター
            </span>
          </div>

          {/* タグ */}
          <div className="flex flex-wrap gap-2">
            {generatedStructure.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 text-xs bg-primary-light text-primary rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* チャプター一覧 */}
          <div className="border-t border-border pt-4">
            <h4 className="font-medium text-text mb-3">チャプター構成</h4>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {generatedStructure.chapters.map((chapter) => (
                <motion.div
                  key={chapter.order}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: chapter.order * 0.05 }}
                  className="p-4 bg-white rounded-lg border border-border"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-primary text-white text-sm font-medium rounded-full">
                      {chapter.order}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-text">{chapter.title}</p>
                        <span className="text-xs text-text-light whitespace-nowrap">
                          {chapter.estimatedMinutes}分
                        </span>
                      </div>
                      <p className="text-sm text-text-light mt-1">{chapter.summary}</p>
                      {chapter.learningObjectives.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-text-light">学習目標:</p>
                          <ul className="mt-1 space-y-0.5">
                            {chapter.learningObjectives.map((obj, i) => (
                              <li key={i} className="text-xs text-text-light flex items-start gap-1">
                                <span className="text-primary">•</span>
                                {obj}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* 使用量情報 */}
        {usageInfo.structure && (
          <p className="text-xs text-text-light text-right">
            構成生成: {usageInfo.structure.model} ({usageInfo.structure.tokens.toLocaleString()} tokens)
          </p>
        )}

        <div className="bg-yellow-50 rounded-lg p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">承認後の処理</p>
            <p className="mt-1">
              承認すると Claude Sonnet 4.5 が各チャプターの詳細コンテンツを生成します。
              チャプター数に応じて数分かかる場合があります。
            </p>
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={handleRestart}>
            やり直す
          </Button>
          <Button onClick={handleGenerateContent} leftIcon={<CheckCircleIcon className="w-5 h-5" />}>
            構成を承認してコンテンツを生成
          </Button>
        </ModalFooter>
      </div>
    )
  }

  // Step 4: コンテンツ生成中
  if (step === 'content_generating') {
    return (
      <ProgressDisplay
        title="コンテンツを生成中..."
        description={`Claude Sonnet 4.5 が各チャプターの詳細コンテンツを作成しています。${generatedStructure?.chapters.length || 0}チャプター分を生成中です。`}
      />
    )
  }

  // Step 5: 完了
  if (step === 'complete' && generatedCurriculum) {
    return (
      <div className="space-y-4">
        <StepIndicator />

        <Alert variant="success">カリキュラムの生成が完了しました。内容を確認してください。</Alert>

        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
          <div>
            <h3 className="font-semibold text-lg text-text">{generatedCurriculum.name}</h3>
            <p className="text-sm text-text-light mt-1">{generatedCurriculum.description}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {generatedCurriculum.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 text-xs bg-primary-light text-primary rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="font-medium text-text mb-2">
              生成されたチャプター（{generatedCurriculum.chapters.length}章）
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {generatedCurriculum.chapters.map((chapter) => (
                <div
                  key={chapter.order}
                  className="flex items-start gap-3 p-3 bg-white rounded-lg border border-border"
                >
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-success text-white text-xs font-medium rounded-full">
                    <CheckCircleIcon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-text">{chapter.title}</p>
                    <p className="text-xs text-text-light mt-0.5">
                      約{chapter.estimatedMinutes}分 | コンテンツ生成済み
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 使用量情報 */}
        <div className="text-xs text-text-light text-right space-y-1">
          {usageInfo.structure && (
            <p>
              構成生成: {usageInfo.structure.model} ({usageInfo.structure.tokens.toLocaleString()}{' '}
              tokens)
            </p>
          )}
          {usageInfo.content && (
            <p>
              コンテンツ生成: {usageInfo.content.model} ({usageInfo.content.tokens.toLocaleString()}{' '}
              tokens)
            </p>
          )}
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={handleRestart} leftIcon={<PencilIcon className="w-4 h-4" />}>
            最初からやり直す
          </Button>
          <Button onClick={handleUseGenerated}>このカリキュラムを使用</Button>
        </ModalFooter>
      </div>
    )
  }

  return null
}
