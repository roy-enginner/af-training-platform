import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, ModalFooter } from '@/components/ui'
import type { Company } from '@/types/database'

const companySchema = z.object({
  name: z.string().min(1, '企業名を入力してください'),
  dailyTokenLimit: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(1000, '最小1,000トークン以上を設定してください')
    .max(100000000, '最大100,000,000トークンまで設定できます'),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean(),
})

type CompanyFormData = z.infer<typeof companySchema>

export interface CompanyFormSubmitData {
  name: string
  dailyTokenLimit: number
  contractStartDate: string | null
  contractEndDate: string | null
  notes: string | null
  isActive: boolean
}

interface CompanyFormProps {
  company?: Company | null
  onSubmit: (data: CompanyFormSubmitData) => Promise<void>
  onCancel: () => void
}

export function CompanyForm({ company, onSubmit, onCancel }: CompanyFormProps) {
  const isEditing = !!company

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: company?.name || '',
      dailyTokenLimit: company?.daily_token_limit || 1000000,
      contractStartDate: company?.contract_start_date || '',
      contractEndDate: company?.contract_end_date || '',
      notes: company?.notes || '',
      isActive: company?.is_active ?? true,
    },
  })

  const handleFormSubmit = async (data: CompanyFormData) => {
    await onSubmit({
      name: data.name,
      dailyTokenLimit: data.dailyTokenLimit,
      contractStartDate: data.contractStartDate || null,
      contractEndDate: data.contractEndDate || null,
      notes: data.notes || null,
      isActive: data.isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Input
        label="企業名"
        placeholder="株式会社サンプル"
        error={errors.name?.message}
        {...register('name')}
      />

      <Input
        label="日次トークン上限（企業全体）"
        type="number"
        placeholder="1000000"
        helperText="この企業全体で1日あたり使用可能な最大トークン数"
        error={errors.dailyTokenLimit?.message}
        {...register('dailyTokenLimit', { valueAsNumber: true })}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="契約開始日"
          type="date"
          error={errors.contractStartDate?.message}
          {...register('contractStartDate')}
        />
        <Input
          label="契約終了日"
          type="date"
          error={errors.contractEndDate?.message}
          {...register('contractEndDate')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-1">
          備考
        </label>
        <textarea
          className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          rows={3}
          placeholder="担当者名、連絡先など"
          {...register('notes')}
        />
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="isActive"
          className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
          {...register('isActive')}
        />
        <label htmlFor="isActive" className="text-sm font-medium text-text">
          企業を有効にする
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
