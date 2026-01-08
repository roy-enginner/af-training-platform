import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { GroupForm } from '@/components/admin/GroupForm'
import type { Group } from '@/types/database'

interface GroupWithCount extends Group {
  memberCount: number
}

export function GroupsPage() {
  const [groups, setGroups] = useState<GroupWithCount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<GroupWithCount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Fetch groups with member count
  const fetchGroups = useCallback(async () => {
    try {
      setIsLoading(true)

      // Fetch groups
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('*')
        .order('name')

      if (groupsError) throw groupsError

      // Fetch member counts for each group
      const groupsWithCounts = await Promise.all(
        (groupsData || []).map(async (group) => {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id)

          return {
            ...group,
            memberCount: count || 0,
          }
        })
      )

      setGroups(groupsWithCounts)
    } catch (err) {
      console.error('Error fetching groups:', err)
      setError('グループの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  // Filter groups by search query
  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Handle group creation
  const handleCreateGroup = async (data: { name: string; dailyTokenLimit: number }) => {
    try {
      const { error: createError } = await supabase
        .from('groups')
        .insert({
          name: data.name,
          daily_token_limit: data.dailyTokenLimit,
        })

      if (createError) throw createError

      setSuccessMessage('グループを作成しました')
      setIsGroupModalOpen(false)
      fetchGroups()
    } catch (err) {
      console.error('Error creating group:', err)
      setError('グループの作成に失敗しました')
    }
  }

  // Handle group update
  const handleUpdateGroup = async (data: { name: string; dailyTokenLimit: number }) => {
    if (!selectedGroup) return

    try {
      const { error: updateError } = await supabase
        .from('groups')
        .update({
          name: data.name,
          daily_token_limit: data.dailyTokenLimit,
        })
        .eq('id', selectedGroup.id)

      if (updateError) throw updateError

      setSuccessMessage('グループを更新しました')
      setIsGroupModalOpen(false)
      setSelectedGroup(null)
      fetchGroups()
    } catch (err) {
      console.error('Error updating group:', err)
      setError('グループの更新に失敗しました')
    }
  }

  // Handle group deletion
  const handleDeleteGroup = async () => {
    if (!selectedGroup) return

    try {
      // Check if group has members
      if (selectedGroup.memberCount > 0) {
        setError('所属メンバーがいるグループは削除できません')
        setIsDeleteModalOpen(false)
        return
      }

      const { error: deleteError } = await supabase
        .from('groups')
        .delete()
        .eq('id', selectedGroup.id)

      if (deleteError) throw deleteError

      setSuccessMessage('グループを削除しました')
      setIsDeleteModalOpen(false)
      setSelectedGroup(null)
      fetchGroups()
    } catch (err) {
      console.error('Error deleting group:', err)
      setError('グループの削除に失敗しました')
    }
  }

  // Format number with commas
  const formatNumber = (num: number) => num.toLocaleString()

  // Table columns
  const columns = [
    {
      key: 'name',
      header: 'グループ名',
      render: (group: GroupWithCount) => (
        <span className="font-medium">{group.name}</span>
      ),
    },
    {
      key: 'memberCount',
      header: '所属人数',
      render: (group: GroupWithCount) => (
        <div className="flex items-center gap-2">
          <UsersIcon className="w-4 h-4 text-text-light" />
          <span>{group.memberCount}人</span>
        </div>
      ),
    },
    {
      key: 'dailyTokenLimit',
      header: '日次トークン上限',
      render: (group: GroupWithCount) => (
        <span>{formatNumber(group.daily_token_limit)} トークン</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (group: GroupWithCount) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedGroup(group)
              setIsGroupModalOpen(true)
            }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="編集"
          >
            <PencilIcon className="w-4 h-4 text-text-light" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedGroup(group)
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
          <h1 className="text-2xl font-bold text-text">グループ管理</h1>
          <p className="text-text-light mt-1">企業グループの管理</p>
        </div>
        <Button
          leftIcon={<PlusIcon className="w-5 h-5" />}
          onClick={() => {
            setSelectedGroup(null)
            setIsGroupModalOpen(true)
          }}
        >
          グループ追加
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

      {/* Search */}
      <Card padding="sm">
        <Input
          placeholder="グループ名で検索..."
          leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Card>

      {/* Groups table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Table
          columns={columns}
          data={filteredGroups}
          keyExtractor={(group) => group.id}
          isLoading={isLoading}
          emptyMessage="グループが登録されていません"
        />
      </motion.div>

      {/* Group form modal */}
      <Modal
        isOpen={isGroupModalOpen}
        onClose={() => {
          setIsGroupModalOpen(false)
          setSelectedGroup(null)
        }}
        title={selectedGroup ? 'グループ編集' : 'グループ追加'}
      >
        <GroupForm
          group={selectedGroup}
          onSubmit={selectedGroup ? handleUpdateGroup : handleCreateGroup}
          onCancel={() => {
            setIsGroupModalOpen(false)
            setSelectedGroup(null)
          }}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedGroup(null)
        }}
        title="グループ削除の確認"
        size="sm"
      >
        <p className="text-text">
          <span className="font-semibold">{selectedGroup?.name}</span>{' '}
          を削除してもよろしいですか？この操作は取り消せません。
        </p>
        {selectedGroup && selectedGroup.memberCount > 0 && (
          <Alert variant="warning" className="mt-4">
            このグループには{selectedGroup.memberCount}人のメンバーが所属しています。
            先にメンバーを別のグループに移動してください。
          </Alert>
        )}
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setSelectedGroup(null)
            }}
          >
            キャンセル
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteGroup}
            disabled={selectedGroup ? selectedGroup.memberCount > 0 : false}
          >
            削除する
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
