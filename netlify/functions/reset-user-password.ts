import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'
import { ErrorResponses } from './shared/errors'

const FUNCTION_NAME = 'reset-user-password'

interface ResetPasswordRequest {
  userId: string
  newPassword: string
  userEmail: string
  userName: string
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return createPreflightResponse(origin)
  }

  // Create Supabase admin client
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

  if (event.httpMethod !== 'POST') {
    return ErrorResponses.badRequest(headers, FUNCTION_NAME, `HTTPメソッド ${event.httpMethod} は許可されていません。POSTを使用してください。`)
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
    const body: ResetPasswordRequest = JSON.parse(event.body || '{}')

    // 必須フィールドの検証
    const missingFields: string[] = []
    if (!body.userId) missingFields.push('userId')
    if (!body.newPassword) missingFields.push('newPassword')
    if (!body.userEmail) missingFields.push('userEmail')
    if (!body.userName) missingFields.push('userName')

    if (missingFields.length > 0) {
      return ErrorResponses.validationError(
        headers,
        FUNCTION_NAME,
        `必須フィールドが不足しています: ${missingFields.join(', ')}`,
        { missingFields }
      )
    }

    // Prevent admin from resetting their own password via this endpoint
    if (body.userId === caller.id) {
      return ErrorResponses.badRequest(headers, FUNCTION_NAME, '自分自身のパスワードはこのエンドポイントではリセットできません。パスワード変更画面をご利用ください。')
    }

    // Check target user's role to prevent privilege escalation
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', body.userId)
      .single()

    // group_admin cannot reset password of super_admin or other group_admin
    if (callerProfile?.role === 'group_admin') {
      if (targetProfile?.role === 'super_admin' || targetProfile?.role === 'group_admin') {
        return ErrorResponses.forbidden(headers, FUNCTION_NAME, 'group_adminは上位権限（super_adminまたは他のgroup_admin）のユーザーのパスワードをリセットできません。')
      }
    }

    // Update user password using admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      body.userId,
      { password: body.newPassword }
    )

    if (updateError) {
      console.error('Password update error:', updateError)
      return ErrorResponses.databaseError(
        headers,
        FUNCTION_NAME,
        'パスワード更新',
        `パスワードの更新に失敗しました: ${updateError.message}`
      )
    }

    // Set must_change_password to true
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', body.userId)

    if (profileError) {
      console.error('Profile update error:', profileError)
      return ErrorResponses.databaseError(
        headers,
        FUNCTION_NAME,
        'Profile更新',
        `must_change_passwordフラグの設定に失敗しました: ${profileError.message}`
      )
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    }
  } catch (error) {
    console.error('Reset password error:', error)
    return ErrorResponses.serverError(
      headers,
      FUNCTION_NAME,
      'リクエスト処理',
      `予期しないエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`
    )
  }
}

export { handler }
