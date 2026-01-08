import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

interface GenerateCurriculumRequest {
  goal: string
  targetAudience?: string
  durationMinutes?: number
  difficultyLevel?: 'beginner' | 'intermediate' | 'advanced'
}

interface GeneratedCurriculum {
  name: string
  description: string
  chapters: {
    title: string
    content: string
    taskDescription: string
    estimatedMinutes: number
  }[]
  tags: string[]
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
    const body: GenerateCurriculumRequest = JSON.parse(event.body || '{}')

    if (!body.goal || body.goal.trim().length < 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '研修ゴールを10文字以上で入力してください' }),
      }
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    })

    // Build the prompt
    const targetAudience = body.targetAudience || '企業の一般社員'
    const totalDuration = body.durationMinutes || 60
    const difficulty = body.difficultyLevel || 'beginner'
    const difficultyLabel = {
      beginner: '初級（基礎から丁寧に説明）',
      intermediate: '中級（基本は理解している前提で応用的な内容）',
      advanced: '上級（専門的な内容を深掘り）',
    }[difficulty]

    const systemPrompt = `あなたは企業研修のカリキュラム設計の専門家です。
与えられた研修ゴールに基づいて、効果的な学習カリキュラムを設計してください。

以下の条件を満たすカリキュラムを作成してください：
- 各チャプターは5〜15分程度で学習できる適切なサイズに分割
- 実践的なハンズオン課題を各チャプターに含める
- 段階的に難易度を上げる構成
- 具体的で実務に活かせる内容

出力は必ず以下のJSON形式で返してください。JSON以外の文字列は含めないでください：
{
  "name": "カリキュラムタイトル",
  "description": "カリキュラムの概要説明（100〜200文字程度）",
  "chapters": [
    {
      "title": "チャプタータイトル",
      "content": "学習コンテンツ（Markdown形式、箇条書きや見出しを活用）",
      "taskDescription": "ハンズオン課題の説明",
      "estimatedMinutes": 10
    }
  ],
  "tags": ["タグ1", "タグ2", "タグ3"]
}`

    const userPrompt = `以下の条件でAI研修カリキュラムを作成してください。

【研修ゴール】
${body.goal}

【対象者】
${targetAudience}

【目標所要時間】
約${totalDuration}分（チャプター合計）

【難易度】
${difficultyLabel}

上記の条件に基づいて、実践的で効果的なカリキュラムをJSON形式で出力してください。`

    // Call Claude API
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

    // Extract text response
    const textContent = message.content.find(block => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AIからの応答を取得できませんでした' }),
      }
    }

    // Parse the JSON response
    let curriculum: GeneratedCurriculum
    try {
      // Extract JSON from the response (handle potential markdown code blocks)
      let jsonStr = textContent.text.trim()
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7)
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3)
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3)
      }
      curriculum = JSON.parse(jsonStr.trim())
    } catch {
      console.error('Failed to parse curriculum JSON:', textContent.text)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AIの応答を解析できませんでした' }),
      }
    }

    // Validate the response structure
    if (!curriculum.name || !curriculum.chapters || !Array.isArray(curriculum.chapters)) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AIの応答形式が不正です' }),
      }
    }

    // Return the generated curriculum
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        curriculum: {
          name: curriculum.name,
          description: curriculum.description || '',
          difficultyLevel: difficulty,
          tags: curriculum.tags || [],
          chapters: curriculum.chapters.map((ch, index) => ({
            order: index + 1,
            title: ch.title,
            content: ch.content,
            taskDescription: ch.taskDescription,
            estimatedMinutes: ch.estimatedMinutes || 10,
          })),
        },
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      }),
    }
  } catch (error) {
    console.error('Error generating curriculum:', error)

    // Handle specific Anthropic errors
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

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'カリキュラム生成中にエラーが発生しました' }),
    }
  }
}

export { handler }
