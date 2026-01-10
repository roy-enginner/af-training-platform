import { supabase } from './supabase'

/**
 * APIエラークラス
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Netlify Functions を呼び出す共通ユーティリティ
 * - 認証トークンを自動付与
 * - JSONレスポンスでない場合のエラーハンドリング
 * - エラーメッセージの統一
 */
export async function apiCall<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: unknown
    requireAuth?: boolean
  } = {}
): Promise<T> {
  const { method = 'POST', body, requireAuth = true } = options

  // ヘッダーを構築
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // 認証トークンを取得して付与
  if (requireAuth) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new ApiError('ログインセッションが切れています。再ログインしてください。', 401, 'SESSION_EXPIRED')
    }
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  // APIを呼び出し
  const response = await fetch(`/.netlify/functions/${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // レスポンスがJSONかどうか確認
  const contentType = response.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    console.error(`API Error: Unexpected response type for ${endpoint}`, {
      contentType,
      status: response.status,
    })

    if (response.status === 404) {
      throw new ApiError(
        'APIエンドポイントが見つかりません。デプロイを確認してください。',
        404,
        'NOT_FOUND'
      )
    }

    throw new ApiError(
      `[API通信] サーバーエラーが発生しました (HTTP ${response.status})。レスポンスがJSONではありません。Netlifyの関数ログを確認してください。`,
      response.status,
      'SERVER_ERROR'
    )
  }

  // JSONをパース
  const result = await response.json()

  // エラーレスポンスの処理
  if (!response.ok) {
    throw new ApiError(
      result.error || `リクエストに失敗しました (${response.status})`,
      response.status,
      result.code
    )
  }

  return result as T
}

/**
 * GET リクエスト用のショートハンド
 */
export async function apiGet<T>(
  endpoint: string,
  options: { requireAuth?: boolean } = {}
): Promise<T> {
  return apiCall<T>(endpoint, { method: 'GET', ...options })
}

/**
 * POST リクエスト用のショートハンド
 */
export async function apiPost<T>(
  endpoint: string,
  body?: unknown,
  options: { requireAuth?: boolean } = {}
): Promise<T> {
  return apiCall<T>(endpoint, { method: 'POST', body, ...options })
}
