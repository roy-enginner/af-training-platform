// ============================================
// トークン使用量追跡モジュール
// ============================================

import { SupabaseClient } from '@supabase/supabase-js'

// ============================================
// 型定義
// ============================================
export interface TokenUsageRecord {
  profileId: string
  groupId?: string | null
  companyId?: string | null
  aiModelId?: string | null
  inputTokens: number
  outputTokens: number
  estimatedCost?: number | null
  sessionId?: string | null
}

export interface TokenLimitInfo {
  userId: string
  userDailyLimit: number
  userDailyUsed: number
  groupId?: string | null
  groupDailyLimit: number
  groupDailyUsed: number
  companyId?: string | null
  companyDailyLimit: number
  companyDailyUsed: number
}

export interface TokenLimitCheckResult {
  allowed: boolean
  reason?: string
  limits: TokenLimitInfo
}

// ============================================
// デフォルト制限値（環境変数から取得）
// ============================================
export function getDefaultLimits() {
  return {
    // デフォルトの日次トークン制限
    defaultDailyTokenLimit: parseInt(process.env.DEFAULT_DAILY_TOKEN_LIMIT || '100000', 10),
    // ユーザーごとのデフォルト日次制限
    defaultUserDailyTokenLimit: parseInt(process.env.DEFAULT_USER_DAILY_TOKEN_LIMIT || '10000', 10),
  }
}

// ============================================
// トークン使用量記録
// ============================================
export async function recordTokenUsage(
  supabase: SupabaseClient,
  usage: TokenUsageRecord
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('token_usage').insert({
      profile_id: usage.profileId,
      group_id: usage.groupId,
      company_id: usage.companyId,
      ai_model_id: usage.aiModelId,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      estimated_cost: usage.estimatedCost,
      session_id: usage.sessionId,
      usage_date: new Date().toISOString().split('T')[0],
    })

    if (error) {
      console.error('Failed to record token usage:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Token usage recording error:', err)
    return { success: false, error: String(err) }
  }
}

// ============================================
// 日次使用量取得
// ============================================
export async function getDailyUsage(
  supabase: SupabaseClient,
  options: {
    profileId?: string
    groupId?: string
    companyId?: string
  }
): Promise<{ inputTokens: number; outputTokens: number; totalTokens: number }> {
  const today = new Date().toISOString().split('T')[0]

  let query = supabase
    .from('token_usage')
    .select('input_tokens, output_tokens')
    .eq('usage_date', today)

  if (options.profileId) {
    query = query.eq('profile_id', options.profileId)
  }
  if (options.groupId) {
    query = query.eq('group_id', options.groupId)
  }
  if (options.companyId) {
    query = query.eq('company_id', options.companyId)
  }

  const { data, error } = await query

  if (error || !data) {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  }

  const inputTokens = data.reduce((sum, row) => sum + (row.input_tokens || 0), 0)
  const outputTokens = data.reduce((sum, row) => sum + (row.output_tokens || 0), 0)

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}

// ============================================
// トークン制限チェック
// ============================================
export async function checkTokenLimits(
  supabase: SupabaseClient,
  profileId: string,
  requiredTokens: number = 0
): Promise<TokenLimitCheckResult> {
  const defaults = getDefaultLimits()

  // ユーザー情報を取得
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, group_id, company_id')
    .eq('id', profileId)
    .single()

  if (!profile) {
    return {
      allowed: false,
      reason: 'ユーザーが見つかりません',
      limits: {
        userId: profileId,
        userDailyLimit: 0,
        userDailyUsed: 0,
        groupDailyLimit: 0,
        groupDailyUsed: 0,
        companyDailyLimit: 0,
        companyDailyUsed: 0,
      },
    }
  }

  // グループ・企業の制限を取得
  let groupDailyLimit = defaults.defaultDailyTokenLimit
  let companyDailyLimit = defaults.defaultDailyTokenLimit

  if (profile.group_id) {
    const { data: group } = await supabase
      .from('groups')
      .select('daily_token_limit')
      .eq('id', profile.group_id)
      .single()
    if (group?.daily_token_limit) {
      groupDailyLimit = group.daily_token_limit
    }
  }

  if (profile.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('daily_token_limit')
      .eq('id', profile.company_id)
      .single()
    if (company?.daily_token_limit) {
      companyDailyLimit = company.daily_token_limit
    }
  }

  // 日次使用量を取得
  const userUsage = await getDailyUsage(supabase, { profileId })
  const groupUsage = profile.group_id
    ? await getDailyUsage(supabase, { groupId: profile.group_id })
    : { totalTokens: 0 }
  const companyUsage = profile.company_id
    ? await getDailyUsage(supabase, { companyId: profile.company_id })
    : { totalTokens: 0 }

  const limits: TokenLimitInfo = {
    userId: profileId,
    userDailyLimit: defaults.defaultUserDailyTokenLimit,
    userDailyUsed: userUsage.totalTokens,
    groupId: profile.group_id,
    groupDailyLimit,
    groupDailyUsed: groupUsage.totalTokens,
    companyId: profile.company_id,
    companyDailyLimit,
    companyDailyUsed: companyUsage.totalTokens,
  }

  // 制限チェック
  const userRemaining = limits.userDailyLimit - limits.userDailyUsed
  const groupRemaining = limits.groupDailyLimit - limits.groupDailyUsed
  const companyRemaining = limits.companyDailyLimit - limits.companyDailyUsed

  if (userRemaining <= requiredTokens) {
    return {
      allowed: false,
      reason: `本日のユーザー制限（${limits.userDailyLimit.toLocaleString()}トークン）に達しました`,
      limits,
    }
  }

  if (profile.group_id && groupRemaining <= requiredTokens) {
    return {
      allowed: false,
      reason: `本日のグループ制限（${groupDailyLimit.toLocaleString()}トークン）に達しました`,
      limits,
    }
  }

  if (profile.company_id && companyRemaining <= requiredTokens) {
    return {
      allowed: false,
      reason: `本日の企業制限（${companyDailyLimit.toLocaleString()}トークン）に達しました`,
      limits,
    }
  }

  return { allowed: true, limits }
}

