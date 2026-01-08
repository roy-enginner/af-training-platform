import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  TagIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import {
  AttributeDefinitionForm,
  type AttributeDefinitionFormSubmitData,
} from '@/components/admin/AttributeDefinitionForm'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type { AttributeDefinition, AttributeType } from '@/types/database'

type SortField = 'key' | 'label' | 'attributeType' | 'sortOrder'
type SortDirection = 'asc' | 'desc'

const ATTRIBUTE_TYPE_LABELS: Record<AttributeType, string> = {
  text: 'テキスト',
  select: '選択肢',
  number: '数値',
  date: '日付',
}

const ATTRIBUTE_TYPE_COLORS: Record<AttributeType, 'primary' | 'success' | 'warning' | 'error'> = {
  text: 'primary',
  select: 'success',
  number: 'warning',
  date: 'error',
}

export function AttributesPage() {
  const { role } = useAuth()
  const [attributes, setAttributes] = useState<AttributeDefinition[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<AttributeType | ''>('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedAttribute, setSelectedAttribute] = useState<AttributeDefinition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('sortOrder')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Fetch attribute definitions
  const fetchAttributes = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data, error: fetchError } = await supabase
        .from('attribute_definitions')
        .select('*')
        .order('sort_order')

      if (fetchError) throw fetchError

      setAttributes(data || [])
    } catch (err) {
      console.error('Error fetching attributes:', err)
      setError('属性定義の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAttributes()
  }, [fetchAttributes])

  // Check permission - only super_admin can access this page
  if (role && !hasPermission(role, 'canManageAttributes')) {
    return <Navigate to="/admin" replace />
  }

  // Sort handler
  const handleSort = (field: string) => {
    const sortableField = field as SortField
    if (sortField === sortableField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(sortableField)
      setSortDirection('asc')
    }
  }

  // Filter and sort attributes
  const filteredAttributes = useMemo(() => {
    let result = attributes.filter((attr) => {
      const matchesSearch =
        attr.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        attr.label.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = !filterType || attr.attribute_type === filterType
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && attr.is_active) ||
        (filterStatus === 'inactive' && !attr.is_active)
      return matchesSearch && matchesType && matchesStatus
    })

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'key':
          comparison = a.key.localeCompare(b.key)
          break
        case 'label':
          comparison = a.label.localeCompare(b.label, 'ja')
          break
        case 'attributeType':
          comparison = a.attribute_type.localeCompare(b.attribute_type)
          break
        case 'sortOrder':
          comparison = a.sort_order - b.sort_order
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [attributes, searchQuery, filterType, filterStatus, sortField, sortDirection])

  // Handle attribute creation
  const handleCreateAttribute = async (data: AttributeDefinitionFormSubmitData) => {
    try {
      const { error: createError } = await supabase.from('attribute_definitions').insert({
        key: data.key,
        label: data.label,
        attribute_type: data.attributeType,
        options: data.options,
        sort_order: data.sortOrder,
        is_active: data.isActive,
      })

      if (createError) throw createError

      setSuccessMessage('属性定義を作成しました')
      setIsFormModalOpen(false)
      fetchAttributes()
    } catch (err) {
      console.error('Error creating attribute:', err)
      setError('属性定義の作成に失敗しました')
    }
  }

  // Handle attribute update
  const handleUpdateAttribute = async (data: AttributeDefinitionFormSubmitData) => {
    if (!selectedAttribute) return

    try {
      const { error: updateError } = await supabase
        .from('attribute_definitions')
        .update({
          label: data.label,
          attribute_type: data.attributeType,
          options: data.options,
          sort_order: data.sortOrder,
          is_active: data.isActive,
        })
        .eq('id', selectedAttribute.id)

      if (updateError) throw updateError

      setSuccessMessage('属性定義を更新しました')
      setIsFormModalOpen(false)
      setSelectedAttribute(null)
      fetchAttributes()
    } catch (err) {
      console.error('Error updating attribute:', err)
      setError('属性定義の更新に失敗しました')
    }
  }

  // Handle attribute deletion
  const handleDeleteAttribute = async () => {
    if (!selectedAttribute) return

    try {
      // Check if attribute is used by any users
      const { count } = await supabase
        .from('user_attributes')
        .select('*', { count: 'exact', head: true })
        .eq('attribute_key', selectedAttribute.key)

      if (count && count > 0) {
        setError(`この属性は${count}人のユーザーに設定されています。先にユーザーの属性値を削除してください。`)
        setIsDeleteModalOpen(false)
        return
      }

      const { error: deleteError } = await supabase
        .from('attribute_definitions')
        .delete()
        .eq('id', selectedAttribute.id)

      if (deleteError) throw deleteError

      setSuccessMessage('属性定義を削除しました')
      setIsDeleteModalOpen(false)
      setSelectedAttribute(null)
      fetchAttributes()
    } catch (err) {
      console.error('Error deleting attribute:', err)
      setError('属性定義の削除に失敗しました')
    }
  }

  // Get existing keys for uniqueness check
  const existingKeys = useMemo(
    () => attributes.filter((a) => a.id !== selectedAttribute?.id).map((a) => a.key),
    [attributes, selectedAttribute]
  )

  // Table columns
  const columns = [
    {
      key: 'sortOrder',
      header: '順序',
      sortable: true,
      className: 'w-16',
      render: (attr: AttributeDefinition) => (
        <span className="text-text-light">{attr.sort_order}</span>
      ),
    },
    {
      key: 'key',
      header: 'キー',
      sortable: true,
      render: (attr: AttributeDefinition) => (
        <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">{attr.key}</code>
      ),
    },
    {
      key: 'label',
      header: '表示名',
      sortable: true,
      render: (attr: AttributeDefinition) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{attr.label}</span>
          {!attr.is_active && (
            <Badge variant="default" size="sm">
              無効
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'attributeType',
      header: 'タイプ',
      sortable: true,
      render: (attr: AttributeDefinition) => (
        <Badge variant={ATTRIBUTE_TYPE_COLORS[attr.attribute_type]} size="sm">
          {ATTRIBUTE_TYPE_LABELS[attr.attribute_type]}
        </Badge>
      ),
    },
    {
      key: 'options',
      header: '選択肢',
      render: (attr: AttributeDefinition) => {
        if (attr.attribute_type !== 'select' || !attr.options) {
          return <span className="text-text-light">-</span>
        }
        return (
          <div className="flex items-center gap-1">
            <TagIcon className="w-4 h-4 text-text-light" />
            <span className="text-sm text-text-light">
              {attr.options.slice(0, 3).join(', ')}
              {attr.options.length > 3 && ` +${attr.options.length - 3}`}
            </span>
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (attr: AttributeDefinition) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedAttribute(attr)
              setIsFormModalOpen(true)
            }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="編集"
          >
            <PencilIcon className="w-4 h-4 text-text-light" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedAttribute(attr)
              setIsDeleteModalOpen(true)
            }}
            className="p-2 rounded-lg hover:bg-red-50 transition-colors"
            title="削除"
          >
            <TrashIcon className="w-4 h-4 text-error" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">属性管理</h1>
          <p className="text-text-light mt-1">ユーザー属性の定義・管理</p>
        </div>
        <Button
          leftIcon={<PlusIcon className="w-5 h-5" />}
          onClick={() => {
            setSelectedAttribute(null)
            setIsFormModalOpen(true)
          }}
        >
          属性追加
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

      {/* Search and Filters */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="キー・表示名で検索..."
              leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as AttributeType | '')}
          >
            <option value="">すべてのタイプ</option>
            {(Object.keys(ATTRIBUTE_TYPE_LABELS) as AttributeType[]).map((type) => (
              <option key={type} value={type}>
                {ATTRIBUTE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <select
            className="px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
          >
            <option value="all">すべてのステータス</option>
            <option value="active">有効のみ</option>
            <option value="inactive">無効のみ</option>
          </select>
        </div>
      </Card>

      {/* Attributes table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Table
          columns={columns}
          data={filteredAttributes}
          keyExtractor={(attr) => attr.id}
          isLoading={isLoading}
          emptyMessage="属性定義が登録されていません"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      </motion.div>

      {/* Attribute form modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setSelectedAttribute(null)
        }}
        title={selectedAttribute ? '属性定義編集' : '属性定義追加'}
        size="md"
      >
        <AttributeDefinitionForm
          definition={selectedAttribute}
          existingKeys={existingKeys}
          onSubmit={selectedAttribute ? handleUpdateAttribute : handleCreateAttribute}
          onCancel={() => {
            setIsFormModalOpen(false)
            setSelectedAttribute(null)
          }}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedAttribute(null)
        }}
        title="属性定義削除の確認"
        size="sm"
      >
        <p className="text-text">
          属性 <span className="font-semibold">{selectedAttribute?.label}</span>（
          <code className="px-1 bg-gray-100 rounded">{selectedAttribute?.key}</code>
          ）を削除してもよろしいですか？
        </p>
        <p className="text-sm text-text-light mt-2">
          この属性を使用しているユーザーがいる場合、削除できません。
        </p>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setSelectedAttribute(null)
            }}
          >
            キャンセル
          </Button>
          <Button variant="danger" onClick={handleDeleteAttribute}>
            削除する
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
