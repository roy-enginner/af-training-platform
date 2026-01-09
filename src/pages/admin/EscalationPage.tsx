// ============================================
// エスカレーション管理ページ
// ============================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  BellAlertIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Card, Table, Badge, Modal, ModalFooter, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'
import type {
  EscalationConfig,
  EscalationLog,
  EscalationChannel,
  EscalationTrigger,
} from '@/types/database'

// チャンネルラベル
const CHANNEL_LABELS: Record<EscalationChannel, string> = {
  email: 'メール',
  teams: 'Teams',
  slack: 'Slack',
}

// トリガーラベル
const TRIGGER_LABELS: Record<EscalationTrigger, string> = {
  system_error: 'システムエラー',
  bug_report: 'バグ報告',
  urgent: '緊急',
  manual: '手動',
  sentiment: '感情検知',
}

// トリガーカラー
const TRIGGER_COLORS: Record<EscalationTrigger, 'error' | 'warning' | 'primary' | 'default'> = {
  system_error: 'error',
  bug_report: 'warning',
  urgent: 'error',
  manual: 'primary',
  sentiment: 'warning',
}

interface EscalationConfigWithRelations extends EscalationConfig {
  company?: { id: string; name: string }
  group?: { id: string; name: string }
}

interface EscalationLogWithRelations extends EscalationLog {
  config?: { id: string; name: string }
  profile?: { id: string; full_name: string; email: string }
}

type TabType = 'configs' | 'logs'

