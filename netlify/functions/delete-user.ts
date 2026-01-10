import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'
import { ErrorResponses } from './shared/errors'

const FUNCTION_NAME = 'delete-user'

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return createPreflightResponse(origin)
  }

  // Create Supabase admin client inside handler to ensure env vars are available
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables:', { supabaseUrl: !!supabaseUrl, supabaseServiceKey: !!supabaseServiceKey })
    return ErrorResponses.configError(headers, FUNCTION_NAME, 'VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  if (event.httpMethod !== 'DELETE') {
    return ErrorResponses.badRequest(headers, FUNCTION_NAME, `HTTPメソッド ${event.httpMethod} は許可されていません。DELETEを使用してください。`)
  }

  // Verify authorization
  const authHeader = event.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return ErrorResponses.unauthorized(headers, FUNCTION_NAME, 'Authorizationヘッダーが必要です。')
  }

  const token = authHeader.split(' ')[1]
  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !caller) {
    return ErrorResponses.invalidToken(headers, FUNCTION_NAME)
  }

  // Verify caller is admin
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.role !== 'super_admin' && callerProfile?.role !== 'group_admin') {
    return ErrorResponses.groupAdminRequired(headers, FUNCTION_NAME)
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const userId = body.userId

    if (!userId) {
      return ErrorResponses.validationError(headers, FUNCTION_NAME, '削除対象のユーザーID（userId）が必要です。')
    }

    // Prevent self-deletion
    if (userId === caller.id) {
      return ErrorResponses.badRequest(headers, FUNCTION_NAME, '自分自身を削除することはできません。')
    }

    // Check target user's role to prevent privilege escalation
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    // group_admin cannot delete super_admin or other group_admin
    if (callerProfile?.role === 'group_admin') {
      if (targetProfile?.role === 'super_admin' || targetProfile?.role === 'group_admin') {
        return ErrorResponses.forbidden(headers, FUNCTION_NAME, 'group_adminは上位権限（super_adminまたは他のgroup_admin）のユーザーを削除できません。')
      }
    }

    // Delete user from Supabase Auth (profile will be deleted via cascade)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      return ErrorResponses.databaseError(
        headers,
        FUNCTION_NAME,
        'Auth User削除',
        `認証ユーザーの削除に失敗しました: ${deleteError.message}`
      )
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    }
  } catch (error) {
    console.error('Error deleting user:', error)
    return ErrorResponses.serverError(
      headers,
      FUNCTION_NAME,
      'リクエスト処理',
      `予期しないエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`
    )
  }
}

export { handler }
