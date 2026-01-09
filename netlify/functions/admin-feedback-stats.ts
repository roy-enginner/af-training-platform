// ============================================
// フィードバック統計・AI改善サジェスト API
// GET/POST /api/admin-feedback-stats
// ============================================

import type { Handler, HandlerEvent } from '@netlify/functions'
import { checkAuth, handlePreflight, checkMethod } from './shared/auth'
import { getCorsHeaders } from './shared/cors'
import { ErrorResponses } from './shared/errors'
import { createCompletion } from './shared/ai-providers'

export const handler: Handler = async (event: HandlerEvent) => {
  const preflightResponse = handlePreflight(event)
  if (preflightResponse) return preflightResponse

  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  const authResult = await checkAuth(event, { requireSuperAdmin: true })
  if (!authResult.success) {
    return authResult.response
  }
  const { supabase } = authResult

  try {
    if (event.httpMethod === 'GET') {
      // フィードバック統計取得
      const params = event.queryStringParameters || {}
      const curriculumId = params.curriculumId
      const period = params.period || 'all' // 'week' | 'month' | 'all'

      // 期間フィルター
      let dateFilter = ''
      const now = new Date()
      if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        dateFilter = weekAgo.toISOString()
      } else if (period === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        dateFilter = monthAgo.toISOString()
      }

      // フィードバック一覧取得
      let query = supabase
        .from('curriculum_feedback')
        .select(`
          *,
          profile:profiles(id, name, email),
          curriculum:curricula(id, name),
          chapter:chapters(id, title)
        `)
        .order('created_at', { ascending: false })

      if (curriculumId) {
        query = query.eq('curriculum_id', curriculumId)
      }
      if (dateFilter) {
        query = query.gte('created_at', dateFilter)
      }

      const { data: feedbacks, error } = await query

      if (error) throw error

      // 統計計算
      const stats = {
        total: feedbacks?.length || 0,
        byType: {} as Record<string, number>,
        byRating: {} as Record<number, number>,
        resolved: 0,
        unresolved: 0,
        avgRating: 0,
        recentTrend: [] as { date: string; count: number }[],
      }

      let totalRating = 0
      let ratingCount = 0
      const dateCounts: Record<string, number> = {}

      feedbacks?.forEach((fb) => {
        // タイプ別
        stats.byType[fb.feedback_type] = (stats.byType[fb.feedback_type] || 0) + 1

        // 評価別
        if (fb.rating) {
          stats.byRating[fb.rating] = (stats.byRating[fb.rating] || 0) + 1
          totalRating += fb.rating
          ratingCount++
        }

        // 解決状況
        if (fb.is_resolved) {
          stats.resolved++
        } else {
          stats.unresolved++
        }

        // 日別トレンド
        const date = fb.created_at.split('T')[0]
        dateCounts[date] = (dateCounts[date] || 0) + 1
      })

      stats.avgRating = ratingCount > 0 ? totalRating / ratingCount : 0

      // 直近7日のトレンド
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const dateStr = date.toISOString().split('T')[0]
        stats.recentTrend.push({
          date: dateStr,
          count: dateCounts[dateStr] || 0,
        })
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          stats,
          feedbacks: feedbacks?.slice(0, 50) || [], // 最新50件
        }),
      }
    }

    if (event.httpMethod === 'POST') {
      // AI改善サジェスト生成
      const methodError = checkMethod(event, 'POST')
      if (methodError) return methodError

      const body = JSON.parse(event.body || '{}')
      const { feedbackId, curriculumId } = body

      // フィードバックとカリキュラム情報を取得
      let feedbacksQuery = supabase
        .from('curriculum_feedback')
        .select(`
          *,
          chapter:chapters(id, title, content)
        `)

      if (feedbackId) {
        feedbacksQuery = feedbacksQuery.eq('id', feedbackId)
      } else if (curriculumId) {
        feedbacksQuery = feedbacksQuery.eq('curriculum_id', curriculumId).eq('is_resolved', false)
      } else {
        return ErrorResponses.validationError(headers, 'フィードバックIDまたはカリキュラムIDが必要です')
      }

      const { data: feedbacks, error: fbError } = await feedbacksQuery.limit(10)
      if (fbError) throw fbError

      if (!feedbacks || feedbacks.length === 0) {
        return ErrorResponses.notFound(headers, 'フィードバック')
      }

      // カリキュラム情報取得
      const targetCurriculumId = curriculumId || feedbacks[0].curriculum_id
      const { data: curriculum } = await supabase
        .from('curricula')
        .select('id, name, description')
        .eq('id', targetCurriculumId)
        .single()

      // AIにサジェストを生成させる
      const feedbackSummary = feedbacks
        .map((fb) => `- [${fb.feedback_type}] ${fb.comment || '(コメントなし)'} (チャプター: ${fb.chapter?.title || '全般'})`)
        .join('\n')

      const result = await createCompletion({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        messages: [
          {
            role: 'user',
            content: `以下のフィードバックを分析し、カリキュラムの改善提案をしてください。

カリキュラム: ${curriculum?.name || '不明'}
概要: ${curriculum?.description || '(説明なし)'}

受け取ったフィードバック:
${feedbackSummary}

以下の形式で回答してください:
1. フィードバックの要約（共通する問題点）
2. 具体的な改善提案（3-5点）
3. 優先度の高い対応項目`,
          },
        ],
        systemPrompt: 'あなたは教育コンテンツの改善を支援するエキスパートです。受講者からのフィードバックを分析し、実践的で具体的な改善提案を行ってください。',
        maxTokens: 2048,
        temperature: 0.7,
      })

      // サジェストをDBに保存（最初のフィードバックに関連付け）
      if (feedbackId) {
        await supabase
          .from('curriculum_feedback')
          .update({
            ai_suggestion: result.content,
            ai_suggestion_generated_at: new Date().toISOString(),
          })
          .eq('id', feedbackId)
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          suggestion: result.content,
          feedbackCount: feedbacks.length,
          curriculumId: targetCurriculumId,
        }),
      }
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } }),
    }
  } catch (error) {
    console.error('Feedback stats error:', error)
    return ErrorResponses.serverError(headers, 'フィードバック統計の取得に失敗しました')
  }
}
