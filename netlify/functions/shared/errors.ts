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
  | 'AI_TIMEOUT'
  | 'AI_AUTH_ERROR'
  | 'AI_RATE_LIMITED'
  | 'AI_PARSE_ERROR'
  | 'DATABASE_ERROR'
  | 'CONFIG_ERROR'
  | 'EXTRACTION_ERROR'
  | 'SSRF_BLOCKED'
  | 'EMAIL_ERROR'

export interface ApiError {
  code: ErrorCode
  message: string
  // エラーの発生箇所
  location?: {
    // 関数名
    functionName: string
    // 処理フェーズ
    phase?: string
  }
  details?: Record<string, unknown>
}

/**
 * 構造化されたエラーメッセージを生成
 *
 * 形式: [関数名/フェーズ] メッセージ
 */
export function formatErrorMessage(
  functionName: string,
  phase: string | undefined,
  message: string
): string {
  const prefix = phase ? `[${functionName}/${phase}]` : `[${functionName}]`
  return `${prefix} ${message}`
}

// エラーレスポンスを生成
export function createErrorResponse(
  statusCode: number,
  code: ErrorCode,
  message: string,
  headers: Record<string, string>,
  details?: Record<string, unknown>,
  location?: { functionName: string; phase?: string }
) {
  const error: ApiError = { code, message }
  if (details) {
    error.details = details
  }
  if (location) {
    error.location = location
  }
  return {
    statusCode,
    headers,
    body: JSON.stringify({ error: error.message, code: error.code, location: error.location, details: error.details }),
  }
}

/**
 * 詳細なエラーレスポンスを生成
 *
 * @param functionName - 関数名（例: 'create-user'）
 * @param phase - 処理フェーズ（例: '認証確認', 'DB保存'）
 * @param statusCode - HTTPステータスコード
 * @param code - エラーコード
 * @param message - エラーメッセージ
 * @param headers - CORSヘッダー
 * @param details - 追加詳細
 */
export function createDetailedErrorResponse(
  functionName: string,
  phase: string,
  statusCode: number,
  code: ErrorCode,
  message: string,
  headers: Record<string, string>,
  details?: Record<string, unknown>
) {
  const formattedMessage = formatErrorMessage(functionName, phase, message)
  return createErrorResponse(statusCode, code, formattedMessage, headers, details, { functionName, phase })
}

