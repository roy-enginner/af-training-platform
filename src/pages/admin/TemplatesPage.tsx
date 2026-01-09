import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  DocumentTextIcon,
  SparklesIcon,
  BeakerIcon,
  StarIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { CurriculumTemplate, TemplateType } from '@/types/database'
import { TemplateForm } from '@/components/admin/TemplateForm'

// テンプレートタイプのラベル
const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  structure: '構成',
  prompt: 'プロンプト',
  style: 'スタイル',
}

// テンプレートタイプのアイコン
const TEMPLATE_TYPE_ICONS: Record<TemplateType, React.ComponentType<{ className?: string }>> = {
  structure: DocumentTextIcon,
  prompt: SparklesIcon,
  style: BeakerIcon,
}

export function TemplatesPage() {
  const { role } = useAuth()
  const [templates, setTemplates] = useState<CurriculumTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<TemplateType | ''>('')
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<CurriculumTemplate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // テンプレート一覧を取得
  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data, error: fetchError } = await supabase
        .from('curriculum_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (fetchError) throw fetchError
      setTemplates(data || [])
    } catch (err) {
      console.error('Error fetching templates:', err)
      setError('テンプレートの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // 権限チェック
  if (role && !hasPermission(role, 'canManageCurriculum')) {
    return <Navigate to="/admin" replace />
  }

  // フィルタリング
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchesSearch =
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = !filterType || template.template_type === filterType
      return matchesSearch && matchesType
    })
  }, [templates, searchQuery, filterType])

  // テンプレート作成
  const handleCreateTemplate = async (data: Partial<CurriculumTemplate>) => {
    try {
      const { error: createError } = await supabase.from('curriculum_templates').insert({
        name: data.name,
        description: data.description,
        template_type: data.template_type,
        content: data.content,
        is_system: false,
        is_active: true,
        sort_order: templates.length,
      })

      if (createError) throw createError

      setSuccessMessage('テンプレートを作成しました')
      setIsFormModalOpen(false)
      fetchTemplates()
    } catch (err) {
      console.error('Error creating template:', err)
      setError('テンプレートの作成に失敗しました')
    }
  }

  // テンプレート更新
  const handleUpdateTemplate = async (data: Partial<CurriculumTemplate>) => {
    if (!selectedTemplate) return

    try {
      const { error: updateError } = await supabase
        .from('curriculum_templates')
        .update({
          name: data.name,
          description: data.description,
          template_type: data.template_type,
          content: data.content,
        })
        .eq('id', selectedTemplate.id)

      if (updateError) throw updateError

      setSuccessMessage('テンプレートを更新しました')
      setIsFormModalOpen(false)
      setSelectedTemplate(null)
      fetchTemplates()
    } catch (err) {
      console.error('Error updating template:', err)
      setError('テンプレートの更新に失敗しました')
    }
  }

  // テンプレート削除（論理削除）
  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return

    // システムテンプレートは削除不可
    if (selectedTemplate.is_system) {
      setError('システムテンプレートは削除できません')
      setIsDeleteModalOpen(false)
      return
    }

    try {
      const { error: deleteError } = await supabase
        .from('curriculum_templates')
        .update({ is_active: false })
        .eq('id', selectedTemplate.id)

      if (deleteError) throw deleteError

      setSuccessMessage('テンプレートを削除しました')
      setIsDeleteModalOpen(false)
      setSelectedTemplate(null)
      fetchTemplates()
    } catch (err) {
      console.error('Error deleting template:', err)
      setError('テンプレートの削除に失敗しました')
    }
  }

  // テンプレートコンテンツのプレビュー
  const getContentPreview = (template: CurriculumTemplate) => {
    const content = template.content as {
      depthLevel?: string
      exerciseRatio?: number
      exampleFrequency?: string
      toneStyle?: string
    }

    if (!content) return null

    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {content.depthLevel && (
          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
            深さ: {content.depthLevel === 'overview' ? '概要' : content.depthLevel === 'standard' ? '標準' : '深掘り'}
          </span>
        )}
        {content.exerciseRatio !== undefined && (
          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
            演習: {content.exerciseRatio}%
          </span>
        )}
        {content.exampleFrequency && (
          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
            例示: {content.exampleFrequency === 'minimal' ? '最小限' : content.exampleFrequency === 'moderate' ? '適度' : '豊富'}
          </span>
        )}
        {content.toneStyle && (
          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
            スタイル: {content.toneStyle === 'formal' ? 'フォーマル' : content.toneStyle === 'casual' ? 'カジュアル' : '技術的'}
          </span>
        )}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">テンプレート管理</h1>
          <p className="mt-1 text-sm text-text-light">
            カリキュラム生成用のテンプレートを管理します
          </p>
        </div>
        <Button onClick={() => {
          setSelectedTemplate(null)
          setIsFormModalOpen(true)
        }}>
          <PlusIcon className="h-5 w-5 mr-2" />
          テンプレート追加
        </Button>
      </div>

      {/* アラート */}
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

      {/* フィルター */}
      <Card>
        <div className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex-1">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-light" />
                <Input
                  type="text"
                  placeholder="テンプレート名、説明で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as TemplateType | '')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">すべてのタイプ</option>
                {Object.entries(TEMPLATE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* テンプレート一覧 */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="p-4">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-full mb-4" />
                <div className="h-8 bg-gray-200 rounded w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <DocumentTextIcon className="h-12 w-12 mx-auto text-text-light mb-4" />
            <p className="text-text-light">テンプレートがありません</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => {
            const Icon = TEMPLATE_TYPE_ICONS[template.template_type]
            return (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Card className="h-full hover:shadow-md transition-shadow">
                  <div className="p-4">
                    {/* ヘッダー */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-text">{template.name}</h3>
                            {template.is_system && (
                              <StarIcon className="h-4 w-4 text-warning" title="システムテンプレート" />
                            )}
                          </div>
                          <Badge variant="primary" size="sm">
                            {TEMPLATE_TYPE_LABELS[template.template_type]}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* 説明 */}
                    {template.description && (
                      <p className="mt-3 text-sm text-text-light line-clamp-2">
                        {template.description}
                      </p>
                    )}

                    {/* コンテンツプレビュー */}
                    {getContentPreview(template)}

                    {/* アクション */}
                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedTemplate(template)
                          setIsFormModalOpen(true)
                        }}
                      >
                        <PencilIcon className="h-4 w-4 mr-1" />
                        編集
                      </Button>
                      {!template.is_system && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedTemplate(template)
                            setIsDeleteModalOpen(true)
                          }}
                        >
                          <TrashIcon className="h-4 w-4 text-error" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* フォームモーダル */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setSelectedTemplate(null)
        }}
        title={selectedTemplate ? 'テンプレート編集' : 'テンプレート追加'}
        size="lg"
      >
        <TemplateForm
          template={selectedTemplate}
          onSubmit={selectedTemplate ? handleUpdateTemplate : handleCreateTemplate}
          onCancel={() => {
            setIsFormModalOpen(false)
            setSelectedTemplate(null)
          }}
        />
      </Modal>

      {/* 削除確認モーダル */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedTemplate(null)
        }}
        title="テンプレートの削除"
      >
        <p className="text-text-light">
          「{selectedTemplate?.name}」を削除してもよろしいですか？
          <br />
          この操作は取り消せません。
        </p>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setSelectedTemplate(null)
            }}
          >
            キャンセル
          </Button>
          <Button variant="danger" onClick={handleDeleteTemplate}>
            削除
          </Button>
        </ModalFooter>
      </Modal>
    </motion.div>
  )
}
