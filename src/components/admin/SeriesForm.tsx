import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, ModalFooter } from '@/components/ui'
import type { CurriculumSeries, DifficultyLevel, SeriesType } from '@/types/database'

// フォームスキーマ
const seriesSchema = z.object({
  name: z.string().min(1, 'シリーズ名を入力してください'),
  description: z.string().optional(),
  seriesType: z.enum(['sequential', 'modular'] as const),
  targetAudience: z.string().optional(),
  difficultyLevel: z.enum(['beginner', 'intermediate', 'advanced', 'mixed'] as const).optional(),
  totalDurationMinutes: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(0, '0以上の値を設定してください')
    .nullable()
    .optional(),
  tags: z.string().optional(),
})

type SeriesFormData = z.infer<typeof seriesSchema>

export interface SeriesFormSubmitData {
  name: string
  description: string | null
  seriesType: SeriesType
  targetAudience: string | null
  difficultyLevel: DifficultyLevel | null
  totalDurationMinutes: number | null
  tags: string[] | null
}

interface SeriesFormProps {
  series?: CurriculumSeries | null
  onSubmit: (data: SeriesFormSubmitData) => Promise<void>
  onCancel: () => void
}

const SERIES_TYPE_LABELS: Record<SeriesType, { label: string; description: string }> = {
  sequential: {
    label: '順序型',
    description: 'カリキュラムを順番通りに受講する必要があります'
  },
  modular: {
    label: 'モジュール型',
    description: '各カリキュラムを独立して受講できます'
  },
}

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  beginner: '初級',
  intermediate: '中級',
  advanced: '上級',
  mixed: '混合（複数レベル）',
}

export function SeriesForm({ series, onSubmit, onCancel }: SeriesFormProps) {
  const isEditing = !!series

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SeriesFormData>({
    resolver: zodResolver(seriesSchema),
    defaultValues: {
      name: series?.name || '',
      description: series?.description || '',
      seriesType: series?.series_type || 'modular',
      targetAudience: series?.target_audience || '',
      difficultyLevel: series?.difficulty_level || undefined,
      totalDurationMinutes: series?.total_duration_minutes ?? null,
      tags: series?.tags?.join(', ') || '',
    },
  })

  const handleFormSubmit = async (data: SeriesFormData) => {
    // タグをカンマ区切りから配列に変換
    const tagsArray = data.tags
      ? data.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : null

    await onSubmit({
      name: data.name,
      description: data.description || null,
      seriesType: data.seriesType,
      targetAudience: data.targetAudience || null,
      difficultyLevel: data.difficultyLevel || null,
      totalDurationMinutes: data.totalDurationMinutes ?? null,
      tags: tagsArray && tagsArray.length > 0 ? tagsArray : null,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Input
        label="シリーズ名"
        placeholder="AI活用基礎研修シリーズ"
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
          placeholder="シリーズの概要を入力してください..."
          {...register('description')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          シリーズタイプ
        </label>
        <div className="space-y-2">
          {(Object.keys(SERIES_TYPE_LABELS) as SeriesType[]).map((type) => (
            <label
              key={type}
              className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-gray-50"
            >
              <input
                type="radio"
                value={type}
                {...register('seriesType')}
                className="mt-1 w-4 h-4 text-primary"
              />
              <div>
                <span className="font-medium text-text">{SERIES_TYPE_LABELS[type].label}</span>
                <p className="text-xs text-text-light mt-0.5">
                  {SERIES_TYPE_LABELS[type].description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <Input
        label="対象者"
        placeholder="新入社員、営業部門"
        helperText="シリーズの対象となる受講者"
        {...register('targetAudience')}
      />

      <div className="grid grid-cols-2 gap-4">
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
            <option value="">未設定</option>
            {(Object.keys(DIFFICULTY_LABELS) as DifficultyLevel[]).map((level) => (
              <option key={level} value={level}>
                {DIFFICULTY_LABELS[level]}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="合計時間（分）"
          type="number"
          placeholder="120"
          helperText="シリーズ全体の目安時間"
          error={errors.totalDurationMinutes?.message}
          {...register('totalDurationMinutes', { valueAsNumber: true })}
        />
      </div>

      <Input
        label="タグ"
        placeholder="AI, 基礎, 研修"
        helperText="カンマ区切りで複数入力できます"
        error={errors.tags?.message}
        {...register('tags')}
      />

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
