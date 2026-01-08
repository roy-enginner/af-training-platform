import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, ModalFooter } from '@/components/ui'
import type { Department, Company } from '@/types/database'

const departmentSchema = z.object({
  name: z.string().min(1, '部署名を入力してください'),
  companyId: z.string().min(1, '企業を選択してください'),
  parentDepartmentId: z.string().optional(),
  sortOrder: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(0, '0以上の値を設定してください'),
  isActive: z.boolean(),
})

type DepartmentFormData = z.infer<typeof departmentSchema>

export interface DepartmentFormSubmitData {
  name: string
  companyId: string
  parentDepartmentId: string | null
  sortOrder: number
  isActive: boolean
}

interface DepartmentFormProps {
  department?: Department | null
  companies: Company[]
  departments: Department[] // For parent department selection
  onSubmit: (data: DepartmentFormSubmitData) => Promise<void>
  onCancel: () => void
}

export function DepartmentForm({ department, companies, departments, onSubmit, onCancel }: DepartmentFormProps) {
  const isEditing = !!department

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DepartmentFormData>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      name: department?.name || '',
      companyId: department?.company_id || '',
      parentDepartmentId: department?.parent_department_id || '',
      sortOrder: department?.sort_order ?? 0,
      isActive: department?.is_active ?? true,
    },
  })

  const selectedCompanyId = watch('companyId')

  // Filter parent departments to only show those from the same company
  const availableParentDepartments = departments.filter(
    (d) => d.company_id === selectedCompanyId && d.id !== department?.id
  )

  const handleFormSubmit = async (data: DepartmentFormData) => {
    await onSubmit({
      name: data.name,
      companyId: data.companyId,
      parentDepartmentId: data.parentDepartmentId || null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text mb-1">
          所属企業 <span className="text-error">*</span>
        </label>
        <select
          className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          {...register('companyId')}
        >
          <option value="">企業を選択してください</option>
          {companies.filter(c => c.is_active).map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
        {errors.companyId && (
          <p className="mt-1 text-sm text-error">{errors.companyId.message}</p>
        )}
      </div>

      <Input
        label="部署名"
        placeholder="営業部"
        error={errors.name?.message}
        {...register('name')}
      />

      <div>
        <label className="block text-sm font-medium text-text mb-1">
          親部署（オプション）
        </label>
        <select
          className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          {...register('parentDepartmentId')}
          disabled={!selectedCompanyId}
        >
          <option value="">なし（トップレベル）</option>
          {availableParentDepartments.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
        </select>
        {!selectedCompanyId && (
          <p className="mt-1 text-sm text-text-light">
            先に企業を選択してください
          </p>
        )}
      </div>

      <Input
        label="並び順"
        type="number"
        placeholder="0"
        helperText="数値が小さいほど上に表示されます"
        error={errors.sortOrder?.message}
        {...register('sortOrder', { valueAsNumber: true })}
      />

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="isActive"
          className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
          {...register('isActive')}
        />
        <label htmlFor="isActive" className="text-sm font-medium text-text">
          部署を有効にする
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
