import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

// ファイル検証用の定数
const MAX_FILE_SIZE_BYTES = 52428800 // 50MB

// 許可されたMIMEタイプ
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  excel: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
  ],
  text: ['text/plain'],
  markdown: ['text/plain', 'text/markdown', 'text/x-markdown'],
}

// ファイル拡張子とMIMEタイプのマッピング
const EXTENSION_TO_MIME: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.xls': ['application/vnd.ms-excel'],
  '.txt': ['text/plain'],
  '.md': ['text/plain', 'text/markdown', 'text/x-markdown'],
  '.markdown': ['text/plain', 'text/markdown', 'text/x-markdown'],
}

// ファイル名の検証（パストラバーサル防止）
function isValidFilename(filename: string): boolean {
  // パストラバーサル攻撃の防止
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false
  }
  // 制御文字のブロック
  if (/[\x00-\x1f\x7f]/.test(filename)) {
    return false
  }
  // 空白のみのファイル名を拒否
  if (filename.trim().length === 0) {
    return false
  }
  return true
}

// MIMEタイプとファイル拡張子の整合性チェック
function validateMimeType(materialType: string, mimeType: string | undefined, filename: string | undefined): { valid: boolean; error?: string } {
  if (!mimeType) {
    return { valid: true } // MIMEタイプが未指定の場合はスキップ（テキスト入力等）
  }

  // materialTypeに対する許可されたMIMEタイプをチェック
  const allowedMimes = ALLOWED_MIME_TYPES[materialType]
  if (allowedMimes && !allowedMimes.includes(mimeType)) {
    return {
      valid: false,
      error: `許可されていないファイル形式です: ${mimeType}`,
    }
  }

  // ファイル名がある場合、拡張子とMIMEタイプの整合性をチェック
  if (filename) {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    const expectedMimes = EXTENSION_TO_MIME[ext]
    if (expectedMimes && !expectedMimes.includes(mimeType)) {
      return {
        valid: false,
        error: `ファイル拡張子(${ext})とMIMEタイプ(${mimeType})が一致しません`,
      }
    }
  }

  return { valid: true }
}

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

      // ファイルサイズ検証
      if (body.fileSizeBytes && body.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: `ファイルサイズが大きすぎます。最大${MAX_FILE_SIZE_BYTES / 1024 / 1024}MBまでです。`,
          }),
        }
      }

      // ファイル名検証（パストラバーサル防止）
      if (body.originalFilename && !isValidFilename(body.originalFilename)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: '無効なファイル名です' }),
        }
      }

      // MIMEタイプ検証
      const mimeValidation = validateMimeType(body.materialType, body.mimeType, body.originalFilename)
      if (!mimeValidation.valid) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: mimeValidation.error }),
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
