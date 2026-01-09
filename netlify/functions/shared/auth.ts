import type { HandlerEvent } from '@netlify/functions'
import { createClient, SupabaseClient, User } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './cors'
import { ErrorResponses } from './errors'

// ============================================
// Supabaseクライアント初期化
// ============================================
export function createSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables')
    return null
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// ============================================
// 認証結果の型
// ============================================
export interface AuthResult {
  success: true
  user: User
  role: string
  supabase: SupabaseClient
}

export interface AuthError {
  success: false
  response: {
    statusCode: number
    headers: Record<string, string>
    body: string
  }
}

export type AuthCheckResult = AuthResult | AuthError

// ============================================
// 認証チェック
// ============================================
export async function checkAuth(
  event: HandlerEvent,
  options: {
    requireSuperAdmin?: boolean
    allowedRoles?: string[]
  } = {}
): Promise<AuthCheckResult> {
  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // Supabaseクライアント初期化
  const supabase = createSupabaseAdmin()
  if (!supabase) {
    return {
      success: false,
      response: ErrorResponses.serverError(headers, 'サーバー設定エラー'),
    }
  }

  // Authorizationヘッダーチェック
  const authHeader = event.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      success: false,
      response: ErrorResponses.unauthorized(headers),
    }
  }

  // トークン検証
  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return {
      success: false,
      response: ErrorResponses.invalidToken(headers),
    }
  }

  // プロファイル取得
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role || 'trainee'

  // super_admin権限チェック
  if (options.requireSuperAdmin && role !== 'super_admin') {
    return {
      success: false,
      response: ErrorResponses.superAdminRequired(headers),
    }
  }

  // 許可されたロールチェック
  if (options.allowedRoles && !options.allowedRoles.includes(role)) {
    return {
      success: false,
      response: ErrorResponses.forbidden(headers),
    }
  }

  return {
    success: true,
    user,
    role,
    supabase,
  }
}

// ============================================
// プリフライトハンドラー
// ============================================
export function handlePreflight(event: HandlerEvent) {
  if (event.httpMethod === 'OPTIONS') {
    return createPreflightResponse(event.headers.origin)
  }
  return null
}

// ============================================
// メソッドチェック
// ============================================
export function checkMethod(
  event: HandlerEvent,
  allowedMethod: string
): { statusCode: number; headers: Record<string, string>; body: string } | null {
  if (event.httpMethod !== allowedMethod) {
    const headers = getCorsHeaders(event.headers.origin)
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } }),
    }
  }
  return null
}
