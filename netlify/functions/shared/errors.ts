// ============================================
// 共通エラー型
// ============================================

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'AI_ERROR'
  | 'EXTRACTION_ERROR'
  | 'SSRF_BLOCKED'

export interface ApiError {
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}

// エラーレスポンスを生成
export function createErrorResponse(
  statusCode: number,
  code: ErrorCode,
  message: string,
  headers: Record<string, string>,
  details?: Record<string, unknown>
) {
  const error: ApiError = { code, message }
  if (details) {
    error.details = details
  }
  return {
    statusCode,
    headers,
    body: JSON.stringify({ error }),
  }
}

// 標準エラーレスポンス
export const ErrorResponses = {
  unauthorized: (headers: Record<string, string>, message = '認証が必要です') =>
    createErrorResponse(401, 'UNAUTHORIZED', message, headers),

  invalidToken: (headers: Record<string, string>) =>
    createErrorResponse(401, 'UNAUTHORIZED', '無効なトークンです', headers),

  forbidden: (headers: Record<string, string>, message = 'アクセス権限がありません') =>
    createErrorResponse(403, 'FORBIDDEN', message, headers),

  superAdminRequired: (headers: Record<string, string>) =>
    createErrorResponse(403, 'FORBIDDEN', 'Super admin権限が必要です', headers),

  notFound: (headers: Record<string, string>, resource: string) =>
    createErrorResponse(404, 'NOT_FOUND', `${resource}が見つかりません`, headers),

  badRequest: (headers: Record<string, string>, message: string) =>
    createErrorResponse(400, 'BAD_REQUEST', message, headers),

  validationError: (headers: Record<string, string>, message: string, details?: Record<string, unknown>) =>
    createErrorResponse(400, 'VALIDATION_ERROR', message, headers, details),

  rateLimited: (headers: Record<string, string>) =>
    createErrorResponse(429, 'RATE_LIMITED', 'APIレート制限に達しました。しばらく待ってから再試行してください。', headers),

  serverError: (headers: Record<string, string>, message = 'サーバーエラーが発生しました') =>
    createErrorResponse(500, 'SERVER_ERROR', message, headers),

  aiError: (headers: Record<string, string>, message: string) =>
    createErrorResponse(500, 'AI_ERROR', `AI API エラー: ${message}`, headers),

  ssrfBlocked: (headers: Record<string, string>, message: string) =>
    createErrorResponse(400, 'SSRF_BLOCKED', message, headers),
}
