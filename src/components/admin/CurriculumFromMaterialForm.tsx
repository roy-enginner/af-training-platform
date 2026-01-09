import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  SparklesIcon,
  DocumentDuplicateIcon,
  CheckCircleIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, ModalFooter, Alert, Badge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { SourceMaterial, DifficultyLevel, DepthLevel, ExampleFrequency, ToneStyle, CurriculumTemplate } from '@/types/database'
import { MaterialUploadForm } from './MaterialUploadForm'

// フォームスキーマ
const generateSchema = z.object({
  materialId: z.string().min(1, '資料を選択してください'),
  goal: z.string().min(10, '研修ゴールを10文字以上で入力してください'),
  targetAudience: z.string().optional(),
  durationMinutes: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(15, '最小15分以上を設定してください')
    .max(480, '最大480分（8時間）まで設定できます'),
  difficultyLevel: z.enum(['beginner', 'intermediate', 'advanced', 'mixed'] as const),
  // 詳細パラメータ
  depthLevel: z.enum(['overview', 'standard', 'deep'] as const).default('standard'),
  exerciseRatio: z.number().min(0).max(100).default(20),
  exampleFrequency: z.enum(['minimal', 'moderate', 'abundant'] as const).default('moderate'),
  toneStyle: z.enum(['formal', 'casual', 'technical'] as const).default('formal'),
  customInstructions: z.string().optional(),
})

type GenerateFormData = z.infer<typeof generateSchema>

// 構成生成後の型
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

// 最終カリキュラム
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
  sourceMaterialId: string
}

interface CurriculumFromMaterialFormProps {
  onGenerated: (curriculum: GeneratedCurriculum) => void
  onCancel: () => void
}

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  beginner: '初級',
  intermediate: '中級',
  advanced: '上級',
  mixed: '混合',
}

const DEPTH_LABELS: Record<DepthLevel, { label: string; description: string }> = {
  overview: { label: '概要', description: '要点を簡潔に。短時間で把握したい場合' },
  standard: { label: '標準', description: 'バランスの取れた詳細度' },
  deep: { label: '深掘り', description: '詳細な解説と背景知識を含む' },
}

const EXAMPLE_LABELS: Record<ExampleFrequency, string> = {
  minimal: '最小限',
  moderate: '適度',
  abundant: '豊富',
}

const TONE_LABELS: Record<ToneStyle, string> = {
  formal: 'フォーマル',
  casual: 'カジュアル',
  technical: '技術的',
}

const MATERIAL_TYPE_LABELS = {
  pdf: 'PDF',
  url: 'URL',
  text: 'テキスト',
  markdown: 'Markdown',
  excel: 'Excel',
}

type Step = 'select-material' | 'configure' | 'structure' | 'content' | 'complete'

