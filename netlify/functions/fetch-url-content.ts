import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'
import * as cheerio from 'cheerio'
import { convert } from 'html-to-text'
import { URL } from 'url'
import * as dns from 'dns'
import { promisify } from 'util'

const dnsLookup = promisify(dns.lookup)

interface FetchUrlRequest {
  materialId: string
}

// SSRF対策: プライベートIP範囲のチェック
function isPrivateIP(ip: string): boolean {
  // IPv4プライベートアドレス範囲
  const privateIPv4Ranges = [
    /^10\./,                                // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,       // 172.16.0.0/12
    /^192\.168\./,                          // 192.168.0.0/16
    /^127\./,                               // 127.0.0.0/8 (localhost)
    /^169\.254\./,                          // 169.254.0.0/16 (リンクローカル)
    /^0\./,                                 // 0.0.0.0/8
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
  ]

  // IPv6プライベートアドレス
  const privateIPv6Patterns = [
    /^::1$/,                                // localhost
    /^fe80:/i,                              // リンクローカル
    /^fc00:/i,                              // ユニークローカル
    /^fd[0-9a-f]{2}:/i,                     // ユニークローカル
  ]

  // IPv4チェック
  for (const range of privateIPv4Ranges) {
    if (range.test(ip)) {
      return true
    }
  }

  // IPv6チェック
  for (const pattern of privateIPv6Patterns) {
    if (pattern.test(ip)) {
      return true
    }
  }

  return false
}

// SSRF対策: URLの安全性を検証
async function validateUrlSafety(urlString: string): Promise<{ safe: boolean; error?: string }> {
  try {
    const url = new URL(urlString)

    // プロトコルチェック（http/httpsのみ許可）
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { safe: false, error: `許可されていないプロトコルです: ${url.protocol}` }
    }

    // ホスト名チェック
    const hostname = url.hostname.toLowerCase()

    // localhostやメタデータエンドポイントのブロック
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '[::1]',
      'metadata.google.internal',           // GCP metadata
      '169.254.169.254',                    // AWS/Azure/GCP metadata
      'metadata.azure.com',                 // Azure metadata
    ]

    if (blockedHosts.includes(hostname)) {
      return { safe: false, error: '内部ホストへのアクセスは許可されていません' }
    }

    // DNS解決してIPアドレスをチェック
    try {
      const { address } = await dnsLookup(hostname)
      if (isPrivateIP(address)) {
        return { safe: false, error: 'プライベートIPアドレスへのアクセスは許可されていません' }
      }
    } catch (dnsError) {
      // DNS解決に失敗した場合はブロック
      return { safe: false, error: 'ホスト名を解決できませんでした' }
    }

    return { safe: true }
  } catch {
    return { safe: false, error: '無効なURLです' }
  }
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
      // SSRF対策: URLの安全性を検証
      const urlValidation = await validateUrlSafety(material.original_url)
      if (!urlValidation.safe) {
        throw new Error(`URLの検証に失敗しました: ${urlValidation.error}`)
      }

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
