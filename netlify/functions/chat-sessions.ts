// ============================================
// チャットセッション CRUD API
// GET/POST/DELETE /api/chat-sessions
// ============================================

import type { Handler, HandlerEvent } from '@netlify/functions'
import { checkAuth, handlePreflight, createSupabaseAdmin } from './shared/auth'
import { getCorsHeaders } from './shared/cors'
import { ErrorResponses } from './shared/errors'

// ============================================
// ハンドラー
// ============================================
export const handler: Handler = async (event: HandlerEvent) => {
  // プリフライト処理
  const preflightResponse = handlePreflight(event)
  if (preflightResponse) return preflightResponse

  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // 認証チェック（trainee以上）
  const authResult = await checkAuth(event, {
    allowedRoles: ['super_admin', 'group_admin', 'trainee'],
  })
  if (!authResult.success) {
    return authResult.response
  }
  const { user, supabase, role } = authResult

  try {
    switch (event.httpMethod) {
      case 'GET':
        return handleGet(event, supabase, user.id, role, headers)
      case 'POST':
        return handlePost(event, supabase, user.id, headers)
      case 'DELETE':
        return handleDelete(event, supabase, user.id, headers)
      case 'PATCH':
        return handlePatch(event, supabase, user.id, headers)
      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } }),
        }
    }
  } catch (error) {
    console.error('Chat sessions error:', error)
    return ErrorResponses.serverError(headers, 'セッション操作に失敗しました')
  }
}

// ============================================
// GET: セッション一覧取得
// ============================================
async function handleGet(
  event: HandlerEvent,
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  role: string,
  headers: Record<string, string>
) {
  const params = event.queryStringParameters || {}
  const sessionId = params.id
  const sessionType = params.type as 'learning' | 'qa' | 'general' | undefined
  const curriculumId = params.curriculumId
  const limit = Math.min(parseInt(params.limit || '20', 10), 100)
  const offset = parseInt(params.offset || '0', 10)
  const includeMessages = params.includeMessages === 'true'

  // 単一セッション取得
  if (sessionId) {
    let query = supabase
      .from('chat_sessions')
      .select(`
        *,
        ai_model:ai_models(id, display_name, provider, model_id)
      `)
      .eq('id', sessionId)

    // super_admin以外は自分のセッションのみ
    if (role !== 'super_admin') {
      query = query.eq('profile_id', userId)
    }

    const { data: session, error } = await query.single()

    if (error || !session) {
      return ErrorResponses.notFound(headers, 'セッション')
    }

    // メッセージも取得する場合
    if (includeMessages) {
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('id, role, content, input_tokens, output_tokens, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ session: { ...session, messages: messages || [] } }),
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ session }),
    }
  }

  // セッション一覧取得
  let query = supabase
    .from('chat_sessions')
    .select(`
      id,
      session_type,
      status,
      title,
      curriculum_id,
      chapter_id,
      started_at,
      last_message_at,
      ai_model:ai_models(id, display_name, provider)
    `, { count: 'exact' })
    .eq('profile_id', userId)
    .order('last_message_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // フィルター
  if (sessionType) {
    query = query.eq('session_type', sessionType)
  }
  if (curriculumId) {
    query = query.eq('curriculum_id', curriculumId)
  }

  const { data: sessions, error, count } = await query

  if (error) {
    console.error('Failed to fetch sessions:', error)
    return ErrorResponses.serverError(headers, 'セッションの取得に失敗しました')
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      sessions: sessions || [],
      total: count || 0,
      limit,
      offset,
    }),
  }
}

// ============================================
// POST: 新規セッション作成
// ============================================
async function handlePost(
  event: HandlerEvent,
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  headers: Record<string, string>
) {
  const body = JSON.parse(event.body || '{}')
  const {
    sessionType = 'learning',
    curriculumId,
    chapterId,
    title,
    aiModelId,
  } = body

  // セッション作成
  const { data: session, error } = await supabase
    .from('chat_sessions')
    .insert({
      profile_id: userId,
      session_type: sessionType,
      status: 'active',
      curriculum_id: curriculumId || null,
      chapter_id: chapterId || null,
      ai_model_id: aiModelId || null,
      title: title || null,
      started_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) {
    console.error('Failed to create session:', error)
    return ErrorResponses.serverError(headers, 'セッションの作成に失敗しました')
  }

  return {
    statusCode: 201,
    headers,
    body: JSON.stringify({ session }),
  }
}

// ============================================
// PATCH: セッション更新
// ============================================
async function handlePatch(
  event: HandlerEvent,
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  headers: Record<string, string>
) {
  const body = JSON.parse(event.body || '{}')
  const { sessionId, title, status } = body

  if (!sessionId) {
    return ErrorResponses.validationError(headers, 'セッションIDが必要です')
  }

  // 所有者チェック
  const { data: existing } = await supabase
    .from('chat_sessions')
    .select('profile_id')
    .eq('id', sessionId)
    .single()

  if (!existing || existing.profile_id !== userId) {
    return ErrorResponses.forbidden(headers, 'このセッションを更新する権限がありません')
  }

  // 更新データ構築
  const updateData: Record<string, unknown> = {}
  if (title !== undefined) updateData.title = title
  if (status !== undefined) {
    updateData.status = status
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString()
    }
  }

  const { data: session, error } = await supabase
    .from('chat_sessions')
    .update(updateData)
    .eq('id', sessionId)
    .select('*')
    .single()

  if (error) {
    console.error('Failed to update session:', error)
    return ErrorResponses.serverError(headers, 'セッションの更新に失敗しました')
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ session }),
  }
}

// ============================================
// DELETE: セッション削除
// ============================================
async function handleDelete(
  event: HandlerEvent,
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  headers: Record<string, string>
) {
  const params = event.queryStringParameters || {}
  const sessionId = params.id

  if (!sessionId) {
    return ErrorResponses.validationError(headers, 'セッションIDが必要です')
  }

  // 所有者チェック
  const { data: existing } = await supabase
    .from('chat_sessions')
    .select('profile_id')
    .eq('id', sessionId)
    .single()

  if (!existing) {
    return ErrorResponses.notFound(headers, 'セッション')
  }

  if (existing.profile_id !== userId) {
    return ErrorResponses.forbidden(headers, 'このセッションを削除する権限がありません')
  }

  // セッション削除（関連メッセージはCASCADEで削除）
  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', sessionId)

  if (error) {
    console.error('Failed to delete session:', error)
    return ErrorResponses.serverError(headers, 'セッションの削除に失敗しました')
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true }),
  }
}
