import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  TableCellsIcon,
  DocumentIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { SourceMaterial, MaterialType, ExtractionStatus } from '@/types/database'
import { MaterialUploadForm } from '@/components/admin/MaterialUploadForm'

// 資料タイプのラベル
const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  pdf: 'PDF',
  url: 'URL',
  text: 'テキスト',
  markdown: 'Markdown',
  excel: 'Excel',
}

// 資料タイプのアイコン
const MATERIAL_TYPE_ICONS: Record<MaterialType, React.ComponentType<{ className?: string }>> = {
  pdf: DocumentTextIcon,
  url: GlobeAltIcon,
  text: DocumentIcon,
  markdown: DocumentIcon,
  excel: TableCellsIcon,
}

// 抽出ステータスの表示
const EXTRACTION_STATUS_CONFIG: Record<ExtractionStatus, {
  label: string
  color: 'primary' | 'success' | 'warning' | 'error'
  icon: React.ComponentType<{ className?: string }>
}> = {
  pending: { label: '待機中', color: 'primary', icon: ClockIcon },
  processing: { label: '処理中', color: 'warning', icon: ArrowPathIcon },
  completed: { label: '完了', color: 'success', icon: CheckCircleIcon },
  failed: { label: '失敗', color: 'error', icon: ExclamationCircleIcon },
}

