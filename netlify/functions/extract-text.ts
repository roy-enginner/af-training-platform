import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'
// PDF解析用（CommonJSモジュール）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require('pdf-parse')
// Excel解析用
import * as XLSX from 'xlsx'

interface ExtractTextRequest {
  materialId: string
}

interface MaterialMetadata {
  page_count?: number
  char_count?: number
  word_count?: number
  sheet_names?: string[]
  title?: string
  author?: string
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
    const body: ExtractTextRequest = JSON.parse(event.body || '{}')

    if (!body.materialId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '資料IDを指定してください' }),
      }
    }

    // 資料情報を取得
    const { data: material, error: materialError } = await supabaseAdmin
      .from('source_materials')
      .select('*')
      .eq('id', body.materialId)
      .single()

    if (materialError || !material) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: '資料が見つかりません' }),
      }
    }

    // 既に抽出済みならスキップ
    if (material.extraction_status === 'completed') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: '既に抽出済みです',
          material,
        }),
      }
    }

    // ステータスを処理中に更新
    await supabaseAdmin
      .from('source_materials')
      .update({ extraction_status: 'processing' })
      .eq('id', body.materialId)

    let extractedText = ''
    let metadata: MaterialMetadata = {}

    try {
      if (material.material_type === 'pdf' && material.storage_path) {
        // PDFファイルをStorageから取得
        const { data: fileData, error: downloadError } = await supabaseAdmin
          .storage
          .from('source-materials')
          .download(material.storage_path)

        if (downloadError || !fileData) {
          throw new Error('ファイルのダウンロードに失敗しました')
        }

        // ArrayBufferに変換
        const arrayBuffer = await fileData.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // PDFからテキスト抽出
        const pdfData = await pdf(buffer)
        extractedText = pdfData.text
        metadata = {
          page_count: pdfData.numpages,
          char_count: pdfData.text.length,
          word_count: pdfData.text.split(/\s+/).filter(Boolean).length,
          title: pdfData.info?.Title || undefined,
          author: pdfData.info?.Author || undefined,
        }

      } else if (material.material_type === 'excel' && material.storage_path) {
        // Excelファイルをストレージから取得
        const { data: fileData, error: downloadError } = await supabaseAdmin
          .storage
          .from('source-materials')
          .download(material.storage_path)

        if (downloadError || !fileData) {
          throw new Error('ファイルのダウンロードに失敗しました')
        }

        // ArrayBufferに変換
        const arrayBuffer = await fileData.arrayBuffer()

        // Excelファイルを解析
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })

        const textParts: string[] = []
        const sheetNames: string[] = []

        // 各シートからテキストを抽出
        for (const sheetName of workbook.SheetNames) {
          sheetNames.push(sheetName)
          const sheet = workbook.Sheets[sheetName]

          // シートをテキストに変換
          const sheetText = XLSX.utils.sheet_to_txt(sheet)
          if (sheetText.trim()) {
            textParts.push(`【シート: ${sheetName}】\n${sheetText}`)
          }
        }

        extractedText = textParts.join('\n\n')
        metadata = {
          sheet_names: sheetNames,
          char_count: extractedText.length,
          word_count: extractedText.split(/\s+/).filter(Boolean).length,
        }

      } else if (['text', 'markdown'].includes(material.material_type)) {
        // テキスト/Markdownは既にextracted_textに入っているはず
        if (material.extracted_text) {
          extractedText = material.extracted_text
          metadata = {
            char_count: extractedText.length,
            word_count: extractedText.split(/\s+/).filter(Boolean).length,
          }
        } else {
          throw new Error('テキストコンテンツがありません')
        }

      } else if (material.material_type === 'url') {
        // URLの場合は fetch-url-content を使用すべき
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'URL資料は fetch-url-content を使用してください' }),
        }
      } else {
        throw new Error(`未対応の資料タイプ: ${material.material_type}`)
      }

      // 抽出結果を保存
      const { data: updatedMaterial, error: updateError } = await supabaseAdmin
        .from('source_materials')
        .update({
          extracted_text: extractedText,
          extraction_status: 'completed',
          extracted_at: new Date().toISOString(),
          metadata,
        })
        .eq('id', body.materialId)
        .select()
        .single()

      if (updateError) {
        throw new Error('抽出結果の保存に失敗しました')
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'テキスト抽出が完了しました',
          material: updatedMaterial,
          metadata,
        }),
      }

    } catch (extractError) {
      // 抽出エラーをDBに記録
      const errorMessage = extractError instanceof Error ? extractError.message : '不明なエラー'
      await supabaseAdmin
        .from('source_materials')
        .update({
          extraction_status: 'failed',
          extraction_error: errorMessage,
        })
        .eq('id', body.materialId)

      throw extractError
    }

  } catch (error) {
    console.error('Error extracting text:', error)
    const errorMessage = error instanceof Error ? error.message : 'テキスト抽出中にエラーが発生しました'
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage }),
    }
  }
}

export { handler }
