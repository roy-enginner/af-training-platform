import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

interface GenerateStructureRequest {
  goal: string
  targetAudience?: string
  durationMinutes?: number
  difficultyLevel?: 'beginner' | 'intermediate' | 'advanced'
}

interface ChapterStructure {
  title: string
  summary: string
  learningObjectives: string[]
  estimatedMinutes: number
}

interface GeneratedStructure {
  name: string
  description: string
  chapters: ChapterStructure[]
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
    const body: GenerateStructureRequest = JSON.parse(event.body || '{}')

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

    // Build the prompt for structure generation
    const targetAudience = body.targetAudience || '企業の一般社員'
    const totalDuration = body.durationMinutes || 60
    const difficulty = body.difficultyLevel || 'beginner'
    const difficultyLabel = {
      beginner: '初級（基礎から丁寧に説明）',
      intermediate: '中級（基本は理解している前提で応用的な内容）',
      advanced: '上級（専門的な内容を深掘り）',
    }[difficulty]

    const systemPrompt = `あなたは企業研修のカリキュラム設計の専門家です。
与えられた研修ゴールに基づいて、効果的な学習カリキュラムの**構成**を設計してください。

この段階では構成のみを設計し、詳細なコンテンツは後のステップで作成します。

以下の条件を満たす構成を設計してください：
- 各チャプターは5〜15分程度で学習できる適切なサイズに分割
- 段階的に難易度を上げる構成
- 各チャプターで達成すべき明確な学習目標を設定
- 実務に直結する実践的な内容

出力は必ず以下のJSON形式で返してください。JSON以外の文字列は含めないでください：
{
  "name": "カリキュラムタイトル",
  "description": "カリキュラムの概要説明（100〜200文字程度）",
  "chapters": [
    {
      "title": "チャプタータイトル",
      "summary": "このチャプターで学ぶ内容の概要（50〜100文字）",
      "learningObjectives": ["学習目標1", "学習目標2", "学習目標3"],
      "estimatedMinutes": 10
    }
  ],
  "tags": ["タグ1", "タグ2", "タグ3"]
}`

    const userPrompt = `以下の条件でAI研修カリキュラムの**構成**を設計してください。

【研修ゴール】
${body.goal}

【対象者】
${targetAudience}

【目標所要時間】
約${totalDuration}分（チャプター合計）

【難易度】
${difficultyLabel}

上記の条件に基づいて、効果的なカリキュラム構成をJSON形式で出力してください。
各チャプターには、タイトル、概要、学習目標、所要時間を含めてください。
詳細なコンテンツは後のステップで作成するため、この段階では構成のみを出力してください。`

    // Call Claude Sonnet 4 API for structure generation
    // Note: Opus 4.5は処理時間が長くNetlifyのタイムアウト(26秒)を超えるためSonnet 4を使用
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
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
    let structure: GeneratedStructure
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
      structure = JSON.parse(jsonStr.trim())
    } catch {
      console.error('Failed to parse structure JSON:', textContent.text)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AIの応答を解析できませんでした' }),
      }
    }

    // Validate the response structure
    if (!structure.name || !structure.chapters || !Array.isArray(structure.chapters)) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AIの応答形式が不正です' }),
      }
    }

    // Return the generated structure
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        structure: {
          name: structure.name,
          description: structure.description || '',
          difficultyLevel: difficulty,
          targetAudience,
          durationMinutes: totalDuration,
          tags: structure.tags || [],
          chapters: structure.chapters.map((ch, index) => ({
            order: index + 1,
            title: ch.title,
            summary: ch.summary,
            learningObjectives: ch.learningObjectives || [],
            estimatedMinutes: ch.estimatedMinutes || 10,
          })),
        },
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          model: 'claude-sonnet-4-20250514',
        },
      }),
    }
  } catch (error) {
    console.error('Error generating structure:', error)

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
      body: JSON.stringify({ error: '構成生成中にエラーが発生しました' }),
    }
  }
}

export { handler }
