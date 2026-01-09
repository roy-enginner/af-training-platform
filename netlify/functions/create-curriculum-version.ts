import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

interface VersionRequest {
  curriculumId: string
  changeSummary?: string
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

  // 認証チェック
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

  // super_admin権限チェック
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
    const body: VersionRequest = JSON.parse(event.body || '{}')

    if (!body.curriculumId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'カリキュラムIDを指定してください' }),
      }
    }

    // カリキュラム情報を取得
    const { data: curriculum, error: curriculumError } = await supabaseAdmin
      .from('curricula')
      .select('*')
      .eq('id', body.curriculumId)
      .single()

    if (curriculumError || !curriculum) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'カリキュラムが見つかりません' }),
      }
    }

    // チャプター情報を取得
    const { data: chapters, error: chaptersError } = await supabaseAdmin
      .from('chapters')
      .select('*')
      .eq('curriculum_id', body.curriculumId)
      .order('sort_order')

    if (chaptersError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'チャプターの取得に失敗しました' }),
      }
    }

    // 現在のバージョン番号を取得
    const { data: latestVersion } = await supabaseAdmin
      .from('curriculum_versions')
      .select('version_number')
      .eq('curriculum_id', body.curriculumId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single()

    const newVersionNumber = (latestVersion?.version_number || 0) + 1

    // スナップショットを作成
    const contentSnapshot = {
      curriculum: {
        name: curriculum.name,
        description: curriculum.description,
        content_type: curriculum.content_type,
        content_url: curriculum.content_url,
        duration_minutes: curriculum.duration_minutes,
        difficulty_level: curriculum.difficulty_level,
        tags: curriculum.tags,
        series_id: curriculum.series_id,
        series_order: curriculum.series_order,
        part_title: curriculum.part_title,
        generation_params: curriculum.generation_params,
      },
      chapters: chapters?.map(ch => ({
        title: ch.title,
        content: ch.content,
        task_description: ch.task_description,
        estimated_minutes: ch.estimated_minutes,
        sort_order: ch.sort_order,
        is_active: ch.is_active,
      })) || [],
      snapshotAt: new Date().toISOString(),
    }

    // バージョンを作成
    const { data: version, error: versionError } = await supabaseAdmin
      .from('curriculum_versions')
      .insert({
        curriculum_id: body.curriculumId,
        version_number: newVersionNumber,
        content_snapshot: contentSnapshot,
        change_summary: body.changeSummary || null,
        created_by: caller.id,
      })
      .select()
      .single()

    if (versionError) {
      console.error('Failed to create version:', versionError)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'バージョンの作成に失敗しました' }),
      }
    }

    // カリキュラムのcurrent_versionを更新
    await supabaseAdmin
      .from('curricula')
      .update({ current_version: newVersionNumber })
      .eq('id', body.curriculumId)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: `バージョン${newVersionNumber}を作成しました`,
        version: {
          id: version.id,
          versionNumber: newVersionNumber,
          changeSummary: body.changeSummary || null,
          createdAt: version.created_at,
        },
      }),
    }

  } catch (error) {
    console.error('Error creating curriculum version:', error)

    const errorMessage = error instanceof Error ? error.message : 'バージョン作成中にエラーが発生しました'
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage }),
    }
  }
}

export { handler }
