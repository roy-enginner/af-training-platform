import { useState, useEffect, useCallback } from 'react'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ClockIcon,
  DocumentTextIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { Button, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ChapterForm, type ChapterFormSubmitData } from './ChapterForm'
import type { Chapter, DepthLevel, ExampleFrequency, ToneStyle } from '@/types/database'
import { useAuth } from '@/hooks/useAuth'

interface ChapterManagerProps {
  curriculumId: string
  curriculumName?: string
  onChaptersChange?: () => void
}

// 再生成オプションのラベル
const DEPTH_LABELS: Record<DepthLevel, string> = {
  overview: '概要 - 要点を簡潔に',
  standard: '標準 - バランスの取れた詳細度',
  deep: '深掘り - 詳細な解説と背景知識',
}

const EXAMPLE_LABELS: Record<ExampleFrequency, string> = {
  minimal: '最小限',
  moderate: '適度',
  abundant: '豊富',
}

const TONE_LABELS: Record<ToneStyle, string> = {
  formal: 'フォーマル',
  casual: 'カジュアル',
  technical: '技術的',
}

interface RegenerateOptions {
  depthLevel: DepthLevel
  exerciseRatio: number
  exampleFrequency: ExampleFrequency
  toneStyle: ToneStyle
}

export function ChapterManager({ curriculumId, onChaptersChange }: ChapterManagerProps) {
  const { session } = useAuth()
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null)
  const [regenerateInstructions, setRegenerateInstructions] = useState('')
  const [regenerateOptions, setRegenerateOptions] = useState<RegenerateOptions>({
    depthLevel: 'standard',
    exerciseRatio: 30,
    exampleFrequency: 'moderate',
    toneStyle: 'formal',
  })
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Fetch chapters
  const fetchChapters = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data, error: fetchError } = await supabase
        .from('chapters')
        .select('*')
        .eq('curriculum_id', curriculumId)
        .order('sort_order')

      if (fetchError) throw fetchError

      setChapters(data || [])
    } catch (err) {
      console.error('Error fetching chapters:', err)
      setError('チャプターの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [curriculumId])

  useEffect(() => {
    fetchChapters()
  }, [fetchChapters])

  // Handle chapter creation
  const handleCreateChapter = async (data: ChapterFormSubmitData) => {
    try {
      const { error: createError } = await supabase.from('chapters').insert({
        curriculum_id: curriculumId,
        title: data.title,
        content: data.content,
        task_description: data.taskDescription,
        estimated_minutes: data.estimatedMinutes,
        sort_order: chapters.length,
        is_active: data.isActive,
      })

      if (createError) throw createError

      setSuccessMessage('チャプターを追加しました')
      setIsFormModalOpen(false)
      fetchChapters()
      onChaptersChange?.()
    } catch (err) {
      console.error('Error creating chapter:', err)
      setError('チャプターの作成に失敗しました')
    }
  }

  // Handle chapter update
  const handleUpdateChapter = async (data: ChapterFormSubmitData) => {
    if (!selectedChapter) return

    try {
      const { error: updateError } = await supabase
        .from('chapters')
        .update({
          title: data.title,
          content: data.content,
          task_description: data.taskDescription,
          estimated_minutes: data.estimatedMinutes,
          is_active: data.isActive,
        })
        .eq('id', selectedChapter.id)

      if (updateError) throw updateError

      setSuccessMessage('チャプターを更新しました')
      setIsFormModalOpen(false)
      setSelectedChapter(null)
      fetchChapters()
      onChaptersChange?.()
    } catch (err) {
      console.error('Error updating chapter:', err)
      setError('チャプターの更新に失敗しました')
    }
  }

  // Handle chapter deletion
  const handleDeleteChapter = async () => {
    if (!selectedChapter) return

    try {
      const { error: deleteError } = await supabase
        .from('chapters')
        .delete()
        .eq('id', selectedChapter.id)

      if (deleteError) throw deleteError

      // Reorder remaining chapters
      const remainingChapters = chapters.filter((c) => c.id !== selectedChapter.id)
      for (let i = 0; i < remainingChapters.length; i++) {
        await supabase
          .from('chapters')
          .update({ sort_order: i })
          .eq('id', remainingChapters[i].id)
      }

      setSuccessMessage('チャプターを削除しました')
      setIsDeleteModalOpen(false)
      setSelectedChapter(null)
      fetchChapters()
      onChaptersChange?.()
    } catch (err) {
      console.error('Error deleting chapter:', err)
      setError('チャプターの削除に失敗しました')
    }
  }

  // Handle move up/down
  const handleMoveChapter = async (chapterId: string, direction: 'up' | 'down') => {
    const currentIndex = chapters.findIndex((c) => c.id === chapterId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= chapters.length) return

    try {
      // Swap sort_order
      const currentChapter = chapters[currentIndex]
      const swapChapter = chapters[newIndex]

      await Promise.all([
        supabase
          .from('chapters')
          .update({ sort_order: newIndex })
          .eq('id', currentChapter.id),
        supabase
          .from('chapters')
          .update({ sort_order: currentIndex })
          .eq('id', swapChapter.id),
      ])

      fetchChapters()
    } catch (err) {
      console.error('Error moving chapter:', err)
      setError('チャプターの並び替えに失敗しました')
    }
  }

  // Handle chapter regeneration
  const handleRegenerateChapter = async () => {
    if (!selectedChapter || !session?.access_token) return

    try {
      setIsRegenerating(true)
      setError(null)

      const response = await fetch('/.netlify/functions/regenerate-chapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          chapterId: selectedChapter.id,
          instructions: regenerateInstructions || undefined,
          options: regenerateOptions,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'チャプターの再生成に失敗しました')
      }

      setSuccessMessage(`チャプター「${selectedChapter.title}」を再生成しました`)
      setIsRegenerateModalOpen(false)
      setSelectedChapter(null)
      setRegenerateInstructions('')
      fetchChapters()
      onChaptersChange?.()
    } catch (err) {
      console.error('Error regenerating chapter:', err)
      setError(err instanceof Error ? err.message : 'チャプターの再生成に失敗しました')
    } finally {
      setIsRegenerating(false)
    }
  }

  // Calculate total duration
  const totalMinutes = chapters.reduce((sum, ch) => sum + ch.estimated_minutes, 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-text">
            チャプター構成（{chapters.length}章）
          </h3>
          <p className="text-sm text-text-light">
            合計所要時間: 約{totalMinutes}分
          </p>
        </div>
        <Button
          size="sm"
          leftIcon={<PlusIcon className="w-4 h-4" />}
          onClick={() => {
            setSelectedChapter(null)
            setIsFormModalOpen(true)
          }}
        >
          チャプター追加
        </Button>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert variant="success" onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {/* Chapters list */}
      {isLoading ? (
        <div className="text-center py-8 text-text-light">読み込み中...</div>
      ) : chapters.length === 0 ? (
        <div className="text-center py-8 text-text-light bg-gray-50 rounded-lg border-2 border-dashed border-border">
          <DocumentTextIcon className="w-12 h-12 mx-auto text-text-light/50 mb-2" />
          <p>チャプターがありません</p>
          <p className="text-sm mt-1">「チャプター追加」ボタンから追加してください</p>
        </div>
      ) : (
        <div className="space-y-2">
          {chapters.map((chapter, index) => (
            <div
              key={chapter.id}
              className={`flex items-center gap-3 p-4 bg-white border rounded-lg transition-colors
                ${chapter.is_active ? 'border-border' : 'border-border bg-gray-50 opacity-60'}`}
            >
              {/* Chapter number */}
              <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-primary text-white text-sm font-medium rounded-full">
                {index + 1}
              </div>

              {/* Chapter info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text truncate">{chapter.title}</span>
                  {!chapter.is_active && (
                    <Badge variant="default" size="sm">無効</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm text-text-light">
                  <span className="flex items-center gap-1">
                    <ClockIcon className="w-3.5 h-3.5" />
                    {chapter.estimated_minutes}分
                  </span>
                  {chapter.content && (
                    <span className="flex items-center gap-1">
                      <DocumentTextIcon className="w-3.5 h-3.5" />
                      コンテンツあり
                    </span>
                  )}
                  {chapter.task_description && (
                    <Badge variant="warning" size="sm">課題あり</Badge>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleMoveChapter(chapter.id, 'up')}
                  disabled={index === 0}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="上へ移動"
                >
                  <ChevronUpIcon className="w-4 h-4 text-text-light" />
                </button>
                <button
                  onClick={() => handleMoveChapter(chapter.id, 'down')}
                  disabled={index === chapters.length - 1}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="下へ移動"
                >
                  <ChevronDownIcon className="w-4 h-4 text-text-light" />
                </button>
                <button
                  onClick={() => {
                    setSelectedChapter(chapter)
                    setIsRegenerateModalOpen(true)
                  }}
                  className="p-1.5 rounded hover:bg-primary-light transition-colors"
                  title="AIで再生成"
                >
                  <ArrowPathIcon className="w-4 h-4 text-primary" />
                </button>
                <button
                  onClick={() => {
                    setSelectedChapter(chapter)
                    setIsFormModalOpen(true)
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                  title="編集"
                >
                  <PencilIcon className="w-4 h-4 text-text-light" />
                </button>
                <button
                  onClick={() => {
                    setSelectedChapter(chapter)
                    setIsDeleteModalOpen(true)
                  }}
                  className="p-1.5 rounded hover:bg-red-50 transition-colors"
                  title="削除"
                >
                  <TrashIcon className="w-4 h-4 text-error" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chapter form modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setSelectedChapter(null)
        }}
        title={selectedChapter ? 'チャプター編集' : 'チャプター追加'}
        size="lg"
      >
        <ChapterForm
          chapter={selectedChapter}
          onSubmit={selectedChapter ? handleUpdateChapter : handleCreateChapter}
          onCancel={() => {
            setIsFormModalOpen(false)
            setSelectedChapter(null)
          }}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedChapter(null)
        }}
        title="チャプター削除の確認"
        size="sm"
      >
        <p className="text-text">
          チャプター「<span className="font-semibold">{selectedChapter?.title}</span>」
          を削除してもよろしいですか？
        </p>
        <p className="text-sm text-text-light mt-2">
          この操作は取り消せません。
        </p>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setSelectedChapter(null)
            }}
          >
            キャンセル
          </Button>
          <Button variant="danger" onClick={handleDeleteChapter}>
            削除する
          </Button>
        </ModalFooter>
      </Modal>

      {/* Regenerate modal */}
      <Modal
        isOpen={isRegenerateModalOpen}
        onClose={() => {
          setIsRegenerateModalOpen(false)
          setSelectedChapter(null)
          setRegenerateInstructions('')
        }}
        title="チャプターのAI再生成"
        size="lg"
      >
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-text-light mb-1">再生成対象</p>
            <p className="font-medium text-text">{selectedChapter?.title}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              再生成の指示（任意）
            </label>
            <textarea
              className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                transition-colors duration-200 min-h-[100px]
                focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
              placeholder="例：もっと具体例を増やす、難易度を下げる、演習を追加する..."
              value={regenerateInstructions}
              onChange={(e) => setRegenerateInstructions(e.target.value)}
            />
            <p className="mt-1 text-xs text-text-light">
              AIへの追加指示を入力できます。空白の場合は品質向上のための再生成を行います。
            </p>
          </div>

          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-text">生成オプション</h4>

            {/* 内容の深さ */}
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                内容の深さ
              </label>
              <select
                className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                  transition-colors duration-200
                  focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
                value={regenerateOptions.depthLevel}
                onChange={(e) => setRegenerateOptions(prev => ({
                  ...prev,
                  depthLevel: e.target.value as DepthLevel,
                }))}
              >
                {(Object.keys(DEPTH_LABELS) as DepthLevel[]).map((level) => (
                  <option key={level} value={level}>
                    {DEPTH_LABELS[level]}
                  </option>
                ))}
              </select>
            </div>

            {/* 演習の比率 */}
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                演習の比率: {regenerateOptions.exerciseRatio}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                value={regenerateOptions.exerciseRatio}
                onChange={(e) => setRegenerateOptions(prev => ({
                  ...prev,
                  exerciseRatio: Number(e.target.value),
                }))}
              />
              <div className="flex justify-between text-xs text-text-light mt-1">
                <span>解説重視</span>
                <span>演習重視</span>
              </div>
            </div>

            {/* 例示の量 */}
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                例示の量
              </label>
              <select
                className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                  transition-colors duration-200
                  focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
                value={regenerateOptions.exampleFrequency}
                onChange={(e) => setRegenerateOptions(prev => ({
                  ...prev,
                  exampleFrequency: e.target.value as ExampleFrequency,
                }))}
              >
                {(Object.keys(EXAMPLE_LABELS) as ExampleFrequency[]).map((freq) => (
                  <option key={freq} value={freq}>
                    {EXAMPLE_LABELS[freq]}
                  </option>
                ))}
              </select>
            </div>

            {/* 言語スタイル */}
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                言語スタイル
              </label>
              <select
                className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                  transition-colors duration-200
                  focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
                value={regenerateOptions.toneStyle}
                onChange={(e) => setRegenerateOptions(prev => ({
                  ...prev,
                  toneStyle: e.target.value as ToneStyle,
                }))}
              >
                {(Object.keys(TONE_LABELS) as ToneStyle[]).map((style) => (
                  <option key={style} value={style}>
                    {TONE_LABELS[style]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Alert variant="warning">
            再生成を実行すると、現在のチャプターコンテンツは上書きされます。
          </Alert>
        </div>

        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsRegenerateModalOpen(false)
              setSelectedChapter(null)
              setRegenerateInstructions('')
            }}
            disabled={isRegenerating}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleRegenerateChapter}
            isLoading={isRegenerating}
            leftIcon={<ArrowPathIcon className="w-4 h-4" />}
          >
            再生成する
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
