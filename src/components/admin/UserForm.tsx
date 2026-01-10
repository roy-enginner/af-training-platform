import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, ModalFooter } from '@/components/ui'
import type { ProfileWithRelations, Group, Company, Department, UserRole } from '@/types/database'
import { hasPermission } from '@/types/database'

const userSchema = z.object({
  name: z.string().min(1, '名前を入力してください'),
  email: z.string().email('有効なメールアドレスを入力してください').optional(),
  role: z.enum(['super_admin', 'group_admin', 'trainee'], {
    required_error: '権限を選択してください',
  }),
  companyId: z.string().nullable(),
  departmentId: z.string().nullable(),
  groupId: z.string().nullable(),
  isIndividual: z.boolean(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  reviewPeriodDays: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(0, '0以上の値を設定してください')
    .max(365, '最大365日まで設定できます'),
})

type UserFormData = z.infer<typeof userSchema>

export interface UserFormSubmitData {
  name: string
  email?: string
  role: string
  companyId: string | null
  departmentId: string | null
  groupId: string | null
  isIndividual: boolean
  startDate: string | null
  endDate: string | null
  reviewPeriodDays: number
}

interface UserFormProps {
  user?: ProfileWithRelations | null
  groups: Group[]
  companies?: Company[]
  departments?: Department[]
  currentUserRole?: UserRole | null
  defaultRole?: 'trainee' | 'group_admin' | 'super_admin'
  // デフォルト値（新規作成時にグループ等を事前選択）
  defaultCompanyId?: string | null
  defaultDepartmentId?: string | null
  defaultGroupId?: string | null
  onSubmit: (data: UserFormSubmitData) => Promise<void>
  onCancel: () => void
}

export function UserForm({
  user,
  groups,
  companies = [],
  departments = [],
  currentUserRole,
  defaultRole = 'trainee',
  defaultCompanyId = null,
  defaultDepartmentId = null,
  defaultGroupId = null,
  onSubmit,
  onCancel
}: UserFormProps) {
  const isEditing = !!user

  // Determine which roles can be assigned based on current user's role
  const canAssignAdminRole = currentUserRole ? hasPermission(currentUserRole, 'canAssignAdminRole') : false
  const canManageCompanies = currentUserRole ? hasPermission(currentUserRole, 'canManageCompanies') : false

  // Map old role values to new ones for backwards compatibility
  const getDefaultRole = (): 'super_admin' | 'group_admin' | 'trainee' => {
    if (!user?.role) return defaultRole
    if (user.role === 'super_admin' || user.role === 'group_admin' || user.role === 'trainee') {
      return user.role
    }
    return defaultRole
  }

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: user?.name || '',
      role: getDefaultRole(),
      companyId: user?.company_id || defaultCompanyId || null,
      departmentId: user?.department_id || defaultDepartmentId || null,
      groupId: user?.group_id || defaultGroupId || null,
      isIndividual: user?.is_individual ?? false,
      startDate: user?.start_date || '',
      endDate: user?.end_date || '',
      reviewPeriodDays: user?.review_period_days ?? 14,
    },
  })

  // Watch for company and department changes to filter options
  const selectedCompanyId = useWatch({ control, name: 'companyId' })
  const selectedDepartmentId = useWatch({ control, name: 'departmentId' })
  const isIndividual = useWatch({ control, name: 'isIndividual' })

  // Filter departments and groups based on selections
  const filteredDepartments = departments.filter(
    (d) => d.company_id === selectedCompanyId && d.is_active
  )
  const filteredGroups = groups.filter((g) => {
    if (selectedDepartmentId) {
      return g.department_id === selectedDepartmentId && g.is_active
    }
    if (selectedCompanyId) {
      return g.company_id === selectedCompanyId && g.is_active
    }
    return g.is_active
  })

  const handleFormSubmit = async (data: UserFormData) => {
    await onSubmit({
      name: data.name,
      email: data.email,
      role: data.role,
      companyId: data.companyId || null,
      departmentId: data.departmentId || null,
      groupId: data.isIndividual ? null : data.groupId || null,
      isIndividual: data.isIndividual,
      startDate: data.isIndividual ? (data.startDate || null) : null,
      endDate: data.isIndividual ? (data.endDate || null) : null,
      reviewPeriodDays: data.reviewPeriodDays,
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
          {canAssignAdminRole && (
            <>
              <option value="group_admin">グループ管理者</option>
              <option value="super_admin">スーパー管理者</option>
            </>
          )}
        </select>
        {errors.role && (
          <p className="mt-1.5 text-sm text-error">{errors.role.message}</p>
        )}
      </div>

      {/* Individual user toggle */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
        <input
          type="checkbox"
          id="isIndividual"
          className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
          {...register('isIndividual')}
        />
        <label htmlFor="isIndividual" className="text-sm font-medium text-text">
          個人ユーザー（グループに所属しない）
        </label>
      </div>

      {canManageCompanies && companies.length > 0 && (
        <>
          {/* Company selection */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              所属企業
            </label>
            <select
              className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
              {...register('companyId')}
            >
              <option value="">企業なし</option>
              {companies.filter(c => c.is_active).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {/* Department selection */}
          {selectedCompanyId && filteredDepartments.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                所属部署
              </label>
              <select
                className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                  transition-colors duration-200
                  focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
                {...register('departmentId')}
              >
                <option value="">部署なし</option>
                {filteredDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {/* Group selection - hidden for individual users */}
      {!isIndividual && (
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
            {filteredGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Individual user period settings */}
      {isIndividual && (
        <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg space-y-4">
          <p className="text-sm font-medium text-blue-700">
            個人ユーザーの期間設定
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="利用開始日"
              type="date"
              error={errors.startDate?.message}
              {...register('startDate')}
            />
            <Input
              label="利用終了日"
              type="date"
              error={errors.endDate?.message}
              {...register('endDate')}
            />
          </div>

          <Input
            label="復習期間（日数）"
            type="number"
            placeholder="14"
            helperText="研修実施日からこの日数は復習期間としてアクセスを許可します"
            error={errors.reviewPeriodDays?.message}
            {...register('reviewPeriodDays', { valueAsNumber: true })}
          />
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
