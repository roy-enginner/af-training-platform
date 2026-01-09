import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, ModalFooter } from '@/components/ui'
import type { CurriculumTemplate, TemplateType, DepthLevel, ExampleFrequency, ToneStyle } from '@/types/database'

// フォームスキーマ
const templateSchema = z.object({
  name: z.string().min(1, 'テンプレート名を入力してください'),
  description: z.string().optional(),
  template_type: z.enum(['structure', 'prompt', 'style'] as const),
  // スタイルテンプレートのコンテンツ
  depthLevel: z.enum(['overview', 'standard', 'deep'] as const).optional(),
  exerciseRatio: z.number().min(0).max(100).optional(),
  exampleFrequency: z.enum(['minimal', 'moderate', 'abundant'] as const).optional(),
  toneStyle: z.enum(['formal', 'casual', 'technical'] as const).optional(),
  promptAddition: z.string().optional(),
})

type TemplateFormData = z.infer<typeof templateSchema>

interface TemplateFormProps {
  template?: CurriculumTemplate | null
  onSubmit: (data: Partial<CurriculumTemplate>) => Promise<void>
  onCancel: () => void
}

const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  structure: '構成テンプレート',
  prompt: 'プロンプトテンプレート',
  style: 'スタイルテンプレート',
}

const DEPTH_LABELS: Record<DepthLevel, string> = {
  overview: '概要 - 要点を簡潔に',
  standard: '標準 - バランスの取れた詳細度',
  deep: '深掘り - 詳細な解説と背景知識',
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

export function TemplateForm({ template, onSubmit, onCancel }: TemplateFormProps) {
  const isEditing = !!template

  // 既存のコンテンツをパース
  const existingContent = template?.content as {
    depthLevel?: DepthLevel
    exerciseRatio?: number
    exampleFrequency?: ExampleFrequency
    toneStyle?: ToneStyle
    promptAddition?: string
  } | undefined

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: template?.name || '',
      description: template?.description || '',
      template_type: template?.template_type || 'style',
      depthLevel: existingContent?.depthLevel || 'standard',
      exerciseRatio: existingContent?.exerciseRatio ?? 20,
      exampleFrequency: existingContent?.exampleFrequency || 'moderate',
      toneStyle: existingContent?.toneStyle || 'formal',
      promptAddition: existingContent?.promptAddition || '',
    },
  })

  const watchTemplateType = watch('template_type')
  const watchExerciseRatio = watch('exerciseRatio')

  const handleFormSubmit = async (data: TemplateFormData) => {
    // コンテンツオブジェクトを構築
    const content: Record<string, unknown> = {}

    if (data.template_type === 'style') {
      content.depthLevel = data.depthLevel
      content.exerciseRatio = data.exerciseRatio
      content.exampleFrequency = data.exampleFrequency
      content.toneStyle = data.toneStyle
      if (data.promptAddition) {
        content.promptAddition = data.promptAddition
      }
    }

    await onSubmit({
      name: data.name,
      description: data.description || null,
      template_type: data.template_type,
      content,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Input
        label="テンプレート名"
        placeholder="新入社員向け"
        error={errors.name?.message}
        {...register('name')}
      />

      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          説明
        </label>
        <textarea
          className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
            transition-colors duration-200 min-h-[80px]
            focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
          placeholder="基礎から丁寧に説明。前提知識を仮定しない構成"
          {...register('description')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          テンプレートタイプ
        </label>
        <select
          className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
          {...register('template_type')}
          disabled={isEditing}
        >
          {(Object.keys(TEMPLATE_TYPE_LABELS) as TemplateType[]).map((type) => (
            <option key={type} value={type}>
              {TEMPLATE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-light">
          スタイルテンプレート: 生成パラメータのプリセット
        </p>
      </div>

      {/* スタイルテンプレートの設定 */}
      {watchTemplateType === 'style' && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-text">スタイル設定</h4>

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
              {(Object.keys(DEPTH_LABELS) as DepthLevel[]).map((level) => (
                <option key={level} value={level}>
                  {DEPTH_LABELS[level]}
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
              {(Object.keys(EXAMPLE_LABELS) as ExampleFrequency[]).map((freq) => (
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
              {(Object.keys(TONE_LABELS) as ToneStyle[]).map((style) => (
                <option key={style} value={style}>
                  {TONE_LABELS[style]}
                </option>
              ))}
            </select>
          </div>

          {/* 追加プロンプト */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              追加プロンプト（任意）
            </label>
            <textarea
              className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                transition-colors duration-200 min-h-[60px]
                focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
              placeholder="例：専門用語は必ず解説を入れてください。"
              {...register('promptAddition')}
            />
            <p className="mt-1 text-xs text-text-light">
              AIへの追加指示を記述できます
            </p>
          </div>
        </div>
      )}

      <ModalFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          キャンセル
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {isEditing ? '更新する' : '追加する'}
        </Button>
      </ModalFooter>
    </form>
  )
}
