import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

// リクエスト型
interface UploadMaterialRequest {
  name: string
  materialType: 'pdf' | 'url' | 'text' | 'markdown' | 'excel'
  // ファイルアップロードの場合
  storagePath?: string
  originalFilename?: string
  fileSizeBytes?: number
  mimeType?: string
  // URLの場合
  originalUrl?: string
  // テキスト/Markdownの直接入力の場合
  textContent?: string
  // メタデータ
  tags?: string[]
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
    const body: UploadMaterialRequest = JSON.parse(event.body || '{}')

    // バリデーション
    if (!body.name || body.name.trim().length < 1) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '資料名を入力してください' }),
      }
    }

    if (!body.materialType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '資料タイプを指定してください' }),
      }
    }

    // 資料タイプに応じたバリデーション
    if (['pdf', 'excel'].includes(body.materialType)) {
      if (!body.storagePath) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'ファイルのストレージパスが必要です' }),
        }
      }
    } else if (body.materialType === 'url') {
      if (!body.originalUrl) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'URLを入力してください' }),
        }
      }
      // 簡易的なURL検証
      try {
        new URL(body.originalUrl)
      } catch {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: '有効なURLを入力してください' }),
        }
      }
    } else if (['text', 'markdown'].includes(body.materialType)) {
      if (!body.textContent && !body.storagePath) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'テキスト内容を入力してください' }),
        }
      }
    }

    // source_materialsレコードを作成
    const insertData: Record<string, unknown> = {
      name: body.name.trim(),
      material_type: body.materialType,
      storage_path: body.storagePath || null,
      original_filename: body.originalFilename || null,
      original_url: body.originalUrl || null,
      file_size_bytes: body.fileSizeBytes || null,
      mime_type: body.mimeType || null,
      tags: body.tags || null,
      uploaded_by: caller.id,
      extraction_status: 'pending',
      is_active: true,
    }

    // テキスト/Markdown直接入力の場合は即座にextracted_textを設定
    if (['text', 'markdown'].includes(body.materialType) && body.textContent) {
      insertData.extracted_text = body.textContent
      insertData.extraction_status = 'completed'
      insertData.extracted_at = new Date().toISOString()
      insertData.metadata = {
        char_count: body.textContent.length,
        word_count: body.textContent.split(/\s+/).filter(Boolean).length,
      }
    }

    const { data: material, error: insertError } = await supabaseAdmin
      .from('source_materials')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      console.error('Failed to insert source_material:', insertError)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '資料の登録に失敗しました' }),
      }
    }

    // URLの場合は非同期でコンテンツ取得を開始（別の関数で処理）
    // PDF/Excelの場合も非同期でテキスト抽出を開始（別の関数で処理）
    // ここでは登録のみ行い、抽出は別途実行する

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        material,
        message: '資料を登録しました',
      }),
    }
  } catch (error) {
    console.error('Error uploading material:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '資料の登録中にエラーが発生しました' }),
    }
  }
}

export { handler }