export function EscalationPage() {
  const { role } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('configs')
  const [configs, setConfigs] = useState<EscalationConfigWithRelations[]>([])
  const [logs, setLogs] = useState<EscalationLogWithRelations[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // モーダル状態
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [isLogDetailModalOpen, setIsLogDetailModalOpen] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState<EscalationConfigWithRelations | null>(null)
  const [selectedLog, setSelectedLog] = useState<EscalationLogWithRelations | null>(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  // フォーム状態
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    channels: ['email'] as EscalationChannel[],
    email_recipients: '',
    teams_webhook_url: '',
    triggers: ['system_error', 'bug_report'] as EscalationTrigger[],
    is_active: true,
  })

  // 設定一覧を取得
  const fetchConfigs = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/.netlify/functions/admin-escalation?type=configs', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!response.ok) throw new Error('設定の取得に失敗しました')
      const data = await response.json()
      setConfigs(data.configs || [])
    } catch (err) {
      console.error('Error fetching configs:', err)
      setError('設定の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ログ一覧を取得
  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/.netlify/functions/admin-escalation?type=logs&limit=100', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!response.ok) throw new Error('ログの取得に失敗しました')
      const data = await response.json()
      setLogs(data.logs || [])
    } catch (err) {
      console.error('Error fetching logs:', err)
      setError('ログの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'configs') {
      fetchConfigs()
    } else {
      fetchLogs()
    }
  }, [activeTab, fetchConfigs, fetchLogs])

  // 権限チェック
  if (role && !hasPermission(role, 'canManageCompanies')) {
    return <Navigate to="/admin" replace />
  }

  // 設定保存
  const handleSaveConfig = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const payload = {
        ...formData,
        email_recipients: formData.email_recipients.split(',').map(e => e.trim()).filter(Boolean),
      }

      const url = selectedConfig
        ? `/.netlify/functions/admin-escalation?id=${selectedConfig.id}`
        : '/.netlify/functions/admin-escalation'

      const response = await fetch(url, {
        method: selectedConfig ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error('保存に失敗しました')

      setSuccessMessage(selectedConfig ? '設定を更新しました' : '設定を作成しました')
      setIsConfigModalOpen(false)
      resetForm()
      fetchConfigs()
    } catch (err) {
      console.error('Error saving config:', err)
      setError('設定の保存に失敗しました')
    }
  }

  // 設定削除
  const handleDeleteConfig = async () => {
    if (!selectedConfig) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/.netlify/functions/admin-escalation?id=${selectedConfig.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!response.ok) throw new Error('削除に失敗しました')

      setSuccessMessage('設定を削除しました')
      setIsDeleteModalOpen(false)
      setSelectedConfig(null)
      fetchConfigs()
    } catch (err) {
      console.error('Error deleting config:', err)
      setError('設定の削除に失敗しました')
    }
  }

  // ログを解決済みにする
  const handleResolveLog = async (logId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/.netlify/functions/admin-escalation?id=${logId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ resolve: true }),
      })

      if (!response.ok) throw new Error('更新に失敗しました')

      setSuccessMessage('解決済みにしました')
      setIsLogDetailModalOpen(false)
      setSelectedLog(null)
      fetchLogs()
    } catch (err) {
      console.error('Error resolving log:', err)
      setError('更新に失敗しました')
    }
  }

  // フォームリセット
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      channels: ['email'],
      email_recipients: '',
      teams_webhook_url: '',
      triggers: ['system_error', 'bug_report'],
      is_active: true,
    })
    setSelectedConfig(null)
  }

  // 編集モーダルを開く
  const openEditModal = (config: EscalationConfigWithRelations) => {
    setSelectedConfig(config)
    setFormData({
      name: config.name,
      description: config.description || '',
      channels: config.channels,
      email_recipients: (config.email_recipients || []).join(', '),
      teams_webhook_url: config.teams_webhook_url || '',
      triggers: config.triggers,
      is_active: config.is_active,
    })
    setIsConfigModalOpen(true)
  }

  // 日時フォーマット
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 統計
  const stats = useMemo(() => {
    const activeConfigs = configs.filter(c => c.is_active).length
    const totalLogs = logs.length
    const unresolvedLogs = logs.filter(l => !l.is_resolved).length
    const todayLogs = logs.filter(l => {
      const logDate = new Date(l.created_at).toDateString()
      return logDate === new Date().toDateString()
    }).length

    return { activeConfigs, totalLogs, unresolvedLogs, todayLogs }
  }, [configs, logs])

  // フィルタリング
  const filteredConfigs = useMemo(() => {
    return configs.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [configs, searchQuery])

  const filteredLogs = useMemo(() => {
    return logs.filter(l =>
      l.trigger.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [logs, searchQuery])

  // 設定テーブルカラム
  const configColumns = [
    {
      key: 'name',
      header: '設定名',
      render: (config: EscalationConfigWithRelations) => (
        <div>
          <div className="font-medium text-text">{config.name}</div>
          {config.description && (
            <div className="text-sm text-text-light truncate max-w-xs">{config.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'channels',
      header: 'チャンネル',
      render: (config: EscalationConfigWithRelations) => (
        <div className="flex flex-wrap gap-1">
          {config.channels.map(ch => (
            <Badge key={ch} variant="default" size="sm">
              {CHANNEL_LABELS[ch]}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'triggers',
      header: 'トリガー',
      render: (config: EscalationConfigWithRelations) => (
        <div className="flex flex-wrap gap-1">
          {config.triggers.slice(0, 3).map(tr => (
            <Badge key={tr} variant={TRIGGER_COLORS[tr]} size="sm">
              {TRIGGER_LABELS[tr]}
            </Badge>
          ))}
          {config.triggers.length > 3 && (
            <Badge variant="default" size="sm">+{config.triggers.length - 3}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'ステータス',
      render: (config: EscalationConfigWithRelations) => (
        config.is_active ? (
          <Badge variant="success" size="sm">有効</Badge>
        ) : (
          <Badge variant="default" size="sm">無効</Badge>
        )
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (config: EscalationConfigWithRelations) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              openEditModal(config)
            }}
          >
            <PencilIcon className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setSelectedConfig(config)
              setIsDeleteModalOpen(true)
            }}
          >
            <TrashIcon className="w-4 h-4 text-error" />
          </Button>
        </div>
      ),
    },
  ]

  // ログテーブルカラム
  const logColumns = [
    {
      key: 'trigger',
      header: 'トリガー',
      render: (log: EscalationLogWithRelations) => (
        <Badge variant={TRIGGER_COLORS[log.trigger]} size="sm">
          {TRIGGER_LABELS[log.trigger]}
        </Badge>
      ),
    },
    {
      key: 'config',
      header: '設定',
      render: (log: EscalationLogWithRelations) => (
        <span className="text-text">{log.config?.name || '-'}</span>
      ),
    },
    {
      key: 'user',
      header: 'ユーザー',
      render: (log: EscalationLogWithRelations) => (
        <span className="text-text">{log.profile?.full_name || '-'}</span>
      ),
    },
    {
      key: 'channels',
      header: '通知先',
      render: (log: EscalationLogWithRelations) => (
        <div className="flex gap-1">
          {log.channels_notified?.map(ch => (
            <Badge key={ch} variant="default" size="sm">
              {CHANNEL_LABELS[ch]}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'date',
      header: '日時',
      render: (log: EscalationLogWithRelations) => (
        <span className="text-sm text-text-light">{formatDate(log.created_at)}</span>
      ),
    },
    {
      key: 'status',
      header: 'ステータス',
      render: (log: EscalationLogWithRelations) => (
        log.is_resolved ? (
          <Badge variant="success" size="sm">解決済み</Badge>
        ) : (
          <Badge variant="warning" size="sm">未対応</Badge>
        )
      ),
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">エスカレーション管理</h1>
          <p className="mt-1 text-sm text-text-light">
            通知設定とエスカレーション履歴を管理します
          </p>
        </div>
        {activeTab === 'configs' && (
          <Button
            leftIcon={<PlusIcon className="w-4 h-4" />}
            onClick={() => {
              resetForm()
              setIsConfigModalOpen(true)
            }}
          >
            新規設定
          </Button>
        )}
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

      {/* 統計カード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BellAlertIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-text-light">有効な設定</p>
              <p className="text-2xl font-bold text-text">{stats.activeConfigs}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <ExclamationTriangleIcon className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-text-light">未対応</p>
              <p className="text-2xl font-bold text-text">{stats.unresolvedLogs}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10">
              <ClockIcon className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="text-sm text-text-light">今日の通知</p>
              <p className="text-2xl font-bold text-text">{stats.todayLogs}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <EnvelopeIcon className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-text-light">総通知数</p>
              <p className="text-2xl font-bold text-text">{stats.totalLogs}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* タブ */}
      <Card>
        <div className="border-b border-border">
          <nav className="flex gap-4 px-4">
            <button
              onClick={() => setActiveTab('configs')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'configs'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-light hover:text-text'
              }`}
            >
              通知設定
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'logs'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-light hover:text-text'
              }`}
            >
              通知履歴
            </button>
          </nav>
        </div>

        {/* 検索 */}
        <div className="p-4 border-b border-border">
          <div className="relative max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-light" />
            <Input
              type="text"
              placeholder="検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* テーブル */}
        {activeTab === 'configs' ? (
          <Table
            columns={configColumns}
            data={filteredConfigs}
            keyExtractor={(c) => c.id}
            isLoading={isLoading}
            emptyMessage="設定がありません"
          />
        ) : (
          <Table
            columns={logColumns}
            data={filteredLogs}
            keyExtractor={(l) => l.id}
            isLoading={isLoading}
            emptyMessage="ログがありません"
            onRowClick={(log) => {
              setSelectedLog(log)
              setIsLogDetailModalOpen(true)
            }}
          />
        )}
      </Card>

      {/* 設定作成/編集モーダル */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={() => {
          setIsConfigModalOpen(false)
          resetForm()
        }}
        title={selectedConfig ? '設定を編集' : '新規設定'}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1">設定名 *</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例: 緊急エスカレーション"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">説明</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="この設定の説明"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">通知チャンネル</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CHANNEL_LABELS) as EscalationChannel[]).map(ch => (
                <label key={ch} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.channels.includes(ch)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, channels: [...formData.channels, ch] })
                      } else {
                        setFormData({ ...formData, channels: formData.channels.filter(c => c !== ch) })
                      }
                    }}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-text">{CHANNEL_LABELS[ch]}</span>
                </label>
              ))}
            </div>
          </div>

          {formData.channels.includes('email') && (
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                メール送信先（カンマ区切り）
              </label>
              <Input
                value={formData.email_recipients}
                onChange={(e) => setFormData({ ...formData, email_recipients: e.target.value })}
                placeholder="admin@example.com, support@example.com"
              />
            </div>
          )}

          {formData.channels.includes('teams') && (
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Teams Webhook URL
              </label>
              <Input
                value={formData.teams_webhook_url}
                onChange={(e) => setFormData({ ...formData, teams_webhook_url: e.target.value })}
                placeholder="https://outlook.office.com/webhook/..."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text mb-2">トリガー条件</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TRIGGER_LABELS) as EscalationTrigger[]).map(tr => (
                <label key={tr} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.triggers.includes(tr)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, triggers: [...formData.triggers, tr] })
                      } else {
                        setFormData({ ...formData, triggers: formData.triggers.filter(t => t !== tr) })
                      }
                    }}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-text">{TRIGGER_LABELS[tr]}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm text-text">この設定を有効にする</span>
            </label>
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={() => {
            setIsConfigModalOpen(false)
            resetForm()
          }}>
            キャンセル
          </Button>
          <Button onClick={handleSaveConfig} disabled={!formData.name}>
            {selectedConfig ? '更新' : '作成'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ログ詳細モーダル */}
      <Modal
        isOpen={isLogDetailModalOpen}
        onClose={() => {
          setIsLogDetailModalOpen(false)
          setSelectedLog(null)
        }}
        title="通知詳細"
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={TRIGGER_COLORS[selectedLog.trigger]}>
                {TRIGGER_LABELS[selectedLog.trigger]}
              </Badge>
              {selectedLog.is_resolved ? (
                <Badge variant="success">解決済み</Badge>
              ) : (
                <Badge variant="warning">未対応</Badge>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm text-text-light">設定</p>
                <p className="font-medium text-text">{selectedLog.config?.name || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-text-light">ユーザー</p>
                <p className="font-medium text-text">
                  {selectedLog.profile?.full_name || '-'}
                  {selectedLog.profile?.email && (
                    <span className="text-text-light ml-2">({selectedLog.profile.email})</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-text-light">通知チャンネル</p>
                <div className="flex gap-1 mt-1">
                  {selectedLog.channels_notified?.map(ch => (
                    <Badge key={ch} variant="default" size="sm">
                      {CHANNEL_LABELS[ch]}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-text-light">発生日時</p>
                <p className="font-medium text-text">{formatDate(selectedLog.created_at)}</p>
              </div>
            </div>

            {selectedLog.trigger_details && (
              <div>
                <p className="text-sm text-text-light mb-1">トリガー詳細</p>
                <pre className="bg-gray-100 rounded-lg p-3 text-sm overflow-auto max-h-40">
                  {JSON.stringify(selectedLog.trigger_details, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.notification_results && (
              <div>
                <p className="text-sm text-text-light mb-1">通知結果</p>
                <pre className="bg-gray-100 rounded-lg p-3 text-sm overflow-auto max-h-40">
                  {JSON.stringify(selectedLog.notification_results, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.is_resolved && selectedLog.resolved_at && (
              <div className="text-sm text-success">
                解決日時: {formatDate(selectedLog.resolved_at)}
              </div>
            )}
          </div>
        )}

        <ModalFooter>
          <Button variant="ghost" onClick={() => {
            setIsLogDetailModalOpen(false)
            setSelectedLog(null)
          }}>
            閉じる
          </Button>
          {selectedLog && !selectedLog.is_resolved && (
            <Button
              onClick={() => handleResolveLog(selectedLog.id)}
              leftIcon={<CheckCircleIcon className="w-4 h-4" />}
            >
              解決済みにする
            </Button>
          )}
        </ModalFooter>
      </Modal>

      {/* 削除確認モーダル */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedConfig(null)
        }}
        title="設定を削除"
      >
        <p className="text-text">
          「{selectedConfig?.name}」を削除してもよろしいですか？
          この操作は取り消せません。
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => {
            setIsDeleteModalOpen(false)
            setSelectedConfig(null)
          }}>
            キャンセル
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteConfig}
            leftIcon={<XCircleIcon className="w-4 h-4" />}
          >
            削除
          </Button>
        </ModalFooter>
      </Modal>
    </motion.div>
  )
}
