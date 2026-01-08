import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, ModalFooter } from '@/components/ui'
import type { Chapter } from '@/types/database'

const chapterSchema = z.object({
  title: z.string().min(1, 'タイトルを入力してください').max(200, 'タイトルは200文字以内で入力してください'),
  content: z.string().optional(),
  taskDescription: z.string().optional(),
  estimatedMinutes: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(1, '1分以上を設定してください')
    .max(120, '最大120分まで設定できます'),
  isActive: z.boolean(),
})

type ChapterFormData = z.infer<typeof chapterSchema>

export interface ChapterFormSubmitData {
  title: string
  content: string | null
  taskDescription: string | null
  estimatedMinutes: number
  isActive: boolean
}

interface ChapterFormProps {
  chapter?: Chapter | null
  onSubmit: (data: ChapterFormSubmitData) => Promise<void>
  onCancel: () => void
}

export function ChapterForm({ chapter, onSubmit, onCancel }: ChapterFormProps) {
  const isEditing = !!chapter

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChapterFormData>({
    resolver: zodResolver(chapterSchema),
    defaultValues: {
      title: chapter?.title || '',
      content: chapter?.content || '',
      taskDescription: chapter?.task_description || '',
      estimatedMinutes: chapter?.estimated_minutes ?? 10,
      isActive: chapter?.is_active ?? true,
    },
  })

  const handleFormSubmit = async (data: ChapterFormData) => {
    await onSubmit({
      title: data.title,
      content: data.content || null,
      taskDescription: data.taskDescription || null,
      estimatedMinutes: data.estimatedMinutes,
      isActive: data.isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Input
        label="チャプタータイトル"
        placeholder="プロンプトの基本構造を理解する"
        error={errors.title?.message}
        {...register('title')}
      />

      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          学習コンテンツ
        </label>
        <textarea
          className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
            transition-colors duration-200 min-h-[150px] font-mono text-sm
            focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
          placeholder="Markdown形式で学習内容を記述...

## 学習目標
- 目標1
- 目標2

## 解説
ここに解説を記述..."
          {...register('content')}
        />
        <p className="mt-1 text-xs text-text-light">
          Markdown形式で記述できます
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          ハンズオン課題
        </label>
        <textarea
          className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
            transition-colors duration-200 min-h-[100px]
            focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
          placeholder="このチャプターで取り組む課題の説明を記述..."
          {...register('taskDescription')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="所要時間（分）"
          type="number"
          placeholder="10"
          error={errors.estimatedMinutes?.message}
          {...register('estimatedMinutes', { valueAsNumber: true })}
        />

        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
              {...register('isActive')}
            />
            <span className="text-sm font-medium text-text">有効にする</span>
          </label>
        </div>
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
