import { useEffect, useState } from 'react'
import { Input } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { AttributeDefinition, UserAttribute } from '@/types/database'

interface UserAttributesFormProps {
  profileId?: string
  onChange: (attributes: Record<string, string>) => void
  initialValues?: Record<string, string>
}

export function UserAttributesForm({
  profileId,
  onChange,
  initialValues = {},
}: UserAttributesFormProps) {
  const [definitions, setDefinitions] = useState<AttributeDefinition[]>([])
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch attribute definitions
  useEffect(() => {
    const fetchDefinitions = async () => {
      try {
        const { data, error } = await supabase
          .from('attribute_definitions')
          .select('*')
          .eq('is_active', true)
          .order('sort_order')

        if (error) throw error
        setDefinitions(data || [])
      } catch (err) {
        console.error('Error fetching attribute definitions:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDefinitions()
  }, [])

  // Fetch existing user attributes if editing
  useEffect(() => {
    if (!profileId) return

    const fetchUserAttributes = async () => {
      try {
        const { data, error } = await supabase
          .from('user_attributes')
          .select('*')
          .eq('profile_id', profileId)

        if (error) throw error

        const existingValues: Record<string, string> = {}
        ;(data || []).forEach((attr: UserAttribute) => {
          existingValues[attr.attribute_key] = attr.attribute_value
        })

        setValues((prev) => ({ ...prev, ...existingValues }))
      } catch (err) {
        console.error('Error fetching user attributes:', err)
      }
    }

    fetchUserAttributes()
  }, [profileId])

  // Update values and notify parent
  const handleValueChange = (key: string, value: string) => {
    const newValues = { ...values, [key]: value }
    setValues(newValues)
    onChange(newValues)
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="h-10 bg-gray-200 rounded-lg" />
        ))}
      </div>
    )
  }

  if (definitions.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-text mb-3">追加属性</h3>
        <div className="space-y-4">
          {definitions.map((def) => (
            <AttributeField
              key={def.id}
              definition={def}
              value={values[def.key] || ''}
              onChange={(value) => handleValueChange(def.key, value)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface AttributeFieldProps {
  definition: AttributeDefinition
  value: string
  onChange: (value: string) => void
}

function AttributeField({ definition, value, onChange }: AttributeFieldProps) {
  switch (definition.attribute_type) {
    case 'select':
      return (
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            {definition.label}
          </label>
          <select
            className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">選択してください</option>
            {definition.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      )

    case 'number':
      return (
        <Input
          label={definition.label}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'date':
      return (
        <Input
          label={definition.label}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'text':
    default:
      return (
        <Input
          label={definition.label}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

// Helper function to save user attributes
export async function saveUserAttributes(
  profileId: string,
  attributes: Record<string, string>
): Promise<void> {
  // Filter out empty values
  const nonEmptyAttributes = Object.entries(attributes).filter(
    ([_, value]) => value && value.trim() !== ''
  )

  if (nonEmptyAttributes.length === 0) {
    // Delete all existing attributes for this user if all values are empty
    await supabase.from('user_attributes').delete().eq('profile_id', profileId)
    return
  }

  // Use upsert to update existing or insert new
  for (const [key, value] of nonEmptyAttributes) {
    const { error } = await supabase.from('user_attributes').upsert(
      {
        profile_id: profileId,
        attribute_key: key,
        attribute_value: value,
      },
      {
        onConflict: 'profile_id,attribute_key',
      }
    )

    if (error) {
      console.error(`Error saving attribute ${key}:`, error)
      throw error
    }
  }

  // Delete attributes that are now empty
  const keysToKeep = nonEmptyAttributes.map(([key]) => key)
  const allKeys = Object.keys(attributes)
  const keysToDelete = allKeys.filter((key) => !keysToKeep.includes(key))

  if (keysToDelete.length > 0) {
    for (const key of keysToDelete) {
      await supabase
        .from('user_attributes')
        .delete()
        .eq('profile_id', profileId)
        .eq('attribute_key', key)
    }
  }
}
