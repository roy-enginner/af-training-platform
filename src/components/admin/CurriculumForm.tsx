import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, ModalFooter } from '@/components/ui'
import type { Curriculum, ContentType, DifficultyLevel } from '@/types/database'

const curriculumSchema = z.object({
  name: z.string().min(1, 'カリキュラム名を入力してください'),
  description: z.string().optional(),
  contentType: z.enum(['document', 'video', 'quiz', 'external'] as const),
  contentUrl: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
  durationMinutes: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(1, '1分以上を設定してください')
    .max(480, '最大480分（8時間）まで設定できます')
    .nullable()
    .optional(),
  difficultyLevel: z.enum(['beginner', 'intermediate', 'advanced'] as const),
  tags: z.string().optional(),
  sortOrder: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(0, '0以上の値を設定してください')
    .max(9999, '最大9999まで設定できます'),
  isActive: z.boolean(),
})

type CurriculumFormData = z.infer<typeof curriculumSchema>

export interface CurriculumFormSubmitData {
  name: string
  description: string | null
  contentType: ContentType
  contentUrl: string | null
  durationMinutes: number | null
  difficultyLevel: DifficultyLevel
  tags: string[] | null
  sortOrder: number
  isActive: boolean
}

interface CurriculumFormProps {
  curriculum?: Curriculum | null
  onSubmit: (data: CurriculumFormSubmitData) => Promise<void>
  onCancel: () => void
}

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

export function CurriculumForm({ curriculum, onSubmit, onCancel }: CurriculumFormProps) {
  const isEditing = !!curriculum

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CurriculumFormData>({
    resolver: zodResolver(curriculumSchema),
    defaultValues: {
      name: curriculum?.name || '',
      description: curriculum?.description || '',
      contentType: curriculum?.content_type || 'document',
      contentUrl: curriculum?.content_url || '',
      durationMinutes: curriculum?.duration_minutes ?? 30,
      difficultyLevel: curriculum?.difficulty_level || 'beginner',
      tags: curriculum?.tags?.join(', ') || '',
      sortOrder: curriculum?.sort_order ?? 0,
      isActive: curriculum?.is_active ?? true,
    },
  })

  const handleFormSubmit = async (data: CurriculumFormData) => {
    // Parse tags from comma-separated string
    const tagsArray = data.tags
      ? data.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : null

    await onSubmit({
      name: data.name,
      description: data.description || null,
      contentType: data.contentType,
      contentUrl: data.contentUrl || null,
      durationMinutes: data.durationMinutes ?? null,
      difficultyLevel: data.difficultyLevel,
      tags: tagsArray && tagsArray.length > 0 ? tagsArray : null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Input
        label="カリキュラム名"
        placeholder="AIプロンプト入門"
        error={errors.name?.message}
        {...register('name')}
      />

      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          説明
        </label>
        <textarea
          className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
            transition-colors duration-200 min-h-[100px]
            focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
          placeholder="カリキュラムの概要を入力してください..."
          {...register('description')}
        />
        {errors.description && (
          <p className="mt-1 text-sm text-error">{errors.description.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            コンテンツタイプ
          </label>
          <select
            className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
            {...register('contentType')}
          >
            {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((type) => (
              <option key={type} value={type}>
                {CONTENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

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
            {(Object.keys(DIFFICULTY_LABELS) as DifficultyLevel[]).map((level) => (
              <option key={level} value={level}>
                {DIFFICULTY_LABELS[level]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Input
        label="コンテンツURL"
        type="url"
        placeholder="https://..."
        helperText="外部コンテンツやドキュメントのURLを入力（任意）"
        error={errors.contentUrl?.message}
        {...register('contentUrl')}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="所要時間（分）"
          type="number"
          placeholder="30"
          error={errors.durationMinutes?.message}
          {...register('durationMinutes', { valueAsNumber: true })}
        />

        <Input
          label="並び順"
          type="number"
          placeholder="0"
          helperText="小さい数字が先に表示されます"
          error={errors.sortOrder?.message}
          {...register('sortOrder', { valueAsNumber: true })}
        />
      </div>

      <Input
        label="タグ"
        placeholder="AI, プロンプト, 入門"
        helperText="カンマ区切りで複数入力できます"
        error={errors.tags?.message}
        {...register('tags')}
      />

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="isActive"
          className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
          {...register('isActive')}
        />
        <label htmlFor="isActive" className="text-sm font-medium text-text">
          カリキュラムを有効にする
        </label>
      </div>

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
