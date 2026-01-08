import { useState } from 'react'
import { PlusIcon, TrashIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { Button, Input, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { GroupTrainingDate } from '@/types/database'

interface TrainingDatesManagerProps {
  groupId: string
  trainingDates: GroupTrainingDate[]
  onUpdate: () => void
}

export function TrainingDatesManager({
  groupId,
  trainingDates,
  onUpdate,
}: TrainingDatesManagerProps) {
  const [newDate, setNewDate] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddDate = async () => {
    if (!newDate) {
      setError('日付を選択してください')
      return
    }

    setIsAdding(true)
    setError(null)

    try {
      const { error: insertError } = await supabase
        .from('group_training_dates')
        .insert({
          group_id: groupId,
          training_date: newDate,
          description: newDescription || null,
        })

      if (insertError) {
        if (insertError.code === '23505') {
          setError('この日付は既に登録されています')
        } else {
          throw insertError
        }
        return
      }

      setNewDate('')
      setNewDescription('')
      onUpdate()
    } catch (err) {
      console.error('Error adding training date:', err)
      setError('研修日の追加に失敗しました')
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteDate = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('group_training_dates')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      onUpdate()
    } catch (err) {
      console.error('Error deleting training date:', err)
      setError('研修日の削除に失敗しました')
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    })
  }

  const sortedDates = [...trainingDates].sort(
    (a, b) => new Date(a.training_date).getTime() - new Date(b.training_date).getTime()
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-text">
        <CalendarIcon className="w-4 h-4" />
        <span>研修実施日</span>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Add new date */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            placeholder="日付を選択"
          />
        </div>
        <div className="flex-1">
          <Input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="説明（任意）"
          />
        </div>
        <Button
          size="sm"
          onClick={handleAddDate}
          isLoading={isAdding}
          leftIcon={<PlusIcon className="w-4 h-4" />}
        >
          追加
        </Button>
      </div>

      {/* Training dates list */}
      <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
        {sortedDates.length === 0 ? (
          <div className="p-4 text-center text-text-light text-sm">
            研修日が登録されていません
          </div>
        ) : (
          sortedDates.map((td) => (
            <div key={td.id} className="flex items-center justify-between p-3">
              <div>
                <div className="text-sm font-medium text-text">
                  {formatDate(td.training_date)}
                </div>
                {td.description && (
                  <div className="text-xs text-text-light">{td.description}</div>
                )}
              </div>
              <button
                onClick={() => handleDeleteDate(td.id)}
                className="p-1 rounded hover:bg-red-50 transition-colors"
                title="削除"
              >
                <TrashIcon className="w-4 h-4 text-error" />
              </button>
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-text-light">
        研修実施日から復習期間の間はアクセスが許可されます
      </p>
    </div>
  )
}
