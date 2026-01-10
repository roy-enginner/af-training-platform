import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'
import { ErrorResponses } from './shared/errors'

const FUNCTION_NAME = 'abort-curriculum-job'

/**
 * カリキュラム生成ジョブをアボートするAPI
 *
 * super_adminは自分のジョブ以外もアボート可能
 */
const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return createPreflightResponse(origin)
  }

  // 環境変数チェック
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables')
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

  // 認証確認
  const authHeader = event.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return ErrorResponses.unauthorized(headers, FUNCTION_NAME, 'Authorizationヘッダーが必要です。')
  }

  const token = authHeader.split(' ')[1]
  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !caller) {
    return ErrorResponses.invalidToken(headers, FUNCTION_NAME)
  }

  // 権限確認（super_adminのみ）
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.role !== 'super_admin') {
    return ErrorResponses.superAdminRequired(headers, FUNCTION_NAME)
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { jobId } = body

    if (!jobId) {
      return ErrorResponses.validationError(headers, FUNCTION_NAME, '削除対象のジョブID（jobId）が必要です。')
    }

    // ジョブを取得
    const { data: job, error: fetchError } = await supabaseAdmin
      .from('curriculum_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (fetchError || !job) {
      return ErrorResponses.notFound(headers, FUNCTION_NAME, 'ジョブ')
    }

    // 既に完了またはエラーの場合はスキップ
    if (job.status === 'completed' || job.status === 'failed') {
      return ErrorResponses.badRequest(
        headers,
        FUNCTION_NAME,
        `ジョブは既に${job.status === 'completed' ? '完了' : '失敗'}しています。中断できるのは処理中のジョブのみです。`
      )
    }

    // ジョブをアボート状態に更新
    const { error: updateError } = await supabaseAdmin
      .from('curriculum_generation_jobs')
      .update({
        status: 'failed',
        progress: 0,
        current_step: 'ユーザーによって中断されました',
        error_message: 'ユーザーによってジョブが中断されました',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    if (updateError) {
      console.error('Failed to abort job:', updateError)
      return ErrorResponses.databaseError(
        headers,
        FUNCTION_NAME,
        'ジョブステータス更新',
        `ジョブのアボートに失敗しました: ${updateError.message}`
      )
    }

    console.log(`Job aborted: ${jobId}`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'ジョブを中断しました',
      }),
    }
  } catch (error) {
    console.error('Error aborting job:', error)
    return ErrorResponses.serverError(
      headers,
      FUNCTION_NAME,
      'リクエスト処理',
      `予期しないエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`
    )
  }
}

export { handler }