// 標準エラーレスポンス（関数名付きバージョン）
export const ErrorResponses = {
  // 認証エラー
  unauthorized: (headers: Record<string, string>, functionName: string, message = '認証トークンが必要です') =>
    createDetailedErrorResponse(functionName, '認証確認', 401, 'UNAUTHORIZED', message, headers),

  invalidToken: (headers: Record<string, string>, functionName: string) =>
    createDetailedErrorResponse(functionName, '認証確認', 401, 'UNAUTHORIZED', '認証トークンが無効または期限切れです。再ログインしてください。', headers),

  // 権限エラー
  forbidden: (headers: Record<string, string>, functionName: string, message = 'この操作を実行する権限がありません') =>
    createDetailedErrorResponse(functionName, '権限確認', 403, 'FORBIDDEN', message, headers),

  superAdminRequired: (headers: Record<string, string>, functionName: string) =>
    createDetailedErrorResponse(functionName, '権限確認', 403, 'FORBIDDEN', 'この操作にはsuper_admin権限が必要です。', headers),

  groupAdminRequired: (headers: Record<string, string>, functionName: string) =>
    createDetailedErrorResponse(functionName, '権限確認', 403, 'FORBIDDEN', 'この操作にはgroup_admin以上の権限が必要です。', headers),

  // リソースエラー
  notFound: (headers: Record<string, string>, functionName: string, resource: string) =>
    createDetailedErrorResponse(functionName, 'リソース取得', 404, 'NOT_FOUND', `指定された${resource}が見つかりません。IDを確認してください。`, headers),

  // 入力検証エラー
  badRequest: (headers: Record<string, string>, functionName: string, message: string) =>
    createDetailedErrorResponse(functionName, '入力検証', 400, 'BAD_REQUEST', message, headers),

  validationError: (headers: Record<string, string>, functionName: string, message: string, details?: Record<string, unknown>) =>
    createDetailedErrorResponse(functionName, '入力検証', 400, 'VALIDATION_ERROR', message, headers, details),

  // レート制限
  rateLimited: (headers: Record<string, string>, functionName: string) =>
    createDetailedErrorResponse(functionName, 'API呼び出し', 429, 'RATE_LIMITED', 'APIレート制限に達しました。しばらく待ってから再試行してください。', headers),

  // サーバーエラー
  serverError: (headers: Record<string, string>, functionName: string, phase: string, message = '予期しないエラーが発生しました') =>
    createDetailedErrorResponse(functionName, phase, 500, 'SERVER_ERROR', message, headers),

  // 環境設定エラー
  configError: (headers: Record<string, string>, functionName: string, missingVar: string) =>
    createDetailedErrorResponse(functionName, '環境設定確認', 500, 'CONFIG_ERROR', `環境変数 ${missingVar} が設定されていません。Netlifyの環境変数を確認してください。`, headers),

  // データベースエラー
  databaseError: (headers: Record<string, string>, functionName: string, operation: string, detail: string) =>
    createDetailedErrorResponse(functionName, `DB/${operation}`, 500, 'DATABASE_ERROR', detail, headers),

  // AI APIエラー
  aiError: (headers: Record<string, string>, functionName: string, message: string) =>
    createDetailedErrorResponse(functionName, 'AI生成', 500, 'AI_ERROR', message, headers),

  aiTimeout: (headers: Record<string, string>, functionName: string) =>
    createDetailedErrorResponse(functionName, 'AI生成', 504, 'AI_TIMEOUT', 'AI APIがタイムアウトしました。処理に時間がかかる場合は、入力を短くして再試行してください。', headers),

  aiRateLimited: (headers: Record<string, string>, functionName: string) =>
    createDetailedErrorResponse(functionName, 'AI生成', 429, 'AI_RATE_LIMITED', 'AI APIのレート制限に達しました。しばらく待ってから再試行してください。', headers),

  aiAuthError: (headers: Record<string, string>, functionName: string) =>
    createDetailedErrorResponse(functionName, 'AI生成', 500, 'AI_AUTH_ERROR', 'AI APIの認証に失敗しました。ANTHROPIC_API_KEYを確認してください。', headers),

  aiParseError: (headers: Record<string, string>, functionName: string) =>
    createDetailedErrorResponse(functionName, 'AI応答解析', 500, 'AI_PARSE_ERROR', 'AIの応答をJSON形式に解析できませんでした。再試行してください。', headers),

  // セキュリティエラー
  ssrfBlocked: (headers: Record<string, string>, functionName: string, message: string) =>
    createDetailedErrorResponse(functionName, 'セキュリティ検証', 400, 'SSRF_BLOCKED', message, headers),

  // メールエラー
  emailError: (headers: Record<string, string>, functionName: string, detail: string) =>
    createDetailedErrorResponse(functionName, 'メール送信', 500, 'EMAIL_ERROR', detail, headers),
}

/**
 * Anthropic API エラーを解析してエラーレスポンスを生成
 */
export function handleAnthropicError(
  error: { status?: number; message: string },
  headers: Record<string, string>,
  functionName: string
) {
  if (error.status === 429) {
    return ErrorResponses.aiRateLimited(headers, functionName)
  } else if (error.status === 401) {
    return ErrorResponses.aiAuthError(headers, functionName)
  } else if (error.status === 500 || error.status === 503) {
    return createDetailedErrorResponse(
      functionName,
      'AI生成',
      500,
      'AI_ERROR',
      'AI APIが一時的に利用できません。しばらく待ってから再試行してください。',
      headers
    )
  } else if (error.status === 408 || error.message?.includes('timeout')) {
    return ErrorResponses.aiTimeout(headers, functionName)
  } else {
    return createDetailedErrorResponse(
      functionName,
      'AI生成',
      500,
      'AI_ERROR',
      `AI APIエラー (HTTP ${error.status}): ${error.message}`,
      headers
    )
  }
}