export function MaterialsPage() {
  const { role, session } = useAuth()
  const [materials, setMaterials] = useState<SourceMaterial[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<MaterialType | ''>('')
  const [filterStatus, setFilterStatus] = useState<ExtractionStatus | ''>('')
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<SourceMaterial | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isExtracting, setIsExtracting] = useState<string | null>(null)

  // 資料一覧を取得
  const fetchMaterials = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data, error: fetchError } = await supabase
        .from('source_materials')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setMaterials(data || [])
    } catch (err) {
      console.error('Error fetching materials:', err)
      setError('資料の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMaterials()
  }, [fetchMaterials])

  // 権限チェック
  if (role && !hasPermission(role, 'canManageCurriculum')) {
    return <Navigate to="/admin" replace />
  }

  // フィルタリング
  const filteredMaterials = useMemo(() => {
    return materials.filter((material) => {
      const matchesSearch =
        material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        material.original_filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        material.original_url?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        material.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      const matchesType = !filterType || material.material_type === filterType
      const matchesStatus = !filterStatus || material.extraction_status === filterStatus
      return matchesSearch && matchesType && matchesStatus
    })
  }, [materials, searchQuery, filterType, filterStatus])

  // テキスト抽出を実行
  const handleExtract = async (material: SourceMaterial) => {
    if (!session?.access_token) return

    setIsExtracting(material.id)
    setError(null)

    try {
      // URLの場合は fetch-url-content、それ以外は extract-text を呼ぶ
      const endpoint = material.material_type === 'url'
        ? '/.netlify/functions/fetch-url-content'
        : '/.netlify/functions/extract-text'

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ materialId: material.id }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '抽出に失敗しました')
      }

      setSuccessMessage('テキスト抽出が完了しました')
      await fetchMaterials()
    } catch (err) {
      console.error('Extraction error:', err)
      setError(err instanceof Error ? err.message : '抽出中にエラーが発生しました')
    } finally {
      setIsExtracting(null)
    }
  }

  // 資料を削除（論理削除）
  const handleDelete = async () => {
    if (!selectedMaterial) return

    try {
      const { error: deleteError } = await supabase
        .from('source_materials')
        .update({ is_active: false })
        .eq('id', selectedMaterial.id)

      if (deleteError) throw deleteError

      setSuccessMessage('資料を削除しました')
      setIsDeleteModalOpen(false)
      setSelectedMaterial(null)
      await fetchMaterials()
    } catch (err) {
      console.error('Delete error:', err)
      setError('削除に失敗しました')
    }
  }

  // アップロード成功時
  const handleUploadSuccess = async () => {
    setIsUploadModalOpen(false)
    setSuccessMessage('資料をアップロードしました')
    await fetchMaterials()
  }

  // ファイルサイズをフォーマット
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 日時をフォーマット
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
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
          <h1 className="text-2xl font-bold text-text">資料管理</h1>
          <p className="mt-1 text-sm text-text-light">
            カリキュラム生成に使用する資料を管理します
          </p>
        </div>
        <Button onClick={() => setIsUploadModalOpen(true)}>
          <PlusIcon className="h-5 w-5 mr-2" />
          資料をアップロード
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
                  placeholder="資料名、ファイル名、URLで検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as MaterialType | '')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">すべてのタイプ</option>
                {Object.entries(MATERIAL_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as ExtractionStatus | '')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">すべてのステータス</option>
                {Object.entries(EXTRACTION_STATUS_CONFIG).map(([value, config]) => (
                  <option key={value} value={value}>{config.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* 資料一覧 */}
      <Card>
        <Table
          columns={[
            {
              key: 'name',
              header: '資料名',
              render: (material: SourceMaterial) => {
                const Icon = MATERIAL_TYPE_ICONS[material.material_type]
                return (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium text-text">{material.name}</div>
                      <div className="text-sm text-text-light">
                        {material.original_filename || material.original_url || MATERIAL_TYPE_LABELS[material.material_type]}
                      </div>
                    </div>
                  </div>
                )
              },
            },
            {
              key: 'type',
              header: 'タイプ',
              render: (material: SourceMaterial) => (
                <Badge variant="primary">{MATERIAL_TYPE_LABELS[material.material_type]}</Badge>
              ),
            },
            {
              key: 'size',
              header: 'サイズ',
              render: (material: SourceMaterial) => (
                <span className="text-sm text-text-light">
                  {formatFileSize(material.file_size_bytes)}
                </span>
              ),
            },
            {
              key: 'status',
              header: '抽出状態',
              render: (material: SourceMaterial) => {
                const config = EXTRACTION_STATUS_CONFIG[material.extraction_status]
                const Icon = config.icon
                return (
                  <div className="flex items-center gap-2">
                    <Badge variant={config.color}>
                      <Icon className={`h-4 w-4 mr-1 ${material.extraction_status === 'processing' ? 'animate-spin' : ''}`} />
                      {config.label}
                    </Badge>
                    {material.extraction_error && (
                      <span className="text-xs text-error truncate max-w-[100px]" title={material.extraction_error}>
                        {material.extraction_error}
                      </span>
                    )}
                  </div>
                )
              },
            },
            {
              key: 'created_at',
              header: '登録日時',
              render: (material: SourceMaterial) => (
                <span className="text-sm text-text-light">
                  {formatDate(material.created_at)}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '操作',
              render: (material: SourceMaterial) => (
                <div className="flex items-center gap-2">
                  {/* 抽出ボタン（pending または failed の場合のみ表示） */}
                  {['pending', 'failed'].includes(material.extraction_status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExtract(material)}
                      disabled={isExtracting === material.id}
                      title="テキスト抽出を実行"
                    >
                      <ArrowPathIcon className={`h-4 w-4 ${isExtracting === material.id ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                  {/* 削除ボタン */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedMaterial(material)
                      setIsDeleteModalOpen(true)
                    }}
                    title="削除"
                  >
                    <TrashIcon className="h-4 w-4 text-error" />
                  </Button>
                </div>
              ),
            },
          ]}
          data={filteredMaterials}
          keyExtractor={(material) => material.id}
          isLoading={isLoading}
          emptyMessage="資料がありません"
        />
      </Card>

      {/* アップロードモーダル */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title="資料をアップロード"
        size="lg"
      >
        <MaterialUploadForm
          onSuccess={handleUploadSuccess}
          onCancel={() => setIsUploadModalOpen(false)}
        />
      </Modal>

      {/* 削除確認モーダル */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedMaterial(null)
        }}
        title="資料の削除"
      >
        <p className="text-text-light">
          「{selectedMaterial?.name}」を削除してもよろしいですか？
          <br />
          この操作は取り消せません。
        </p>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setSelectedMaterial(null)
            }}
          >
            キャンセル
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            削除
          </Button>
        </ModalFooter>
      </Modal>
    </motion.div>
  )
}
