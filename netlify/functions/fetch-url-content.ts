import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getCorsHeaders } from './shared/cors'
import { checkAuth, handlePreflight, checkMethod } from './shared/auth'
import { ErrorResponses } from './shared/errors'
import * as cheerio from 'cheerio'
import { convert } from 'html-to-text'
import { URL } from 'url'
import * as dns from 'dns'
import { promisify } from 'util'

const dnsLookup = promisify(dns.lookup)

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

// ============================================
// SSRF対策
// ============================================

// プライベートIP範囲のチェック
function isPrivateIP(ip: string): boolean {
  const privateIPv4Ranges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^0\./,
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,
  ]

  const privateIPv6Patterns = [
    /^::1$/,
    /^fe80:/i,
    /^fc00:/i,
    /^fd[0-9a-f]{2}:/i,
  ]

  for (const range of privateIPv4Ranges) {
    if (range.test(ip)) return true
  }
  for (const pattern of privateIPv6Patterns) {
    if (pattern.test(ip)) return true
  }
  return false
}

// URLの安全性を検証
async function validateUrlSafety(urlString: string): Promise<{ safe: boolean; error?: string }> {
  try {
    const url = new URL(urlString)

    if (!['http:', 'https:'].includes(url.protocol)) {
      return { safe: false, error: `許可されていないプロトコルです: ${url.protocol}` }
    }

    const hostname = url.hostname.toLowerCase()
    const blockedHosts = [
      'localhost', '127.0.0.1', '0.0.0.0', '[::1]',
      'metadata.google.internal', '169.254.169.254', 'metadata.azure.com',
    ]

    if (blockedHosts.includes(hostname)) {
      return { safe: false, error: '内部ホストへのアクセスは許可されていません' }
    }

    try {
      const { address } = await dnsLookup(hostname)
      if (isPrivateIP(address)) {
        return { safe: false, error: 'プライベートIPアドレスへのアクセスは許可されていません' }
      }
    } catch {
      return { safe: false, error: 'ホスト名を解決できませんでした' }
    }

    return { safe: true }
  } catch {
    return { safe: false, error: '無効なURLです' }
  }
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

  const { supabase: supabaseAdmin } = authResult

  try {
    const body: FetchUrlRequest = JSON.parse(event.body || '{}')

    if (!body.materialId) {
      return ErrorResponses.validationError(headers, '資料IDを指定してください')
    }

    // 資料情報を取得
    const { data: material, error: materialError } = await supabaseAdmin
      .from('source_materials')
      .select('*')
      .eq('id', body.materialId)
      .single()

    if (materialError || !material) {
      return ErrorResponses.notFound(headers, '資料')
    }

    if (material.material_type !== 'url') {
      return ErrorResponses.validationError(headers, 'この関数はURL資料のみ対応しています')
    }

    if (!material.original_url) {
      return ErrorResponses.validationError(headers, 'URLが設定されていません')
    }

    if (material.extraction_status === 'completed') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: '既に抽出済みです', material }),
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
      const $ = cheerio.load(html)

      // 不要な要素を削除
      $('script, style, nav, footer, header, aside, [role="navigation"], [role="banner"], [role="contentinfo"], .sidebar, .advertisement, .ads, .social-share, .comments').remove()

      // メタデータを抽出
      const title = $('title').text().trim() || $('h1').first().text().trim()
      const description = $('meta[name="description"]').attr('content') || ''
      const author = $('meta[name="author"]').attr('content') || ''

      // メインコンテンツを特定
      let mainContent = ''
      const contentSelectors = [
        'article', '[role="main"]', 'main', '.content', '.post-content',
        '.entry-content', '.article-content', '#content', '.markdown-body',
      ]

      for (const selector of contentSelectors) {
        const content = $(selector).first()
        if (content.length && content.text().trim().length > 100) {
          mainContent = content.html() || ''
          break
        }
      }

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
    return ErrorResponses.serverError(headers, errorMessage)
  }
}

export { handler }
