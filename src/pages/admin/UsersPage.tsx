import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  PlusIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase, generateRandomPassword } from '@/lib/supabase'
import { UserForm } from '@/components/admin/UserForm'
import { CsvUpload } from '@/components/admin/CsvUpload'
import type { ProfileWithGroup, Group } from '@/types/database'

export function UsersPage() {
  const [users, setUsers] = useState<ProfileWithGroup[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<ProfileWithGroup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select(`
          *,
          group:groups(*)
        `)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setUsers(data as ProfileWithGroup[])
    } catch (err) {
      console.error('Error fetching users:', err)
      setError('ユーザーの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('groups')
        .select('*')
        .order('name')

      if (fetchError) throw fetchError
      setGroups(data || [])
    } catch (err) {
      console.error('Error fetching groups:', err)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchGroups()
  }, [fetchUsers, fetchGroups])

  // Filter users by search query
  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.group?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Handle user creation
  const handleCreateUser = async (data: { name: string; email?: string; role: string; groupId: string | null }) => {
    if (!data.email) {
      setError('メールアドレスは必須です')
      return
    }
    try {
      const password = generateRandomPassword()
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin

      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: data.email,
        password,
        email_confirm: true,
        user_metadata: {
          name: data.name,
          role: data.role,
        },
      })

      if (authError) throw authError

      // Update profile with group_id
      if (data.groupId && authData.user) {
        await supabase
          .from('profiles')
          .update({ group_id: data.groupId })
          .eq('id', authData.user.id)
      }

      // Send invitation email
      await fetch('/.netlify/functions/send-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          name: data.name,
          password,
          loginUrl: `${appUrl}/login`,
        }),
      })

      setSuccessMessage('ユーザーを作成し、招待メールを送信しました')
      setIsUserModalOpen(false)
      fetchUsers()
    } catch (err) {
      console.error('Error creating user:', err)
      setError('ユーザーの作成に失敗しました')
    }
  }

  // Handle user update
  const handleUpdateUser = async (data: { name: string; email?: string; role: string; groupId: string | null }) => {
    if (!selectedUser) return

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          name: data.name,
          role: data.role as 'admin' | 'trainee',
          group_id: data.groupId,
        })
        .eq('id', selectedUser.id)

      if (updateError) throw updateError

      setSuccessMessage('ユーザーを更新しました')
      setIsUserModalOpen(false)
      setSelectedUser(null)
      fetchUsers()
    } catch (err) {
      console.error('Error updating user:', err)
      setError('ユーザーの更新に失敗しました')
    }
  }

  // Handle user deletion
  const handleDeleteUser = async () => {
    if (!selectedUser) return

    try {
      // Delete from Supabase Auth (profile will be deleted automatically via cascade)
      const { error: deleteError } = await supabase.auth.admin.deleteUser(selectedUser.id)
      if (deleteError) throw deleteError

      setSuccessMessage('ユーザーを削除しました')
      setIsDeleteModalOpen(false)
      setSelectedUser(null)
      fetchUsers()
    } catch (err) {
      console.error('Error deleting user:', err)
      setError('ユーザーの削除に失敗しました')
    }
  }

  // Handle CSV import
  const handleCsvImport = async (importedUsers: Array<{ groupName: string; userName: string; email: string }>) => {
    try {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin
      let successCount = 0

      for (const user of importedUsers) {
        // Find or create group
        let groupId: string | null = null
        if (user.groupName) {
          const existingGroup = groups.find((g) => g.name === user.groupName)
          if (existingGroup) {
            groupId = existingGroup.id
          } else {
            const { data: newGroup } = await supabase
              .from('groups')
              .insert({ name: user.groupName })
              .select()
              .single()
            if (newGroup) {
              groupId = newGroup.id
              setGroups((prev) => [...prev, newGroup])
            }
          }
        }

        // Create user
        const password = generateRandomPassword()
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: user.email,
          password,
          email_confirm: true,
          user_metadata: {
            name: user.userName,
            role: 'trainee',
          },
        })

        if (authError) {
          console.error(`Error creating user ${user.email}:`, authError)
          continue
        }

        // Update profile with group_id
        if (groupId && authData.user) {
          await supabase
            .from('profiles')
            .update({ group_id: groupId })
            .eq('id', authData.user.id)
        }

        // Send invitation email
        await fetch('/.netlify/functions/send-invitation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            name: user.userName,
            password,
            loginUrl: `${appUrl}/login`,
          }),
        })

        successCount++
      }

      setSuccessMessage(`${successCount}人のユーザーを登録し、招待メールを送信しました`)
      setIsCsvModalOpen(false)
      fetchUsers()
      fetchGroups()
    } catch (err) {
      console.error('Error importing users:', err)
      setError('CSVインポートに失敗しました')
    }
  }

  // Table columns
  const columns = [
    {
      key: 'name',
      header: '名前',
      render: (user: ProfileWithGroup) => (
        <span className="font-medium">{user.name}</span>
      ),
    },
    {
      key: 'role',
      header: '権限',
      render: (user: ProfileWithGroup) => (
        <Badge variant={user.role === 'admin' ? 'primary' : 'default'}>
          {user.role === 'admin' ? '管理者' : '研修生'}
        </Badge>
      ),
    },
    {
      key: 'group',
      header: 'グループ',
      render: (user: ProfileWithGroup) => user.group?.name || '-',
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (user: ProfileWithGroup) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedUser(user)
              setIsUserModalOpen(true)
            }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="編集"
          >
            <PencilIcon className="w-4 h-4 text-text-light" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedUser(user)
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
          <h1 className="text-2xl font-bold text-text">ユーザー管理</h1>
          <p className="text-text-light mt-1">研修生と管理者の管理</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            leftIcon={<ArrowUpTrayIcon className="w-5 h-5" />}
            onClick={() => setIsCsvModalOpen(true)}
          >
            CSV一括登録
          </Button>
          <Button
            leftIcon={<PlusIcon className="w-5 h-5" />}
            onClick={() => {
              setSelectedUser(null)
              setIsUserModalOpen(true)
            }}
          >
            ユーザー追加
          </Button>
        </div>
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
          placeholder="名前またはグループで検索..."
          leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Card>

      {/* Users table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Table
          columns={columns}
          data={filteredUsers}
          keyExtractor={(user) => user.id}
          isLoading={isLoading}
          emptyMessage="ユーザーが登録されていません"
        />
      </motion.div>

      {/* User form modal */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => {
          setIsUserModalOpen(false)
          setSelectedUser(null)
        }}
        title={selectedUser ? 'ユーザー編集' : 'ユーザー追加'}
      >
        <UserForm
          user={selectedUser}
          groups={groups}
          onSubmit={selectedUser ? handleUpdateUser : handleCreateUser}
          onCancel={() => {
            setIsUserModalOpen(false)
            setSelectedUser(null)
          }}
        />
      </Modal>

      {/* CSV upload modal */}
      <Modal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        title="CSV一括登録"
        size="lg"
      >
        <CsvUpload
          onImport={handleCsvImport}
          onCancel={() => setIsCsvModalOpen(false)}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedUser(null)
        }}
        title="ユーザー削除の確認"
        size="sm"
      >
        <p className="text-text">
          <span className="font-semibold">{selectedUser?.name}</span>{' '}
          を削除してもよろしいですか？この操作は取り消せません。
        </p>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setSelectedUser(null)
            }}
          >
            キャンセル
          </Button>
          <Button variant="danger" onClick={handleDeleteUser}>
            削除する
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
