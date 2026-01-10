import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

// ジョブ作成リクエストの型
interface CreateJobRequest {
  jobType: 'structure' | 'content'
  goal: string
  targetAudience?: string
  durationMinutes?: number
  difficultyLevel?: 'beginner' | 'intermediate' | 'advanced'
  // コンテンツ生成用（構成承認後）
  structure?: {
    name: string
    description: string
    chapters: Array<{
      title: string
      summary: string
      learningObjectives: string[]
      estimatedMinutes: number
    }>
    tags: string[]
  }
}

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
    const body: CreateJobRequest = JSON.parse(event.body || '{}')

    // バリデーション
    if (!body.jobType || !['structure', 'content'].includes(body.jobType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid job type' }),
      }
    }

    if (!body.goal || body.goal.trim().length < 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '研修ゴールを10文字以上で入力してください' }),
      }
    }

    // 同時実行制限（1ユーザー1ジョブまで）
    const { data: existingJobs } = await supabaseAdmin
      .from('curriculum_generation_jobs')
      .select('id')
      .eq('user_id', caller.id)
      .in('status', ['queued', 'connecting', 'generating', 'parsing'])

    if (existingJobs && existingJobs.length > 0) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ error: '既に処理中のジョブがあります。完了をお待ちください。' }),
      }
    }

    // ジョブを作成
    const inputParams = {
      goal: body.goal,
      targetAudience: body.targetAudience || '企業の一般社員',
      durationMinutes: body.durationMinutes || 60,
      difficultyLevel: body.difficultyLevel || 'beginner',
      ...(body.structure && { structure: body.structure }),
    }

    const { data: job, error: insertError } = await supabaseAdmin
      .from('curriculum_generation_jobs')
      .insert({
        user_id: caller.id,
        job_type: body.jobType,
        status: 'queued',
        progress: 0,
        current_step: 'ジョブをキューに追加しました',
        input_params: inputParams,
      })
      .select()
      .single()

    if (insertError || !job) {
      console.error('Failed to create job:', insertError)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'ジョブの作成に失敗しました' }),
      }
    }

    // Background Functionを呼び出し（非同期）
    // Netlify Background Functionは `-background` サフィックスで自動的に非同期実行される
    const backgroundFunctionUrl = body.jobType === 'structure'
      ? `${process.env.URL || 'http://localhost:4444'}/.netlify/functions/process-curriculum-structure-background`
      : `${process.env.URL || 'http://localhost:4444'}/.netlify/functions/process-curriculum-content-background`

    // Background Functionを非同期で呼び出し（レスポンスを待たない）
    fetch(backgroundFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId: job.id }),
    }).catch(err => {
      console.error('Failed to trigger background function:', err)
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        jobId: job.id,
        status: job.status,
        message: 'ジョブを開始しました',
      }),
    }
  } catch (error) {
    console.error('Error creating job:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'ジョブの作成中にエラーが発生しました' }),
    }
  }
}

export { handler }
