import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Button, Input, ModalFooter } from '@/components/ui'
import type { AttributeDefinition, AttributeType } from '@/types/database'

const attributeDefinitionSchema = z.object({
  key: z
    .string()
    .min(1, 'キーを入力してください')
    .max(50, 'キーは50文字以内で入力してください')
    .regex(/^[a-z][a-z0-9_]*$/, 'キーは英小文字で始まり、英小文字・数字・アンダースコアのみ使用可'),
  label: z.string().min(1, 'ラベルを入力してください').max(100, 'ラベルは100文字以内で入力してください'),
  attributeType: z.enum(['text', 'select', 'number', 'date'] as const),
  sortOrder: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(0, '0以上の値を設定してください')
    .max(9999, '最大9999まで設定できます'),
  isActive: z.boolean(),
})

type AttributeDefinitionFormData = z.infer<typeof attributeDefinitionSchema>

export interface AttributeDefinitionFormSubmitData {
  key: string
  label: string
  attributeType: AttributeType
  options: string[] | null
  sortOrder: number
  isActive: boolean
}

interface AttributeDefinitionFormProps {
  definition?: AttributeDefinition | null
  existingKeys?: string[]
  onSubmit: (data: AttributeDefinitionFormSubmitData) => Promise<void>
  onCancel: () => void
}

const ATTRIBUTE_TYPE_LABELS: Record<AttributeType, string> = {
  text: 'テキスト',
  select: '選択肢',
  number: '数値',
  date: '日付',
}

export function AttributeDefinitionForm({
  definition,
  existingKeys = [],
  onSubmit,
  onCancel,
}: AttributeDefinitionFormProps) {
  const isEditing = !!definition
  const [options, setOptions] = useState<string[]>(definition?.options || [])
  const [newOption, setNewOption] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<AttributeDefinitionFormData>({
    resolver: zodResolver(attributeDefinitionSchema),
    defaultValues: {
      key: definition?.key || '',
      label: definition?.label || '',
      attributeType: definition?.attribute_type || 'text',
      sortOrder: definition?.sort_order ?? 0,
      isActive: definition?.is_active ?? true,
    },
  })

  const attributeType = watch('attributeType')

  // Reset options when type changes away from select
  useEffect(() => {
    if (attributeType !== 'select') {
      setOptions([])
    }
  }, [attributeType])

  const handleAddOption = () => {
    const trimmed = newOption.trim()
    if (trimmed && !options.includes(trimmed)) {
      setOptions([...options, trimmed])
      setNewOption('')
    }
  }

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index))
  }

  const handleFormSubmit = async (data: AttributeDefinitionFormData) => {
    // Check for duplicate key (only when creating or changing key)
    if (!isEditing || data.key !== definition?.key) {
      if (existingKeys.includes(data.key)) {
        setError('key', { message: 'このキーは既に使用されています' })
        return
      }
    }

    // Validate options for select type
    if (data.attributeType === 'select' && options.length < 2) {
      setError('attributeType', { message: '選択肢タイプは2つ以上の選択肢が必要です' })
      return
    }

    await onSubmit({
      key: data.key,
      label: data.label,
      attributeType: data.attributeType,
      options: data.attributeType === 'select' ? options : null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="キー"
          placeholder="position"
          helperText="英小文字・数字・アンダースコアのみ（例: skill_level）"
          error={errors.key?.message}
          disabled={isEditing}
          {...register('key')}
        />

        <Input
          label="表示ラベル"
          placeholder="役職"
          error={errors.label?.message}
          {...register('label')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            データタイプ
          </label>
          <select
            className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary
              disabled:bg-gray-100 disabled:cursor-not-allowed"
            disabled={isEditing}
            {...register('attributeType')}
          >
            {(Object.keys(ATTRIBUTE_TYPE_LABELS) as AttributeType[]).map((type) => (
              <option key={type} value={type}>
                {ATTRIBUTE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          {errors.attributeType && (
            <p className="mt-1 text-sm text-error">{errors.attributeType.message}</p>
          )}
          {isEditing && (
            <p className="mt-1 text-xs text-text-light">
              データタイプは変更できません
            </p>
          )}
        </div>

        <Input
          label="並び順"
          type="number"
          placeholder="0"
          helperText="小さい数字が先に表示されます"
          error={errors.sortOrder?.message}
          {...register('sortOrder', { valueAsNumber: true })}
        />
      </div>

      {/* Options for select type */}
      {attributeType === 'select' && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-text">
            選択肢 <span className="text-error">*</span>
          </label>

          {/* Current options */}
          {options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {options.map((option, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary-light text-primary rounded-full text-sm"
                >
                  {option}
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(index)}
                    className="p-0.5 hover:bg-primary/20 rounded-full transition-colors"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add new option */}
          <div className="flex gap-2">
            <Input
              placeholder="新しい選択肢を入力"
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddOption()
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleAddOption}
              disabled={!newOption.trim()}
            >
              <PlusIcon className="w-5 h-5" />
            </Button>
          </div>

          {options.length < 2 && (
            <p className="text-sm text-text-light">
              2つ以上の選択肢を追加してください
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="isActive"
          className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
          {...register('isActive')}
        />
        <label htmlFor="isActive" className="text-sm font-medium text-text">
          この属性を有効にする
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
