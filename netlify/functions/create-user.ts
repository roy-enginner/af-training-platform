import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'
import { ErrorResponses } from './shared/errors'

const FUNCTION_NAME = 'create-user'

interface CreateUserRequest {
  email: string
  password: string
  name: string
  role: 'super_admin' | 'group_admin' | 'trainee'
  group_id?: string
}

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
    const body: CreateUserRequest = JSON.parse(event.body || '{}')

    // 必須フィールドの検証
    const missingFields: string[] = []
    if (!body.email) missingFields.push('email')
    if (!body.password) missingFields.push('password')
    if (!body.name) missingFields.push('name')
    if (!body.role) missingFields.push('role')

    if (missingFields.length > 0) {
      return ErrorResponses.validationError(
        headers,
        FUNCTION_NAME,
        `必須フィールドが不足しています: ${missingFields.join(', ')}`,
        { missingFields }
      )
    }

    // Create auth user
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    })

    if (createError) {
      return ErrorResponses.databaseError(
        headers,
        FUNCTION_NAME,
        'Auth User作成',
        `認証ユーザーの作成に失敗しました: ${createError.message}`
      )
    }

    // Update profile (created by database trigger)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        email: body.email,
        name: body.name,
        role: body.role,
        group_id: body.group_id || null,
        must_change_password: true, // Force password change on first login
      })
      .eq('id', authData.user.id)
      .select()
      .single()

    if (profileError) {
      console.error('Profile update error:', profileError)
      // Rollback: delete auth user if profile update fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return ErrorResponses.databaseError(
        headers,
        FUNCTION_NAME,
        'Profile更新',
        `プロフィールの更新に失敗しました（認証ユーザーはロールバック済み）: ${profileError.message}`
      )
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ user: authData.user, profile }),
    }
  } catch (error) {
    console.error('Unexpected error in create-user:', error)
    return ErrorResponses.serverError(
      headers,
      FUNCTION_NAME,
      'リクエスト処理',
      `予期しないエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`
    )
  }
}

export { handler }
