import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

interface ChapterStructure {
  order: number
  title: string
  summary: string
  learningObjectives: string[]
  estimatedMinutes: number
}

interface GenerateContentRequest {
  goal: string
  targetAudience: string
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced'
  curriculumName: string
  curriculumDescription: string
  chapters: ChapterStructure[]
  tags: string[]
}

interface GeneratedChapter {
  title: string
  content: string
  taskDescription: string
  estimatedMinutes: number
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return createPreflightResponse(origin)
  }

  // Check environment variables
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

  // Verify authorization
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

  // Verify caller has permission to create curricula
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
    const body: GenerateContentRequest = JSON.parse(event.body || '{}')

    if (!body.chapters || !Array.isArray(body.chapters) || body.chapters.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'チャプター構成が必要です' }),
      }
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    })

    const difficultyLabel = {
      beginner: '初級（基礎から丁寧に説明）',
      intermediate: '中級（基本は理解している前提で応用的な内容）',
      advanced: '上級（専門的な内容を深掘り）',
    }[body.difficultyLevel]

    // Generate content for each chapter
    const generatedChapters: GeneratedChapter[] = []
    let totalInputTokens = 0
    let totalOutputTokens = 0

    for (const chapter of body.chapters) {
      const systemPrompt = `あなたは企業研修のコンテンツ作成の専門家です。
与えられたチャプター構成に基づいて、詳細な学習コンテンツを作成してください。

以下の条件を満たすコンテンツを作成してください：
- 学習目標を達成できる具体的で分かりやすい説明
- 実践的なハンズオン課題
- Markdown形式で見やすく構造化されたコンテンツ
- 具体例やサンプルコードを含める（該当する場合）

出力は必ず以下のJSON形式で返してください。JSON以外の文字列は含めないでください：
{
  "content": "学習コンテンツ（Markdown形式）",
  "taskDescription": "ハンズオン課題の説明（具体的で実践的な内容）"
}`

      const chapterContext = `
【カリキュラム全体】
タイトル: ${body.curriculumName}
説明: ${body.curriculumDescription}
研修ゴール: ${body.goal}
対象者: ${body.targetAudience}
難易度: ${difficultyLabel}

【このチャプター】
タイトル: ${chapter.title}
概要: ${chapter.summary}
学習目標:
${chapter.learningObjectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}
目安時間: ${chapter.estimatedMinutes}分
チャプター番号: ${chapter.order} / ${body.chapters.length}`

      const userPrompt = `以下のチャプター構成に基づいて、詳細な学習コンテンツを作成してください。
${chapterContext}

上記の構成に基づいて、学習目標を達成できる詳細なコンテンツとハンズオン課題をJSON形式で出力してください。`

      // Call Claude Sonnet 4.5 API for content generation
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      })

      totalInputTokens += message.usage.input_tokens
      totalOutputTokens += message.usage.output_tokens

      // Extract text response
      const textContent = message.content.find(block => block.type === 'text')
      if (!textContent || textContent.type !== 'text') {
        throw new Error(`チャプター「${chapter.title}」のコンテンツ生成に失敗しました`)
      }

      // Parse the JSON response
      let chapterContent: { content: string; taskDescription: string }
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
        chapterContent = JSON.parse(jsonStr.trim())
      } catch {
        console.error('Failed to parse chapter content JSON:', textContent.text)
        throw new Error(`チャプター「${chapter.title}」の応答を解析できませんでした`)
      }

      generatedChapters.push({
        title: chapter.title,
        content: chapterContent.content,
        taskDescription: chapterContent.taskDescription,
        estimatedMinutes: chapter.estimatedMinutes,
      })
    }

    // Return the complete curriculum with content
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        curriculum: {
          name: body.curriculumName,
          description: body.curriculumDescription,
          difficultyLevel: body.difficultyLevel,
          tags: body.tags || [],
          chapters: generatedChapters.map((ch, index) => ({
            order: index + 1,
            title: ch.title,
            content: ch.content,
            taskDescription: ch.taskDescription,
            estimatedMinutes: ch.estimatedMinutes,
          })),
        },
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          model: 'claude-sonnet-4-5-20250929',
          chaptersGenerated: generatedChapters.length,
        },
      }),
    }
  } catch (error) {
    console.error('Error generating content:', error)

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

    const errorMessage = error instanceof Error ? error.message : 'コンテンツ生成中にエラーが発生しました'
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage }),
    }
  }
}

export { handler }