// ============================================
// コスト計算
// ============================================
export interface TokenCostInfo {
  inputTokenCost: number // per 1M tokens
  outputTokenCost: number // per 1M tokens
}

// モデルごとのコスト（1Mトークンあたりのドル）
export const MODEL_COSTS: Record<string, TokenCostInfo> = {
  // Anthropic
  'claude-opus-4-20250514': { inputTokenCost: 15, outputTokenCost: 75 },
  'claude-sonnet-4-20250514': { inputTokenCost: 3, outputTokenCost: 15 },
  'claude-3-5-haiku-20241022': { inputTokenCost: 1, outputTokenCost: 5 },
  // OpenAI
  'gpt-4o': { inputTokenCost: 2.5, outputTokenCost: 10 },
  'gpt-4o-mini': { inputTokenCost: 0.15, outputTokenCost: 0.6 },
  'gpt-4-turbo': { inputTokenCost: 10, outputTokenCost: 30 },
  // Google
  'gemini-2.0-flash': { inputTokenCost: 0.1, outputTokenCost: 0.4 },
  'gemini-1.5-pro': { inputTokenCost: 1.25, outputTokenCost: 5 },
  'gemini-1.5-flash': { inputTokenCost: 0.075, outputTokenCost: 0.3 },
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model]
  if (!costs) {
    // デフォルトコスト（安全のため高めに設定）
    return (inputTokens * 5 + outputTokens * 15) / 1_000_000
  }

  return (
    (inputTokens * costs.inputTokenCost + outputTokens * costs.outputTokenCost) /
    1_000_000
  )
}

// ============================================
// 内部型定義
// ============================================
interface AIModelRelation {
  model_id: string | null
}

interface UsageSummaryRow {
  input_tokens: number | null
  output_tokens: number | null
  estimated_cost: number | null
  session_id: string | null
  ai_models: AIModelRelation | null
}

// ============================================
// 使用量サマリー取得
// ============================================
export interface UsageSummary {
  period: 'daily' | 'weekly' | 'monthly'
  startDate: string
  endDate: string
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  sessionCount: number
  byModel: Record<string, {
    inputTokens: number
    outputTokens: number
    cost: number
    count: number
  }>
}

export async function getUsageSummary(
  supabase: SupabaseClient,
  options: {
    profileId?: string
    groupId?: string
    companyId?: string
    period: 'daily' | 'weekly' | 'monthly'
    date?: Date
  }
): Promise<UsageSummary> {
  const date = options.date || new Date()
  let startDate: string
  let endDate: string

  // 期間を計算
  switch (options.period) {
    case 'daily':
      startDate = date.toISOString().split('T')[0]
      endDate = startDate
      break
    case 'weekly': {
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      startDate = weekStart.toISOString().split('T')[0]
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      endDate = weekEnd.toISOString().split('T')[0]
      break
    }
    case 'monthly': {
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
      startDate = monthStart.toISOString().split('T')[0]
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0)
      endDate = monthEnd.toISOString().split('T')[0]
      break
    }
  }

  let query = supabase
    .from('token_usage')
    .select(`
      input_tokens,
      output_tokens,
      estimated_cost,
      session_id,
      ai_models(model_id)
    `)
    .gte('usage_date', startDate)
    .lte('usage_date', endDate)

  if (options.profileId) {
    query = query.eq('profile_id', options.profileId)
  }
  if (options.groupId) {
    query = query.eq('group_id', options.groupId)
  }
  if (options.companyId) {
    query = query.eq('company_id', options.companyId)
  }

  const { data, error } = await query

  if (error || !data) {
    return {
      period: options.period,
      startDate,
      endDate,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      sessionCount: 0,
      byModel: {},
    }
  }

  // 型アサーションを使用
  const typedData = data as UsageSummaryRow[]

  // 集計
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCost = 0
  const sessionIds = new Set<string>()
  const byModel: Record<string, {
    inputTokens: number
    outputTokens: number
    cost: number
    count: number
  }> = {}

  for (const row of typedData) {
    totalInputTokens += row.input_tokens || 0
    totalOutputTokens += row.output_tokens || 0
    totalCost += row.estimated_cost || 0
    if (row.session_id) {
      sessionIds.add(row.session_id)
    }

    // モデル別集計
    const modelId = row.ai_models?.model_id || 'unknown'
    if (!byModel[modelId]) {
      byModel[modelId] = { inputTokens: 0, outputTokens: 0, cost: 0, count: 0 }
    }
    byModel[modelId].inputTokens += row.input_tokens || 0
    byModel[modelId].outputTokens += row.output_tokens || 0
    byModel[modelId].cost += row.estimated_cost || 0
    byModel[modelId].count += 1
  }

  return {
    period: options.period,
    startDate,
    endDate,
    totalInputTokens,
    totalOutputTokens,
    totalCost,
    sessionCount: sessionIds.size,
    byModel,
  }
}
