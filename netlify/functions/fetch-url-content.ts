import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'
import * as cheerio from 'cheerio'
import { convert } from 'html-to-text'

interface FetchUrlRequest {
  materialId: string
}

interface MaterialMetadata {
  char_count?: number
  word_count?: number
  title?: string
  author?: string
  description?: string
  url?: string
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
    const body: FetchUrlRequest = JSON.parse(event.body || '{}')

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

    // URL資料のみ対応
    if (material.material_type !== 'url') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'この関数はURL資料のみ対応しています' }),
      }
    }

    if (!material.original_url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'URLが設定されていません' }),
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

    try {
      // URLからコンテンツを取得
      const response = await fetch(material.original_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AFTrainingBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()

      // HTMLをパース
      const $ = cheerio.load(html)

      // 不要な要素を削除
      $('script').remove()
      $('style').remove()
      $('nav').remove()
      $('footer').remove()
      $('header').remove()
      $('aside').remove()
      $('[role="navigation"]').remove()
      $('[role="banner"]').remove()
      $('[role="contentinfo"]').remove()
      $('.sidebar').remove()
      $('.advertisement').remove()
      $('.ads').remove()
      $('.social-share').remove()
      $('.comments').remove()

      // メタデータを抽出
      const title = $('title').text().trim() || $('h1').first().text().trim()
      const description = $('meta[name="description"]').attr('content') || ''
      const author = $('meta[name="author"]').attr('content') || ''

      // メインコンテンツを特定
      let mainContent = ''

      // 一般的なコンテンツエリアを探す
      const contentSelectors = [
        'article',
        '[role="main"]',
        'main',
        '.content',
        '.post-content',
        '.entry-content',
        '.article-content',
        '#content',
        '.markdown-body',
      ]

      for (const selector of contentSelectors) {
        const content = $(selector).first()
        if (content.length && content.text().trim().length > 100) {
          mainContent = content.html() || ''
          break
        }
      }

      // メインコンテンツが見つからない場合はbody全体を使用
      if (!mainContent) {
        mainContent = $('body').html() || html
      }

      // HTMLをテキストに変換
      const extractedText = convert(mainContent, {
        wordwrap: false,
        selectors: [
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'img', format: 'skip' },
          { selector: 'table', format: 'dataTable' },
        ],
      })

      // 空行を整理
      const cleanedText = extractedText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n\n')

      const metadata: MaterialMetadata = {
        char_count: cleanedText.length,
        word_count: cleanedText.split(/\s+/).filter(Boolean).length,
        title: title || undefined,
        author: author || undefined,
        description: description || undefined,
        url: material.original_url,
      }

      // 抽出結果を保存
      const { data: updatedMaterial, error: updateError } = await supabaseAdmin
        .from('source_materials')
        .update({
          extracted_text: cleanedText,
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
          message: 'コンテンツ取得が完了しました',
          material: updatedMaterial,
          metadata,
        }),
      }

    } catch (fetchError) {
      // 抽出エラーをDBに記録
      const errorMessage = fetchError instanceof Error ? fetchError.message : '不明なエラー'
      await supabaseAdmin
        .from('source_materials')
        .update({
          extraction_status: 'failed',
          extraction_error: errorMessage,
        })
        .eq('id', body.materialId)

      throw fetchError
    }

  } catch (error) {
    console.error('Error fetching URL content:', error)
    const errorMessage = error instanceof Error ? error.message : 'コンテンツ取得中にエラーが発生しました'
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage }),
    }
  }
}

export { handler }
