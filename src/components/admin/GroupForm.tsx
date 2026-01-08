import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, ModalFooter } from '@/components/ui'
import type { Group } from '@/types/database'

const groupSchema = z.object({
  name: z.string().min(1, 'グループ名を入力してください'),
  dailyTokenLimit: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(1000, '最小1,000トークン以上を設定してください')
    .max(10000000, '最大10,000,000トークンまで設定できます'),
})

type GroupFormData = z.infer<typeof groupSchema>

interface GroupFormProps {
  group?: Group | null
  onSubmit: (data: { name: string; dailyTokenLimit: number }) => Promise<void>
  onCancel: () => void
}

export function GroupForm({ group, onSubmit, onCancel }: GroupFormProps) {
  const isEditing = !!group

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GroupFormData>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: group?.name || '',
      dailyTokenLimit: group?.daily_token_limit || 100000,
    },
  })

  const handleFormSubmit = async (data: GroupFormData) => {
    await onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Input
        label="グループ名"
        placeholder="株式会社サンプル"
        error={errors.name?.message}
        {...register('name')}
      />

      <Input
        label="日次トークン上限"
        type="number"
        placeholder="100000"
        helperText="1日あたりの最大トークン使用量を設定します"
        error={errors.dailyTokenLimit?.message}
        {...register('dailyTokenLimit', { valueAsNumber: true })}
      />

      <div className="bg-gray-50 rounded-lg p-4 text-sm text-text-light">
        <p className="font-medium text-text mb-2">トークン上限の目安</p>
        <ul className="space-y-1">
          <li>• 50,000 - 軽い利用（1日10-20回程度の会話）</li>
          <li>• 100,000 - 標準的な利用（1日20-40回程度の会話）</li>
          <li>• 200,000 - 頻繁な利用（1日40-80回程度の会話）</li>
        </ul>
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
