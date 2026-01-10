import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import {
  createSupabaseAdmin,
  updateJobProgress,
  markJobAsFailed,
  validateInternalSecret,
  getDifficultyLabel,
} from './shared/job-utils'
import { parseAiJsonResponse } from './shared/json-utils'

// 構成生成用のシステムプロンプト
const STRUCTURE_SYSTEM_PROMPT = `あなたは企業研修のカリキュラム設計の専門家です。
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

// 生成結果の型
interface GeneratedStructure {
  name: string
  description: string
  chapters: Array<{
    title: string
    summary: string
    learningObjectives?: string[]
    estimatedMinutes?: number
  }>
  tags?: string[]
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  console.log('Background function started: structure generation')

  // 内部シークレット認証
  const providedSecret = event.headers['x-internal-secret']
  if (!validateInternalSecret(providedSecret)) {
    console.error('Invalid internal secret')
    return { statusCode: 403, body: 'Forbidden' }
  }

  // 環境変数チェック
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicApiKey) {
    console.error('Missing Anthropic API key')
    return { statusCode: 500, body: 'Configuration error' }
  }

  let supabaseAdmin
  try {
    supabaseAdmin = createSupabaseAdmin()
  } catch (error) {
    console.error('Failed to create Supabase client:', error)
    return { statusCode: 500, body: 'Configuration error' }
  }

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
      progress: 10,
      current_step: 'Claude Opus 4.5 に接続中...',
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
    }

    const difficultyLabel = getDifficultyLabel(inputParams.difficultyLevel)

    const userPrompt = `以下の条件でAI研修カリキュラムの**構成**を設計してください。

【研修ゴール】
${inputParams.goal}

【対象者】
${inputParams.targetAudience}

【目標所要時間】
約${inputParams.durationMinutes}分（チャプター合計）

【難易度】
${difficultyLabel}

上記の条件に基づいて、効果的なカリキュラム構成をJSON形式で出力してください。
各チャプターには、タイトル、概要、学習目標、所要時間を含めてください。
詳細なコンテンツは後のステップで作成するため、この段階では構成のみを出力してください。`

    // 生成中に更新
    await updateJobProgress(supabaseAdmin, jobId, {
      status: 'generating',
      progress: 30,
      current_step: 'カリキュラム構成を生成中...',
    })

    // Claude Opus 4.5 で構成を生成
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: STRUCTURE_SYSTEM_PROMPT,
    })

    // 解析中に更新
    await updateJobProgress(supabaseAdmin, jobId, {
      status: 'parsing',
      progress: 80,
      current_step: '生成結果を解析中...',
    })

    // レスポンスを解析
    const textContent = message.content.find(block => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('AIからの応答を取得できませんでした')
    }

    // JSONをパース（共通ユーティリティ使用）
    const structure = parseAiJsonResponse<GeneratedStructure>(textContent.text)

    // 結果のバリデーション
    if (!structure.name || !structure.chapters || !Array.isArray(structure.chapters)) {
      throw new Error('AIの応答形式が不正です')
    }

    // 結果を整形
    const result = {
      name: structure.name,
      description: structure.description || '',
      difficultyLevel: inputParams.difficultyLevel,
      targetAudience: inputParams.targetAudience,
      durationMinutes: inputParams.durationMinutes,
      tags: structure.tags || [],
      chapters: structure.chapters.map((ch, index) => ({
        order: index + 1,
        title: ch.title,
        summary: ch.summary,
        learningObjectives: ch.learningObjectives || [],
        estimatedMinutes: ch.estimatedMinutes || 10,
      })),
    }

    // 完了
    await updateJobProgress(supabaseAdmin, jobId, {
      status: 'completed',
      progress: 100,
      current_step: '構成の生成が完了しました',
      result: result,
      tokens_used: message.usage.input_tokens + message.usage.output_tokens,
      model_used: 'claude-opus-4-5-20251101',
      completed_at: new Date().toISOString(),
    })

    console.log('Job completed successfully:', jobId)
    return { statusCode: 200, body: 'Job completed' }

  } catch (error) {
    console.error('Error processing job:', error)

    // エラーメッセージを取得
    let errorMessage = 'カリキュラム構成の生成中にエラーが発生しました'
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
    await markJobAsFailed(supabaseAdmin, jobId, errorMessage)

    return { statusCode: 500, body: errorMessage }
  }
}

export { handler }
