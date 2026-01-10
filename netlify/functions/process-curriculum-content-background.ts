import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ジョブの進捗を更新するヘルパー関数
async function updateJobProgress(
  supabase: SupabaseClient,
  jobId: string,
  updates: {
    status?: string
    progress?: number
    current_step?: string
    result?: unknown
    error_message?: string
    tokens_used?: number
    model_used?: string
    started_at?: string
    completed_at?: string
  }
) {
  const { error } = await supabase
    .from('curriculum_generation_jobs')
    .update(updates)
    .eq('id', jobId)

  if (error) {
    console.error('Failed to update job progress:', error)
  }
}

interface ChapterStructure {
  order: number
  title: string
  summary: string
  learningObjectives: string[]
  estimatedMinutes: number
}

interface GeneratedChapter {
  title: string
  content: string
  taskDescription: string
  estimatedMinutes: number
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  console.log('Content generation background function started')

  // 環境変数チェック
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY

  if (!supabaseUrl || !supabaseServiceKey || !anthropicApiKey) {
    console.error('Missing environment variables')
    return { statusCode: 500, body: 'Configuration error' }
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // リクエストボディからジョブIDを取得
  let jobId: string
  try {
    const body = JSON.parse(event.body || '{}')
    jobId = body.jobId
    if (!jobId) {
      console.error('Missing jobId')
      return { statusCode: 400, body: 'Missing jobId' }
    }
  } catch {
    console.error('Invalid request body')
    return { statusCode: 400, body: 'Invalid request body' }
  }

  // ジョブ情報を取得
  const { data: job, error: fetchError } = await supabaseAdmin
    .from('curriculum_generation_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (fetchError || !job) {
    console.error('Job not found:', fetchError)
    return { statusCode: 404, body: 'Job not found' }
  }

  // 既に処理済みの場合はスキップ
  if (job.status !== 'queued') {
    console.log('Job already processed:', job.status)
    return { statusCode: 200, body: 'Job already processed' }
  }

  try {
    // 処理開始
    await updateJobProgress(supabaseAdmin, jobId, {
      status: 'connecting',
      progress: 5,
      current_step: 'Claude Sonnet 4.5 に接続中...',
      started_at: new Date().toISOString(),
    })

    // Anthropic クライアント初期化
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    })

    // 入力パラメータを取得
    const inputParams = job.input_params as {
      goal: string
      targetAudience: string
      durationMinutes: number
      difficultyLevel: string
      structure: {
        name: string
        description: string
        chapters: ChapterStructure[]
        tags: string[]
      }
    }

    const { structure } = inputParams
    const chapters = structure.chapters

    const difficultyLabel = {
      beginner: '初級（基礎から丁寧に説明）',
      intermediate: '中級（基本は理解している前提で応用的な内容）',
      advanced: '上級（専門的な内容を深掘り）',
    }[inputParams.difficultyLevel] || '初級'

    // 各チャプターのコンテンツを生成
    const generatedChapters: GeneratedChapter[] = []
    let totalInputTokens = 0
    let totalOutputTokens = 0

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i]

      // 進捗を更新（チャプターごと）
      const progressPercent = Math.round(10 + (80 * i) / chapters.length)
      await updateJobProgress(supabaseAdmin, jobId, {
        status: 'generating',
        progress: progressPercent,
        current_step: `チャプター ${i + 1}/${chapters.length} を生成中: ${chapter.title}`,
      })

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
タイトル: ${structure.name}
説明: ${structure.description}
研修ゴール: ${inputParams.goal}
対象者: ${inputParams.targetAudience}
難易度: ${difficultyLabel}

【このチャプター】
タイトル: ${chapter.title}
概要: ${chapter.summary}
学習目標:
${chapter.learningObjectives.map((obj: string, idx: number) => `${idx + 1}. ${obj}`).join('\n')}
目安時間: ${chapter.estimatedMinutes}分
チャプター番号: ${chapter.order} / ${chapters.length}`

      const userPrompt = `以下のチャプター構成に基づいて、詳細な学習コンテンツを作成してください。
${chapterContext}

上記の構成に基づいて、学習目標を達成できる詳細なコンテンツとハンズオン課題をJSON形式で出力してください。`

      // Claude Sonnet 4.5 でコンテンツを生成
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

      // レスポンスを解析
      const textContent = message.content.find(block => block.type === 'text')
      if (!textContent || textContent.type !== 'text') {
        throw new Error(`チャプター「${chapter.title}」のコンテンツ生成に失敗しました`)
      }

      // JSONをパース
      let jsonStr = textContent.text.trim()
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7)
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3)
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3)
      }

      const chapterContent = JSON.parse(jsonStr.trim()) as {
        content: string
        taskDescription: string
      }

      generatedChapters.push({
        title: chapter.title,
        content: chapterContent.content,
        taskDescription: chapterContent.taskDescription,
        estimatedMinutes: chapter.estimatedMinutes,
      })
    }

    // 解析中に更新
    await updateJobProgress(supabaseAdmin, jobId, {
      status: 'parsing',
      progress: 95,
      current_step: '最終処理中...',
    })

    // 結果を整形
    const result = {
      name: structure.name,
      description: structure.description,
      difficultyLevel: inputParams.difficultyLevel,
      tags: structure.tags || [],
      chapters: generatedChapters.map((ch, index) => ({
        order: index + 1,
        title: ch.title,
        content: ch.content,
        taskDescription: ch.taskDescription,
        estimatedMinutes: ch.estimatedMinutes,
      })),
    }

    // 完了
    await updateJobProgress(supabaseAdmin, jobId, {
      status: 'completed',
      progress: 100,
      current_step: 'コンテンツ生成が完了しました',
      result: result,
      tokens_used: totalInputTokens + totalOutputTokens,
      model_used: 'claude-sonnet-4-5-20250929',
      completed_at: new Date().toISOString(),
    })

    console.log('Content generation job completed successfully:', jobId)
    return { statusCode: 200, body: 'Job completed' }

  } catch (error) {
    console.error('Error processing content job:', error)

    // エラーメッセージを取得
    let errorMessage = 'コンテンツ生成中にエラーが発生しました'
    if (error instanceof Anthropic.APIError) {
      if (error.status === 429) {
        errorMessage = 'APIレート制限に達しました。しばらく待ってから再試行してください。'
      } else {
        errorMessage = `AI API エラー: ${error.message}`
      }
    } else if (error instanceof Error) {
      errorMessage = error.message
    }

    // 失敗を記録
    await updateJobProgress(supabaseAdmin, jobId, {
      status: 'failed',
      progress: 0,
      current_step: 'エラーが発生しました',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })

    return { statusCode: 500, body: errorMessage }
  }
}

export { handler }
