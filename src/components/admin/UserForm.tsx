import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, ModalFooter } from '@/components/ui'
import type { ProfileWithGroup, Group } from '@/types/database'

const userSchema = z.object({
  name: z.string().min(1, '名前を入力してください'),
  email: z.string().email('有効なメールアドレスを入力してください').optional(),
  role: z.enum(['admin', 'trainee'], {
    required_error: '権限を選択してください',
  }),
  groupId: z.string().nullable(),
})

type UserFormData = z.infer<typeof userSchema>

interface UserFormProps {
  user?: ProfileWithGroup | null
  groups: Group[]
  onSubmit: (data: { name: string; email?: string; role: string; groupId: string | null }) => Promise<void>
  onCancel: () => void
}

export function UserForm({ user, groups, onSubmit, onCancel }: UserFormProps) {
  const isEditing = !!user

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: user?.name || '',
      role: user?.role || 'trainee',
      groupId: user?.group_id || null,
    },
  })

  const handleFormSubmit = async (data: UserFormData) => {
    await onSubmit({
      name: data.name,
      email: data.email,
      role: data.role,
      groupId: data.groupId || null,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Input
        label="名前"
        placeholder="山田 太郎"
        error={errors.name?.message}
        {...register('name')}
      />

      {!isEditing && (
        <Input
          label="メールアドレス"
          type="email"
          placeholder="email@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
      )}

      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          権限
        </label>
        <select
          className={`
            w-full px-4 py-2.5 border rounded-lg bg-white text-text
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-0
            ${
              errors.role
                ? 'border-error focus:ring-error/50 focus:border-error'
                : 'border-border focus:ring-primary/50 focus:border-primary'
            }
          `}
          {...register('role')}
        >
          <option value="trainee">研修生</option>
          <option value="admin">管理者</option>
        </select>
        {errors.role && (
          <p className="mt-1.5 text-sm text-error">{errors.role.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          所属グループ
        </label>
        <select
          className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
          {...register('groupId')}
        >
          <option value="">グループなし</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
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
