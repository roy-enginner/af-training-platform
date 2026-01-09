import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

interface RegenerateRequest {
  chapterId: string
  instructions?: string  // 再生成の指示（例: もっと具体例を増やす）
  options?: {
    depthLevel?: 'overview' | 'standard' | 'deep'
    exerciseRatio?: number
    exampleFrequency?: 'minimal' | 'moderate' | 'abundant'
    toneStyle?: 'formal' | 'casual' | 'technical'
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
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables')
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' }),
    }
  }

  if (!anthropicApiKey) {
    console.error('Missing Anthropic API key')
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'AI service not configured' }),
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
    const body: RegenerateRequest = JSON.parse(event.body || '{}')

    if (!body.chapterId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'チャプターIDを指定してください' }),
      }
    }

    // チャプター情報を取得
    const { data: chapter, error: chapterError } = await supabaseAdmin
      .from('chapters')
      .select(`
        *,
        curriculum:curricula (
          id,
          name,
          description,
          difficulty_level,
          tags,
          source_material:source_materials (
            extracted_text
          )
        )
      `)
      .eq('id', body.chapterId)
      .single()

    if (chapterError || !chapter) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'チャプターが見つかりません' }),
      }
    }

    // 同じカリキュラム内の他のチャプター情報を取得
    const { data: allChapters } = await supabaseAdmin
      .from('chapters')
      .select('order_index, title, content')
      .eq('curriculum_id', chapter.curriculum_id)
      .order('order_index')

    // Anthropicクライアント初期化
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    })

    const options = body.options || {}

    // 生成オプションラベル
    const depthLabels: Record<string, string> = {
      overview: '概要中心（要点を簡潔に）',
      standard: '標準（バランスの取れた詳細度）',
      deep: '深掘り（詳細な解説と背景知識を含む）',
    }

    const exampleLabels: Record<string, string> = {
      minimal: '最小限',
      moderate: '適度',
      abundant: '豊富',
    }

    const toneLabels: Record<string, string> = {
      formal: 'フォーマル',
      casual: 'カジュアル',
      technical: '技術的',
    }

    const difficultyLabels: Record<string, string> = {
      beginner: '初級',
      intermediate: '中級',
      advanced: '上級',
      mixed: '混合',
    }

    // 前後のチャプターコンテキストを構築
    const otherChaptersContext = allChapters
      ?.filter(ch => ch.order_index !== chapter.order_index)
      .map(ch => `【チャプター${ch.order_index + 1}: ${ch.title}】\n${ch.content?.substring(0, 500)}...`)
      .join('\n\n') || ''

    // 資料テキスト（あれば）
    const materialText = chapter.curriculum?.source_material?.extracted_text
      ? `【参照資料（抜粋）】\n${chapter.curriculum.source_material.extracted_text.substring(0, 10000)}`
      : ''

    const systemPrompt = `あなたは企業研修のコンテンツ作成の専門家です。
指定されたチャプターを、ユーザーの指示に従って再生成してください。

## 再生成パラメータ
- 内容の深さ: ${depthLabels[options.depthLevel || 'standard']}
- 演習比率: ${options.exerciseRatio ?? 30}%
- 例示の量: ${exampleLabels[options.exampleFrequency || 'moderate']}
- 言語スタイル: ${toneLabels[options.toneStyle || 'formal']}

## コンテンツ作成ガイドライン
- 元のチャプターの学習目標を維持
- ユーザーの改善指示を反映
- 前後のチャプターとの整合性を保つ
- Markdown形式で見やすく構造化

出力は必ず以下のJSON形式で返してください。JSON以外の文字列は含めないでください：
{
  "content": "再生成された学習コンテンツ（Markdown形式）",
  "taskDescription": "ハンズオン課題の説明"
}`

    const userPrompt = `以下のチャプターを指定された条件で再生成してください。

【カリキュラム情報】
タイトル: ${chapter.curriculum?.name || 'カリキュラム'}
説明: ${chapter.curriculum?.description || ''}
難易度: ${difficultyLabels[chapter.curriculum?.difficulty_level || 'beginner']}

【現在のチャプター】
タイトル: ${chapter.title}
現在のコンテンツ:
${chapter.content || '（コンテンツなし）'}

現在の課題:
${chapter.task_description || '（課題なし）'}

${body.instructions ? `【再生成の指示】\n${body.instructions}` : '【再生成の指示】\nコンテンツの質を向上させてください。'}

${otherChaptersContext ? `【他のチャプター（参考）】\n${otherChaptersContext}` : ''}

${materialText}

上記の情報を踏まえて、改善されたチャプターコンテンツをJSON形式で出力してください。`

    // Claude Sonnet 4.5でコンテンツ再生成
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    })

    // テキスト応答を抽出
    const textContent = message.content.find(block => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AIからの応答を取得できませんでした' }),
      }
    }

    // JSONをパース
    let regeneratedContent: { content: string; taskDescription: string }
    try {
      let jsonStr = textContent.text.trim()
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7)
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3)
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3)
      }
      regeneratedContent = JSON.parse(jsonStr.trim())
    } catch {
      console.error('Failed to parse regenerated content JSON:', textContent.text)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AIの応答を解析できませんでした' }),
      }
    }

    // チャプターを更新
    const { data: updatedChapter, error: updateError } = await supabaseAdmin
      .from('chapters')
      .update({
        content: regeneratedContent.content,
        task_description: regeneratedContent.taskDescription,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.chapterId)
      .select()
      .single()

    if (updateError) {
      throw new Error('チャプターの更新に失敗しました')
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'チャプターを再生成しました',
        chapter: updatedChapter,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          model: 'claude-sonnet-4-5-20250929',
        },
      }),
    }

  } catch (error) {
    console.error('Error regenerating chapter:', error)

    if (error instanceof Anthropic.APIError) {
      if (error.status === 429) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({ error: 'APIレート制限に達しました。しばらく待ってから再試行してください。' }),
        }
      }
      return {
        statusCode: error.status || 500,
        headers,
        body: JSON.stringify({ error: `AI API エラー: ${error.message}` }),
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'チャプター再生成中にエラーが発生しました'
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage }),
    }
  }
}

export { handler }
