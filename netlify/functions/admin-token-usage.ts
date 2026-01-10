// ============================================
// トークン使用量統計 API（管理者専用）
// GET /api/admin-token-usage
// ============================================

import type { Handler, HandlerEvent } from '@netlify/functions'
import { checkAuth, handlePreflight, checkMethod } from './shared/auth'
import { getCorsHeaders } from './shared/cors'
import { ErrorResponses } from './shared/errors'

// ============================================
// Supabaseリレーション型定義
// ============================================
interface ProfileRelation {
  id: string
  name: string | null
  email: string | null
}

interface GroupRelation {
  id: string
  name: string | null
}

interface CompanyRelation {
  id: string
  name: string | null
}

interface AIModelRelation {
  id: string
  display_name: string | null
  provider: string | null
}

interface TokenUsageRow {
  id: string
  profile_id: string | null
  group_id: string | null
  company_id: string | null
  ai_model_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  estimated_cost: number | null
  usage_date: string
  session_id: string | null
  profiles: ProfileRelation | null
  groups: GroupRelation | null
  companies: CompanyRelation | null
  ai_models: AIModelRelation | null
}

export const handler: Handler = async (event: HandlerEvent) => {
  const preflightResponse = handlePreflight(event)
  if (preflightResponse) return preflightResponse

  const methodError = checkMethod(event, 'GET')
  if (methodError) return methodError

  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  const authResult = await checkAuth(event, { requireSuperAdmin: true })
  if (!authResult.success) {
    return authResult.response
  }
  const { supabase } = authResult

  try {
    const params = event.queryStringParameters || {}
    const period = params.period || 'daily' // 'daily' | 'weekly' | 'monthly'
    const companyId = params.companyId
    const groupId = params.groupId
    const profileId = params.profileId

    // 期間の計算
    const now = new Date()
    let startDate: Date
    let groupBy: 'day' | 'week' | 'month'

    switch (period) {
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 7 * 24 * 60 * 60 * 1000) // 7週間
        groupBy = 'week'
        break
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1) // 12ヶ月
        groupBy = 'month'
        break
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30日
        groupBy = 'day'
    }

    // 使用量データ取得
    let query = supabase
      .from('token_usage')
      .select(`
        id,
        profile_id,
        group_id,
        company_id,
        ai_model_id,
        input_tokens,
        output_tokens,
        estimated_cost,
        usage_date,
        session_id,
        profiles(id, name, email),
        groups(id, name),
        companies(id, name),
        ai_models(id, display_name, provider)
      `)
      .gte('usage_date', startDate.toISOString().split('T')[0])
      .order('usage_date', { ascending: true })

    if (companyId) query = query.eq('company_id', companyId)
    if (groupId) query = query.eq('group_id', groupId)
    if (profileId) query = query.eq('profile_id', profileId)

    const { data: usageData, error } = await query

    if (error) throw error

    // 集計処理
    const summary = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      uniqueUsers: new Set<string>(),
      uniqueSessions: new Set<string>(),
    }

    const byDate: Record<string, {
      date: string
      inputTokens: number
      outputTokens: number
      cost: number
      sessions: number
    }> = {}

    const byUser: Record<string, {
      profileId: string
      name: string
      email: string
      inputTokens: number
      outputTokens: number
      cost: number
      sessions: number
    }> = {}

    const byModel: Record<string, {
      modelId: string
      displayName: string
      provider: string
      inputTokens: number
      outputTokens: number
      cost: number
      count: number
    }> = {}

    const byCompany: Record<string, {
      companyId: string
      name: string
      inputTokens: number
      outputTokens: number
      cost: number
      users: Set<string>
    }> = {}

    // 型アサーションを使用してデータを処理
    const typedUsageData = usageData as TokenUsageRow[] | null

    typedUsageData?.forEach((row) => {
      const inputTokens = row.input_tokens || 0
      const outputTokens = row.output_tokens || 0
      const cost = row.estimated_cost || 0

      // 全体集計
      summary.totalInputTokens += inputTokens
      summary.totalOutputTokens += outputTokens
      summary.totalCost += cost
      if (row.profile_id) summary.uniqueUsers.add(row.profile_id)
      if (row.session_id) summary.uniqueSessions.add(row.session_id)

      // 日付別集計
      let dateKey = row.usage_date
      if (groupBy === 'week') {
        const date = new Date(row.usage_date)
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        dateKey = weekStart.toISOString().split('T')[0]
      } else if (groupBy === 'month') {
        dateKey = row.usage_date.substring(0, 7) // YYYY-MM
      }

      if (!byDate[dateKey]) {
        byDate[dateKey] = { date: dateKey, inputTokens: 0, outputTokens: 0, cost: 0, sessions: 0 }
      }
      byDate[dateKey].inputTokens += inputTokens
      byDate[dateKey].outputTokens += outputTokens
      byDate[dateKey].cost += cost
      if (row.session_id) byDate[dateKey].sessions++

      // ユーザー別集計
      if (row.profile_id) {
        const profile = row.profiles
        if (!byUser[row.profile_id]) {
          byUser[row.profile_id] = {
            profileId: row.profile_id,
            name: profile?.name || '不明',
            email: profile?.email || '',
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            sessions: 0,
          }
        }
        byUser[row.profile_id].inputTokens += inputTokens
        byUser[row.profile_id].outputTokens += outputTokens
        byUser[row.profile_id].cost += cost
        if (row.session_id) byUser[row.profile_id].sessions++
      }

      // モデル別集計
      if (row.ai_model_id) {
        const model = row.ai_models
        if (!byModel[row.ai_model_id]) {
          byModel[row.ai_model_id] = {
            modelId: row.ai_model_id,
            displayName: model?.display_name || '不明',
            provider: model?.provider || '',
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            count: 0,
          }
        }
        byModel[row.ai_model_id].inputTokens += inputTokens
        byModel[row.ai_model_id].outputTokens += outputTokens
        byModel[row.ai_model_id].cost += cost
        byModel[row.ai_model_id].count++
      }

      // 企業別集計
      if (row.company_id) {
        const company = row.companies
        if (!byCompany[row.company_id]) {
          byCompany[row.company_id] = {
            companyId: row.company_id,
            name: company?.name || '不明',
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            users: new Set(),
          }
        }
        byCompany[row.company_id].inputTokens += inputTokens
        byCompany[row.company_id].outputTokens += outputTokens
        byCompany[row.company_id].cost += cost
        if (row.profile_id) byCompany[row.company_id].users.add(row.profile_id)
      }
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        summary: {
          totalInputTokens: summary.totalInputTokens,
          totalOutputTokens: summary.totalOutputTokens,
          totalTokens: summary.totalInputTokens + summary.totalOutputTokens,
          totalCost: Math.round(summary.totalCost * 10000) / 10000,
          uniqueUsers: summary.uniqueUsers.size,
          uniqueSessions: summary.uniqueSessions.size,
        },
        byDate: Object.values(byDate).map((d) => ({
          ...d,
          totalTokens: d.inputTokens + d.outputTokens,
          cost: Math.round(d.cost * 10000) / 10000,
        })),
        byUser: Object.values(byUser)
          .map((u) => ({
            ...u,
            totalTokens: u.inputTokens + u.outputTokens,
            cost: Math.round(u.cost * 10000) / 10000,
          }))
          .sort((a, b) => b.totalTokens - a.totalTokens)
          .slice(0, 20),
        byModel: Object.values(byModel).map((m) => ({
          ...m,
          totalTokens: m.inputTokens + m.outputTokens,
          cost: Math.round(m.cost * 10000) / 10000,
        })),
        byCompany: Object.values(byCompany).map((c) => ({
          companyId: c.companyId,
          name: c.name,
          inputTokens: c.inputTokens,
          outputTokens: c.outputTokens,
          totalTokens: c.inputTokens + c.outputTokens,
          cost: Math.round(c.cost * 10000) / 10000,
          userCount: c.users.size,
        })),
        period,
        startDate: startDate.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      }),
    }
  } catch (error) {
    console.error('Token usage error:', error)
    return ErrorResponses.serverError(headers, 'トークン使用量の取得に失敗しました')
  }
}
