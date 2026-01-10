import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' }),
    }
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  // 認証確認
  const authHeader = event.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Unauthorized' }),
    }
  }

  const token = authHeader.split(' ')[1]
  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !caller) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Invalid token' }),
    }
  }

  // 権限確認（super_adminのみ）
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.role !== 'super_admin') {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Super admin access required' }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { jobId } = body

    if (!jobId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'jobId is required' }),
      }
    }

    // ジョブを取得
    const { data: job, error: fetchError } = await supabaseAdmin
      .from('curriculum_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (fetchError || !job) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'ジョブが見つかりません' }),
      }
    }

    // 既に完了またはエラーの場合はスキップ
    if (job.status === 'completed' || job.status === 'failed') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `ジョブは既に${job.status === 'completed' ? '完了' : '失敗'}しています`,
        }),
      }
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
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'ジョブのアボートに失敗しました' }),
      }
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'ジョブのアボート中にエラーが発生しました' }),
    }
  }
}

export { handler }
