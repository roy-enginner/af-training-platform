import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, ModalFooter } from '@/components/ui'
import type { Group, Company, Department } from '@/types/database'

const groupSchema = z.object({
  name: z.string().min(1, 'グループ名を入力してください'),
  companyId: z.string().nullable(),
  departmentId: z.string().nullable(),
  dailyTokenLimit: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(1000, '最小1,000トークン以上を設定してください')
    .max(10000000, '最大10,000,000トークンまで設定できます'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  reviewPeriodDays: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(0, '0以上の値を設定してください')
    .max(365, '最大365日まで設定できます'),
  isActive: z.boolean(),
})

type GroupFormData = z.infer<typeof groupSchema>

export interface GroupFormSubmitData {
  name: string
  companyId: string | null
  departmentId: string | null
  dailyTokenLimit: number
  startDate: string | null
  endDate: string | null
  reviewPeriodDays: number
  isActive: boolean
}

interface GroupFormProps {
  group?: Group | null
  companies?: Company[]
  departments?: Department[]
  onSubmit: (data: GroupFormSubmitData) => Promise<void>
  onCancel: () => void
}

export function GroupForm({ group, companies = [], departments = [], onSubmit, onCancel }: GroupFormProps) {
  const isEditing = !!group

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<GroupFormData>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: group?.name || '',
      companyId: group?.company_id || null,
      departmentId: group?.department_id || null,
      dailyTokenLimit: group?.daily_token_limit || 100000,
      startDate: group?.start_date || '',
      endDate: group?.end_date || '',
      reviewPeriodDays: group?.review_period_days ?? 14,
      isActive: group?.is_active ?? true,
    },
  })

  // Watch company selection to filter departments
  const selectedCompanyId = useWatch({ control, name: 'companyId' })

  // Filter departments based on selected company
  const filteredDepartments = departments.filter(
    (d) => d.company_id === selectedCompanyId && d.is_active
  )

  const handleFormSubmit = async (data: GroupFormData) => {
    await onSubmit({
      name: data.name,
      companyId: data.companyId || null,
      departmentId: data.departmentId || null,
      dailyTokenLimit: data.dailyTokenLimit,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      reviewPeriodDays: data.reviewPeriodDays,
      isActive: data.isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Input
        label="グループ名"
        placeholder="2025年4月入社研修"
        error={errors.name?.message}
        {...register('name')}
      />

      {companies.length > 0 && (
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
              <option value="">企業なし（個人向け等）</option>
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
                <option value="">部署なし（企業全体）</option>
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

      <Input
        label="日次トークン上限"
        type="number"
        placeholder="100000"
        helperText="1日あたりの最大トークン使用量を設定します"
        error={errors.dailyTokenLimit?.message}
        {...register('dailyTokenLimit', { valueAsNumber: true })}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="研修開始日"
          type="date"
          error={errors.startDate?.message}
          {...register('startDate')}
        />
        <Input
          label="研修終了日"
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

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="isActive"
          className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
          {...register('isActive')}
        />
        <label htmlFor="isActive" className="text-sm font-medium text-text">
          グループを有効にする
        </label>
      </div>

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
