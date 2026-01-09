import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getCorsHeaders } from './shared/cors'
import { checkAuth, handlePreflight, checkMethod } from './shared/auth'
import { ErrorResponses } from './shared/errors'
import { isValidFilename, validateMimeType, validateFileSize } from './shared/validation'

// リクエスト型
interface UploadMaterialRequest {
  name: string
  materialType: 'pdf' | 'url' | 'text' | 'markdown' | 'excel'
  storagePath?: string
  originalFilename?: string
  fileSizeBytes?: number
  mimeType?: string
  originalUrl?: string
  textContent?: string
  tags?: string[]
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const headers = getCorsHeaders(event.headers.origin)

  // プリフライトチェック
  const preflightResponse = handlePreflight(event)
  if (preflightResponse) return preflightResponse

  // メソッドチェック
  const methodError = checkMethod(event, 'POST')
  if (methodError) return methodError

  // 認証チェック（super_admin必須）
  const authResult = await checkAuth(event, { requireSuperAdmin: true })
  if (!authResult.success) {
    return authResult.response
  }

  const { user: caller, supabase: supabaseAdmin } = authResult

  try {
    const body: UploadMaterialRequest = JSON.parse(event.body || '{}')

    // バリデーション
    if (!body.name || body.name.trim().length < 1) {
      return ErrorResponses.validationError(headers, '資料名を入力してください')
    }

    if (!body.materialType) {
      return ErrorResponses.validationError(headers, '資料タイプを指定してください')
    }

    // 資料タイプに応じたバリデーション
    if (['pdf', 'excel'].includes(body.materialType)) {
      if (!body.storagePath) {
        return ErrorResponses.validationError(headers, 'ファイルのストレージパスが必要です')
      }

      // ファイルサイズ検証
      const sizeValidation = validateFileSize(body.fileSizeBytes)
      if (!sizeValidation.valid) {
        return ErrorResponses.validationError(headers, sizeValidation.error!)
      }

      // ファイル名検証（パストラバーサル防止）
      if (body.originalFilename && !isValidFilename(body.originalFilename)) {
        return ErrorResponses.validationError(headers, '無効なファイル名です')
      }

      // MIMEタイプ検証
      const mimeValidation = validateMimeType(body.materialType, body.mimeType, body.originalFilename)
      if (!mimeValidation.valid) {
        return ErrorResponses.validationError(headers, mimeValidation.error!)
      }
    } else if (body.materialType === 'url') {
      if (!body.originalUrl) {
        return ErrorResponses.validationError(headers, 'URLを入力してください')
      }
      try {
        new URL(body.originalUrl)
      } catch {
        return ErrorResponses.validationError(headers, '有効なURLを入力してください')
      }
    } else if (['text', 'markdown'].includes(body.materialType)) {
      if (!body.textContent && !body.storagePath) {
        return ErrorResponses.validationError(headers, 'テキスト内容を入力してください')
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
      return ErrorResponses.serverError(headers, '資料の登録に失敗しました')
    }

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
    return ErrorResponses.serverError(headers, '資料の登録中にエラーが発生しました')
  }
}

export { handler }
