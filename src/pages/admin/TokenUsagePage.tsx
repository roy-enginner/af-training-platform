// ============================================
// トークン使用量管理ページ
// ============================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChartBarIcon,
  CurrencyYenIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline'
import { Button, Card, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'

// 期間タイプ
type PeriodType = 'daily' | 'weekly' | 'monthly'

// APIレスポンス型
interface TokenUsageResponse {
  summary: {
    totalInputTokens: number
    totalOutputTokens: number
    totalTokens: number
    totalCost: number
    uniqueUsers: number
    uniqueSessions: number
  }
  byDate: {
    date: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost: number
    sessions: number
  }[]
  byUser: {
    profileId: string
    name: string
    email: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost: number
    sessions: number
  }[]
  byModel: {
    modelId: string
    displayName: string
    provider: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost: number
    count: number
  }[]
  byCompany: {
    companyId: string
    name: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost: number
    userCount: number
  }[]
  period: string
  startDate: string
  endDate: string
}

export function TokenUsagePage() {
  const { role } = useAuth()
  const [data, setData] = useState<TokenUsageResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodType>('daily')

  // データ取得
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(
        `/.netlify/functions/admin-token-usage?period=${period}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      )

      if (!response.ok) throw new Error('データの取得に失敗しました')
      const result = await response.json()
      setData(result)
    } catch (err) {
      console.error('Error fetching token usage:', err)
      setError('データの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 権限チェック
  if (role && !hasPermission(role, 'canManageCompanies')) {
    return <Navigate to="/admin" replace />
  }

  // 数値フォーマット
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ja-JP').format(num)
  }

  // 金額フォーマット
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  // 日付フォーマット
  const formatDateLabel = (dateStr: string) => {
    if (dateStr.length === 7) {
      // YYYY-MM
      const [year, month] = dateStr.split('-')
      return `${year}年${parseInt(month)}月`
    }
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
    })
  }

  // グラフ用の最大値
  const maxTokens = useMemo(() => {
    if (!data?.byDate) return 0
    return Math.max(...data.byDate.map(d => d.totalTokens), 1)
  }, [data])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">トークン使用量</h1>
          <p className="mt-1 text-sm text-text-light">
            AIモデルのトークン使用量と推定コストを確認します
          </p>
        </div>
        <div className="flex gap-2">
          {(['daily', 'weekly', 'monthly'] as PeriodType[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p === 'daily' ? '日別' : p === 'weekly' ? '週別' : '月別'}
            </Button>
          ))}
        </div>
      </div>

      {/* アラート */}
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ローディング */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* サマリーカード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <ChartBarIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-text-light">総トークン</p>
                  <p className="text-xl font-bold text-text">{formatNumber(data.summary.totalTokens)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10">
                  <CurrencyYenIcon className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <p className="text-sm text-text-light">推定コスト</p>
                  <p className="text-xl font-bold text-text">{formatCurrency(data.summary.totalCost)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                  <UserGroupIcon className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-text-light">アクティブユーザー</p>
                  <p className="text-xl font-bold text-text">{formatNumber(data.summary.uniqueUsers)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                  <ArrowTrendingUpIcon className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-text-light">セッション数</p>
                  <p className="text-xl font-bold text-text">{formatNumber(data.summary.uniqueSessions)}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* 期間情報 */}
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-text-light">
              <CalendarIcon className="w-4 h-4" />
              <span>期間: {data.startDate} 〜 {data.endDate}</span>
            </div>
          </Card>

          {/* 日付別グラフ */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-text mb-4">
              {period === 'daily' ? '日別' : period === 'weekly' ? '週別' : '月別'}トークン使用量
            </h2>
            <div className="space-y-2">
              {data.byDate.map((item) => (
                <div key={item.date} className="flex items-center gap-4">
                  <div className="w-20 text-sm text-text-light flex-shrink-0">
                    {formatDateLabel(item.date)}
                  </div>
                  <div className="flex-1">
                    <div className="flex gap-1 h-6">
                      {/* 入力トークン */}
                      <div
                        className="bg-primary/70 rounded-l"
                        style={{ width: `${(item.inputTokens / maxTokens) * 100}%` }}
                        title={`入力: ${formatNumber(item.inputTokens)}`}
                      />
                      {/* 出力トークン */}
                      <div
                        className="bg-secondary/70 rounded-r"
                        style={{ width: `${(item.outputTokens / maxTokens) * 100}%` }}
                        title={`出力: ${formatNumber(item.outputTokens)}`}
                      />
                    </div>
                  </div>
                  <div className="w-28 text-sm text-right text-text flex-shrink-0">
                    {formatNumber(item.totalTokens)}
                  </div>
                  <div className="w-20 text-sm text-right text-text-light flex-shrink-0">
                    {formatCurrency(item.cost)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-primary/70 rounded" />
                <span className="text-text-light">入力トークン</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-secondary/70 rounded" />
                <span className="text-text-light">出力トークン</span>
              </div>
            </div>
          </Card>

          {/* モデル別使用量 */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-text mb-4">モデル別使用量</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-text-light border-b border-border">
                    <th className="pb-2 font-medium">モデル</th>
                    <th className="pb-2 font-medium">プロバイダー</th>
                    <th className="pb-2 font-medium text-right">入力トークン</th>
                    <th className="pb-2 font-medium text-right">出力トークン</th>
                    <th className="pb-2 font-medium text-right">総トークン</th>
                    <th className="pb-2 font-medium text-right">推定コスト</th>
                    <th className="pb-2 font-medium text-right">リクエスト数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.byModel.map((model) => (
                    <tr key={model.modelId} className="text-sm">
                      <td className="py-3 font-medium text-text">{model.displayName}</td>
                      <td className="py-3 text-text-light">{model.provider}</td>
                      <td className="py-3 text-right text-text">{formatNumber(model.inputTokens)}</td>
                      <td className="py-3 text-right text-text">{formatNumber(model.outputTokens)}</td>
                      <td className="py-3 text-right text-text font-medium">{formatNumber(model.totalTokens)}</td>
                      <td className="py-3 text-right text-text">{formatCurrency(model.cost)}</td>
                      <td className="py-3 text-right text-text-light">{formatNumber(model.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 企業別使用量 */}
          {data.byCompany.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
                <BuildingOfficeIcon className="w-5 h-5" />
                企業別使用量
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-text-light border-b border-border">
                      <th className="pb-2 font-medium">企業名</th>
                      <th className="pb-2 font-medium text-right">ユーザー数</th>
                      <th className="pb-2 font-medium text-right">入力トークン</th>
                      <th className="pb-2 font-medium text-right">出力トークン</th>
                      <th className="pb-2 font-medium text-right">総トークン</th>
                      <th className="pb-2 font-medium text-right">推定コスト</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.byCompany.map((company) => (
                      <tr key={company.companyId} className="text-sm">
                        <td className="py-3 font-medium text-text">{company.name}</td>
                        <td className="py-3 text-right text-text-light">{company.userCount}</td>
                        <td className="py-3 text-right text-text">{formatNumber(company.inputTokens)}</td>
                        <td className="py-3 text-right text-text">{formatNumber(company.outputTokens)}</td>
                        <td className="py-3 text-right text-text font-medium">{formatNumber(company.totalTokens)}</td>
                        <td className="py-3 text-right text-text">{formatCurrency(company.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ユーザー別使用量（上位20名） */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
              <UserGroupIcon className="w-5 h-5" />
              ユーザー別使用量（上位20名）
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-text-light border-b border-border">
                    <th className="pb-2 font-medium">ユーザー</th>
                    <th className="pb-2 font-medium text-right">セッション</th>
                    <th className="pb-2 font-medium text-right">入力トークン</th>
                    <th className="pb-2 font-medium text-right">出力トークン</th>
                    <th className="pb-2 font-medium text-right">総トークン</th>
                    <th className="pb-2 font-medium text-right">推定コスト</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.byUser.map((user, index) => (
                    <tr key={user.profileId} className="text-sm">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-text-light text-xs w-5">{index + 1}.</span>
                          <div>
                            <div className="font-medium text-text">{user.name}</div>
                            <div className="text-xs text-text-light">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-right text-text-light">{user.sessions}</td>
                      <td className="py-3 text-right text-text">{formatNumber(user.inputTokens)}</td>
                      <td className="py-3 text-right text-text">{formatNumber(user.outputTokens)}</td>
                      <td className="py-3 text-right text-text font-medium">{formatNumber(user.totalTokens)}</td>
                      <td className="py-3 text-right text-text">{formatCurrency(user.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 入力/出力の内訳 */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-text mb-4">トークン内訳</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-text-light mb-2">入力トークン</p>
                <p className="text-2xl font-bold text-primary">
                  {formatNumber(data.summary.totalInputTokens)}
                </p>
                <p className="text-sm text-text-light mt-1">
                  {((data.summary.totalInputTokens / data.summary.totalTokens) * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-text-light mb-2">出力トークン</p>
                <p className="text-2xl font-bold text-secondary">
                  {formatNumber(data.summary.totalOutputTokens)}
                </p>
                <p className="text-sm text-text-light mt-1">
                  {((data.summary.totalOutputTokens / data.summary.totalTokens) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="mt-4 h-4 rounded-full overflow-hidden bg-gray-200 flex">
              <div
                className="bg-primary"
                style={{
                  width: `${(data.summary.totalInputTokens / data.summary.totalTokens) * 100}%`,
                }}
              />
              <div
                className="bg-secondary"
                style={{
                  width: `${(data.summary.totalOutputTokens / data.summary.totalTokens) * 100}%`,
                }}
              />
            </div>
          </Card>
        </>
      )}
    </motion.div>
  )
}