export function CurriculumFromMaterialForm({ onGenerated, onCancel }: CurriculumFromMaterialFormProps) {
  const [step, setStep] = useState<Step>('select-material')
  const [materials, setMaterials] = useState<SourceMaterial[]>([])
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<SourceMaterial | null>(null)
  const [generatedStructure, setGeneratedStructure] = useState<GeneratedStructure | null>(null)
  const [generatedCurriculum, setGeneratedCurriculum] = useState<GeneratedCurriculum | null>(null)
  const [usageInfo, setUsageInfo] = useState<{ structure?: { tokens: number }; content?: { tokens: number } }>({})
  const [templates, setTemplates] = useState<CurriculumTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<GenerateFormData>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      materialId: '',
      goal: '',
      targetAudience: '企業の一般社員',
      durationMinutes: 60,
      difficultyLevel: 'beginner',
      depthLevel: 'standard',
      exerciseRatio: 20,
      exampleFrequency: 'moderate',
      toneStyle: 'formal',
      customInstructions: '',
    },
  })

  const watchMaterialId = watch('materialId')
  const watchExerciseRatio = watch('exerciseRatio')

  // 抽出済み資料を取得
  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        setIsLoadingMaterials(true)
        const { data, error: fetchError } = await supabase
          .from('source_materials')
          .select('*')
          .eq('is_active', true)
          .eq('extraction_status', 'completed')
          .order('created_at', { ascending: false })

        if (fetchError) throw fetchError
        setMaterials(data || [])
      } catch (err) {
        console.error('Error fetching materials:', err)
        setError('資料の取得に失敗しました')
      } finally {
        setIsLoadingMaterials(false)
      }
    }

    fetchMaterials()
  }, [])

  // テンプレート一覧を取得
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('curriculum_templates')
          .select('*')
          .eq('is_active', true)
          .eq('template_type', 'style')
          .order('sort_order', { ascending: true })

        if (fetchError) throw fetchError
        setTemplates(data || [])
      } catch (err) {
        console.error('Error fetching templates:', err)
      }
    }

    fetchTemplates()
  }, [])

  // テンプレート選択時にパラメータを適用
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId)

    if (!templateId) return

    const template = templates.find(t => t.id === templateId)
    if (!template) return

    const content = template.content as {
      depthLevel?: DepthLevel
      exerciseRatio?: number
      exampleFrequency?: ExampleFrequency
      toneStyle?: ToneStyle
      promptAddition?: string
    }

    if (content.depthLevel) setValue('depthLevel', content.depthLevel)
    if (content.exerciseRatio !== undefined) setValue('exerciseRatio', content.exerciseRatio)
    if (content.exampleFrequency) setValue('exampleFrequency', content.exampleFrequency)
    if (content.toneStyle) setValue('toneStyle', content.toneStyle)
    if (content.promptAddition) setValue('customInstructions', content.promptAddition)
  }

  // 資料選択時の処理
  useEffect(() => {
    if (watchMaterialId) {
      const material = materials.find(m => m.id === watchMaterialId)
      setSelectedMaterial(material || null)
    } else {
      setSelectedMaterial(null)
    }
  }, [watchMaterialId, materials])

  // アップロード成功時
  const handleUploadSuccess = async () => {
    setShowUploadForm(false)
    // 資料一覧を再取得
    const { data } = await supabase
      .from('source_materials')
      .select('*')
      .eq('is_active', true)
      .eq('extraction_status', 'completed')
      .order('created_at', { ascending: false })

    if (data) {
      setMaterials(data)
      // 新しく追加した資料を選択
      if (data.length > 0) {
        setValue('materialId', data[0].id)
      }
    }
  }

  // Step 1: 構成生成
  const handleGenerateStructure = async (data: GenerateFormData) => {
    if (!selectedMaterial) {
      setError('資料を選択してください')
      return
    }

    setIsGenerating(true)
    setError(null)
    setStep('structure')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('ログインセッションが切れています。再ログインしてください。')
        setStep('configure')
        return
      }

      const response = await fetch('/.netlify/functions/generate-curriculum-from-material', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          materialId: data.materialId,
          goal: data.goal,
          targetAudience: data.targetAudience,
          durationMinutes: data.durationMinutes,
          difficultyLevel: data.difficultyLevel,
          options: {
            depthLevel: data.depthLevel,
            exerciseRatio: data.exerciseRatio,
            exampleFrequency: data.exampleFrequency,
            toneStyle: data.toneStyle,
            customInstructions: data.customInstructions,
          },
          step: 'structure',
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '構成生成に失敗しました')
      }

      setGeneratedStructure(result.structure)
      setUsageInfo({
        structure: { tokens: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0) },
      })
    } catch (err) {
      console.error('Error generating structure:', err)
      setError(err instanceof Error ? err.message : '構成生成に失敗しました')
      setStep('configure')
    } finally {
      setIsGenerating(false)
    }
  }

  // Step 2: コンテンツ生成
  const handleGenerateContent = async () => {
    if (!generatedStructure || !selectedMaterial) return

    setIsGenerating(true)
    setError(null)
    setStep('content')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('ログインセッションが切れています。再ログインしてください。')
        setStep('structure')
        return
      }

      const formData = watch()

      const response = await fetch('/.netlify/functions/generate-curriculum-from-material', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          materialId: selectedMaterial.id,
          goal: formData.goal,
          targetAudience: generatedStructure.targetAudience,
          difficultyLevel: generatedStructure.difficultyLevel,
          structure: generatedStructure,
          options: {
            depthLevel: formData.depthLevel,
            exerciseRatio: formData.exerciseRatio,
            exampleFrequency: formData.exampleFrequency,
            toneStyle: formData.toneStyle,
            customInstructions: formData.customInstructions,
          },
          step: 'content',
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'コンテンツ生成に失敗しました')
      }

      setGeneratedCurriculum({
        ...result.curriculum,
        sourceMaterialId: selectedMaterial.id,
      })
      setUsageInfo(prev => ({
        ...prev,
        content: { tokens: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0) },
      }))
      setStep('complete')
    } catch (err) {
      console.error('Error generating content:', err)
      setError(err instanceof Error ? err.message : 'コンテンツ生成に失敗しました')
      setStep('structure')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUseGenerated = () => {
    if (generatedCurriculum) {
      onGenerated(generatedCurriculum)
    }
  }

  const handleRestart = () => {
    setStep('select-material')
    setGeneratedStructure(null)
    setGeneratedCurriculum(null)
    setUsageInfo({})
    setError(null)
  }

  // ステップインジケーター
  const StepIndicator = () => {
    const steps: Step[] = ['select-material', 'configure', 'structure', 'content', 'complete']
    const stepLabels = ['資料選択', '設定', '構成確認', 'コンテンツ生成', '完了']
    const currentIndex = steps.indexOf(step)

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((s, index) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                index === currentIndex
                  ? 'bg-primary text-white'
                  : index < currentIndex
                    ? 'bg-success text-white'
                    : 'bg-gray-200 text-text-light'
              }`}
              title={stepLabels[index]}
            >
              {index < currentIndex ? (
                <CheckCircleIcon className="w-5 h-5" />
              ) : (
                index + 1
              )}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-8 h-0.5 ${
                  index < currentIndex ? 'bg-success' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  // Step 1: 資料選択
  if (step === 'select-material') {
    return (
      <div className="space-y-4">
        <StepIndicator />

        <div className="bg-primary-light/50 rounded-lg p-4 flex items-start gap-3">
          <DocumentDuplicateIcon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-text">Step 1: 資料の選択</p>
            <p className="text-text-light mt-1">
              カリキュラム生成のベースとなる資料を選択してください。
              抽出済みの資料のみ選択可能です。
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* アップロードフォーム表示切り替え */}
        {showUploadForm ? (
          <div className="border border-border rounded-lg p-4">
            <h4 className="font-medium text-text mb-3">新規資料をアップロード</h4>
            <MaterialUploadForm
              onSuccess={handleUploadSuccess}
              onCancel={() => setShowUploadForm(false)}
            />
          </div>
        ) : (
          <>
            {/* 資料選択 */}
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                抽出済み資料 <span className="text-error">*</span>
              </label>
              {isLoadingMaterials ? (
                <div className="text-center py-8 text-text-light">
                  読み込み中...
                </div>
              ) : materials.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-lg">
                  <DocumentDuplicateIcon className="w-12 h-12 mx-auto text-text-light mb-2" />
                  <p className="text-text-light">抽出済みの資料がありません</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setShowUploadForm(true)}
                  >
                    <PlusIcon className="w-4 h-4 mr-1" />
                    資料をアップロード
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {materials.map(material => (
                    <label
                      key={material.id}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        watchMaterialId === material.id
                          ? 'border-primary bg-primary-light/30'
                          : 'border-border hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        value={material.id}
                        {...register('materialId')}
                        className="w-4 h-4 text-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text truncate">{material.name}</span>
                          <Badge variant="primary" size="sm">
                            {MATERIAL_TYPE_LABELS[material.material_type as keyof typeof MATERIAL_TYPE_LABELS]}
                          </Badge>
                        </div>
                        <p className="text-xs text-text-light mt-0.5 truncate">
                          {material.original_filename || material.original_url || '-'}
                        </p>
                        {material.metadata && (
                          <p className="text-xs text-text-light">
                            {(material.metadata as { char_count?: number }).char_count?.toLocaleString() || 0}文字
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {errors.materialId && (
                <p className="mt-1 text-sm text-error">{errors.materialId.message}</p>
              )}
            </div>

            {/* 新規アップロードボタン */}
            {materials.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUploadForm(true)}
              >
                <PlusIcon className="w-4 h-4 mr-1" />
                新規資料をアップロード
              </Button>
            )}
          </>
        )}

        <ModalFooter>
          <Button variant="ghost" onClick={onCancel}>
            キャンセル
          </Button>
          <Button
            onClick={() => {
              if (watchMaterialId) {
                setStep('configure')
              } else {
                setError('資料を選択してください')
              }
            }}
            disabled={!watchMaterialId || showUploadForm}
          >
            次へ: 設定
          </Button>
        </ModalFooter>
      </div>
    )
  }

  // Step 2: 設定
  if (step === 'configure') {
    return (
      <form onSubmit={handleSubmit(handleGenerateStructure)} className="space-y-4">
        <StepIndicator />

        <div className="bg-primary-light/50 rounded-lg p-4 flex items-start gap-3">
          <SparklesIcon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-text">Step 2: 生成設定</p>
            <p className="text-text-light mt-1">
              選択した資料: <span className="font-medium">{selectedMaterial?.name}</span>
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* テンプレート選択 */}
        {templates.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              テンプレート（任意）
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  !selectedTemplateId
                    ? 'border-primary bg-primary-light text-primary'
                    : 'border-border bg-white text-text-light hover:bg-gray-50'
                }`}
                onClick={() => handleTemplateSelect('')}
              >
                カスタム
              </button>
              {templates.map(template => (
                <button
                  key={template.id}
                  type="button"
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                    selectedTemplateId === template.id
                      ? 'border-primary bg-primary-light text-primary'
                      : 'border-border bg-white text-text-light hover:bg-gray-50'
                  }`}
                  onClick={() => handleTemplateSelect(template.id)}
                  title={template.description || undefined}
                >
                  {template.name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-text-light">
              テンプレートを選択すると詳細パラメータが自動設定されます
            </p>
          </div>
        )}

        {/* 研修ゴール */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            研修ゴール <span className="text-error">*</span>
          </label>
          <textarea
            className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
              transition-colors duration-200 min-h-[80px]
              focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
            placeholder="例：この資料の内容を理解し、業務で実践できるようになる"
            {...register('goal')}
          />
          {errors.goal && (
            <p className="mt-1 text-sm text-error">{errors.goal.message}</p>
          )}
        </div>

        <Input
          label="対象者"
          placeholder="企業の一般社員"
          helperText="研修の対象となる受講者の属性"
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
            <label className="block text-sm font-medium text-text mb-1.5">
              難易度
            </label>
            <select
              className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
              {...register('difficultyLevel')}
            >
              {(Object.keys(DIFFICULTY_LABELS) as DifficultyLevel[]).map(level => (
                <option key={level} value={level}>
                  {DIFFICULTY_LABELS[level]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 詳細パラメータ（折りたたみ） */}
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span className="text-sm font-medium text-text">詳細パラメータ</span>
            {showAdvanced ? (
              <ChevronUpIcon className="w-5 h-5 text-text-light" />
            ) : (
              <ChevronDownIcon className="w-5 h-5 text-text-light" />
            )}
          </button>

          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-4 space-y-4"
            >
              {/* 内容の深さ */}
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">
                  内容の深さ
                </label>
                <select
                  className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                    transition-colors duration-200
                    focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
                  {...register('depthLevel')}
                >
                  {(Object.keys(DEPTH_LABELS) as DepthLevel[]).map(level => (
                    <option key={level} value={level}>
                      {DEPTH_LABELS[level].label} - {DEPTH_LABELS[level].description}
                    </option>
                  ))}
                </select>
              </div>

              {/* 演習の比率 */}
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">
                  演習の比率: {watchExerciseRatio}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  {...register('exerciseRatio', { valueAsNumber: true })}
                />
                <div className="flex justify-between text-xs text-text-light mt-1">
                  <span>解説重視</span>
                  <span>演習重視</span>
                </div>
              </div>

              {/* 例示の量 */}
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">
                  例示の量
                </label>
                <select
                  className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                    transition-colors duration-200
                    focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
                  {...register('exampleFrequency')}
                >
                  {(Object.keys(EXAMPLE_LABELS) as ExampleFrequency[]).map(freq => (
                    <option key={freq} value={freq}>
                      {EXAMPLE_LABELS[freq]}
                    </option>
                  ))}
                </select>
              </div>

              {/* 言語スタイル */}
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">
                  言語スタイル
                </label>
                <select
                  className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                    transition-colors duration-200
                    focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
                  {...register('toneStyle')}
                >
                  {(Object.keys(TONE_LABELS) as ToneStyle[]).map(style => (
                    <option key={style} value={style}>
                      {TONE_LABELS[style]}
                    </option>
                  ))}
                </select>
              </div>

              {/* カスタム指示 */}
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">
                  追加指示（任意）
                </label>
                <textarea
                  className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                    transition-colors duration-200 min-h-[60px]
                    focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
                  placeholder="例：具体例を多く含めてください"
                  {...register('customInstructions')}
                />
              </div>
            </motion.div>
          )}
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={() => setStep('select-material')}>
            戻る
          </Button>
          <Button
            type="submit"
            isLoading={isGenerating}
            leftIcon={!isGenerating ? <SparklesIcon className="w-5 h-5" /> : undefined}
          >
            {isGenerating ? '構成を生成中...' : '構成を生成'}
          </Button>
        </ModalFooter>
      </form>
    )
  }

  // Step 3: 構成確認
  if (step === 'structure' && generatedStructure) {
    const totalMinutes = generatedStructure.chapters.reduce((sum, ch) => sum + ch.estimatedMinutes, 0)

    return (
      <div className="space-y-4">
        <StepIndicator />

        <div className="bg-green-50 rounded-lg p-4 flex items-start gap-3">
          <CheckCircleIcon className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-text">Step 3: 構成の確認・承認</p>
            <p className="text-text-light mt-1">
              カリキュラム構成が生成されました。承認するとコンテンツ生成に進みます。
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
              <Badge variant={generatedStructure.difficultyLevel === 'beginner' ? 'success' : generatedStructure.difficultyLevel === 'intermediate' ? 'warning' : 'error'}>
                {DIFFICULTY_LABELS[generatedStructure.difficultyLevel]}
              </Badge>
            </div>
            <p className="text-sm text-text-light mt-2">{generatedStructure.description}</p>
          </div>

          {/* メタ情報 */}
          <div className="flex flex-wrap gap-4 text-sm text-text-light">
            <span>合計 {totalMinutes}分</span>
            <span>{generatedStructure.chapters.length}チャプター</span>
          </div>

          {/* タグ */}
          <div className="flex flex-wrap gap-2">
            {generatedStructure.tags.map(tag => (
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
              {generatedStructure.chapters.map(chapter => (
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
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* 使用トークン情報 */}
        {usageInfo.structure && (
          <p className="text-xs text-text-light text-right">
            構成生成: {usageInfo.structure.tokens.toLocaleString()} tokens
          </p>
        )}

        <ModalFooter>
          <Button variant="ghost" onClick={handleRestart}>
            やり直す
          </Button>
          <Button
            onClick={handleGenerateContent}
            isLoading={isGenerating}
            leftIcon={<CheckCircleIcon className="w-5 h-5" />}
          >
            構成を承認してコンテンツを生成
          </Button>
        </ModalFooter>
      </div>
    )
  }

  // Step 4: コンテンツ生成中
  if (step === 'content') {
    return (
      <div className="space-y-4">
        <StepIndicator />

        <div className="text-center py-12">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h3 className="text-lg font-medium text-text mb-2">コンテンツを生成中...</h3>
          <p className="text-text-light">
            Claude Sonnet が各チャプターの詳細コンテンツを作成しています。
          </p>
          <p className="text-sm text-text-light mt-2">
            {generatedStructure?.chapters.length || 0}チャプター分のコンテンツを生成中
          </p>
        </div>
      </div>
    )
  }

  // Step 5: 完了
  if (step === 'complete' && generatedCurriculum) {
    return (
      <div className="space-y-4">
        <StepIndicator />

        <Alert variant="success">
          カリキュラムの生成が完了しました。
        </Alert>

        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
          <div>
            <h3 className="font-semibold text-lg text-text">{generatedCurriculum.name}</h3>
            <p className="text-sm text-text-light mt-1">{generatedCurriculum.description}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {generatedCurriculum.tags.map(tag => (
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
              {generatedCurriculum.chapters.map(chapter => (
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

        {/* 使用トークン情報 */}
        <div className="text-xs text-text-light text-right space-y-1">
          {usageInfo.structure && (
            <p>構成生成: {usageInfo.structure.tokens.toLocaleString()} tokens</p>
          )}
          {usageInfo.content && (
            <p>コンテンツ生成: {usageInfo.content.tokens.toLocaleString()} tokens</p>
          )}
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={handleRestart}>
            最初からやり直す
          </Button>
          <Button onClick={handleUseGenerated}>
            このカリキュラムを使用
          </Button>
        </ModalFooter>
      </div>
    )
  }

  return null
}
