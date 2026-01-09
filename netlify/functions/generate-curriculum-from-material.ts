import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { getCorsHeaders } from './shared/cors'
import { checkAuth, handlePreflight, checkMethod } from './shared/auth'
import { ErrorResponses } from './shared/errors'
import { validateUserInput, truncateText } from './shared/validation'
import { FILE_CONSTANTS } from './shared/constants'

// リクエスト型
interface GenerationOptions {
  depthLevel?: 'overview' | 'standard' | 'deep'
  exerciseRatio?: number
  exampleFrequency?: 'minimal' | 'moderate' | 'abundant'
  toneStyle?: 'formal' | 'casual' | 'technical'
  customInstructions?: string
}

interface ChapterStructure {
  order: number
  title: string
  summary: string
  learningObjectives: string[]
  estimatedMinutes: number
}

interface GeneratedStructure {
  name: string
  description: string
  difficultyLevel: string
  targetAudience: string
  durationMinutes: number
  tags: string[]
  chapters: ChapterStructure[]
}

interface GenerateRequest {
  materialId: string
  goal: string
  targetAudience?: string
  durationMinutes?: number
  difficultyLevel?: 'beginner' | 'intermediate' | 'advanced' | 'mixed'
  options?: GenerationOptions
  structure?: GeneratedStructure
  step: 'structure' | 'content'
}

// レスポンス用の型
interface GeneratedChapter {
  order: number
  title: string
  content: string
  taskDescription: string
  estimatedMinutes: number
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const headers = getCorsHeaders(event.headers.origin)

  // プリフライトチェック
  const preflightResponse = handlePreflight(event)
  if (preflightResponse) return preflightResponse

  // メソッドチェック
  const methodError = checkMethod(event, 'POST')
  if (methodError) return methodError

  // Anthropic API Key チェック
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicApiKey) {
    console.error('Missing Anthropic API key')
    return ErrorResponses.serverError(headers, 'AIサービスが設定されていません')
  }

  // 認証チェック（super_admin必須）
  const authResult = await checkAuth(event, { requireSuperAdmin: true })
  if (!authResult.success) {
    return authResult.response
  }

  const { supabase: supabaseAdmin } = authResult

  try {
    const body: GenerateRequest = JSON.parse(event.body || '{}')

    // バリデーション
    if (!body.materialId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '資料IDを指定してください' }),
      }
    }

    // 入力サニタイゼーションとバリデーション
    const goalValidation = validateUserInput('goal', body.goal, true)
    if (!goalValidation.valid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: goalValidation.error }),
      }
    }
    const sanitizedGoal = goalValidation.sanitized!

    const targetAudienceValidation = validateUserInput('targetAudience', body.targetAudience, false)
    if (!targetAudienceValidation.valid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: targetAudienceValidation.error }),
      }
    }
    const sanitizedTargetAudience = targetAudienceValidation.sanitized || '企業の一般社員'

    const customInstructionsValidation = validateUserInput('customInstructions', body.options?.customInstructions, false)
    if (!customInstructionsValidation.valid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: customInstructionsValidation.error }),
      }
    }
    const sanitizedCustomInstructions = customInstructionsValidation.sanitized || ''

    if (!body.step || !['structure', 'content'].includes(body.step)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'stepパラメータを指定してください (structure/content)' }),
      }
    }

    // 資料を取得
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

    if (material.extraction_status !== 'completed' || !material.extracted_text) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '資料のテキスト抽出が完了していません' }),
      }
    }

    // Anthropicクライアント初期化
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    })

    // パラメータ設定（サニタイズ済みの値を使用）
    const targetAudience = sanitizedTargetAudience
    const totalDuration = body.durationMinutes || 60
    const difficulty = body.difficultyLevel || 'beginner'
    const options = {
      ...body.options,
      customInstructions: sanitizedCustomInstructions, // サニタイズ済み
    }

    // 難易度ラベル
    const difficultyLabels: Record<string, string> = {
      beginner: '初級（基礎から丁寧に説明）',
      intermediate: '中級（基本は理解している前提で応用的な内容）',
      advanced: '上級（専門的な内容を深掘り）',
      mixed: '混合（複数の難易度レベルを含む）',
    }

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

    // 資料テキストを最大長に切り詰める（トークン制限対策）
    const maxTextLength = FILE_CONSTANTS.MAX_TEXT_LENGTH_FOR_AI
    const materialText = truncateText(material.extracted_text, maxTextLength)

    // 構成生成ステップ
    if (body.step === 'structure') {
      const systemPrompt = `あなたは企業研修のカリキュラム設計の専門家です。
与えられた資料の内容を分析し、効果的な学習カリキュラムの構成を設計してください。

## 生成パラメータ
- 内容の深さ: ${depthLabels[options.depthLevel || 'standard']}
- 演習比率: ${options.exerciseRatio ?? 20}%（解説と演習のバランス）
- 例示の量: ${exampleLabels[options.exampleFrequency || 'moderate']}
- 言語スタイル: ${toneLabels[options.toneStyle || 'formal']}
${options.customInstructions ? `- 追加指示: ${options.customInstructions}` : ''}

## 設計ガイドライン
- 資料の内容を効果的に学習できるよう、論理的な順序でチャプターを構成
- 各チャプターは5〜15分程度で学習できる適切なサイズに分割
- 段階的に難易度を上げる構成
- 各チャプターで達成すべき明確な学習目標を設定
- 資料の重要なポイントを漏れなくカバー

出力は必ず以下のJSON形式で返してください。JSON以外の文字列は含めないでください：
{
  "name": "カリキュラムタイトル（資料の内容を反映した具体的なタイトル）",
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

      const userPrompt = `以下の資料を基に、AI研修カリキュラムの構成を設計してください。

【研修ゴール】
${sanitizedGoal}

【対象者】
${targetAudience}

【目標所要時間】
約${totalDuration}分（チャプター合計）

【難易度】
${difficultyLabels[difficulty]}

【資料の内容】
${materialText}

上記の資料内容と条件に基づいて、効果的なカリキュラム構成をJSON形式で出力してください。
資料の重要なポイントを網羅し、学習しやすい順序で構成してください。`

      // Claude Opus 4.5で構成生成
      const message = await anthropic.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 4096,
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
      let structure: { name: string; description: string; chapters: ChapterStructure[]; tags: string[] }
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

      // レスポンス構造を検証
      if (!structure.name || !structure.chapters || !Array.isArray(structure.chapters)) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'AIの応答形式が不正です' }),
        }
      }

      // 構成を返却
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
            model: 'claude-opus-4-5-20251101',
          },
        }),
      }
    }

    // コンテンツ生成ステップ
    if (body.step === 'content') {
      if (!body.structure || !body.structure.chapters) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: '構成情報が必要です' }),
        }
      }

      const structure = body.structure
      const generatedChapters: GeneratedChapter[] = []
      let totalInputTokens = 0
      let totalOutputTokens = 0

      for (const chapter of structure.chapters) {
        const systemPrompt = `あなたは企業研修のコンテンツ作成の専門家です。
与えられた資料とチャプター構成に基づいて、詳細な学習コンテンツを作成してください。

## 生成パラメータ
- 内容の深さ: ${depthLabels[options.depthLevel || 'standard']}
- 演習比率: ${options.exerciseRatio ?? 20}%
- 例示の量: ${exampleLabels[options.exampleFrequency || 'moderate']}
- 言語スタイル: ${toneLabels[options.toneStyle || 'formal']}
${options.customInstructions ? `- 追加指示: ${options.customInstructions}` : ''}

## コンテンツ作成ガイドライン
- 資料の該当部分を正確に反映した内容
- 学習目標を達成できる具体的で分かりやすい説明
- 演習比率に応じた実践的なハンズオン課題
- Markdown形式で見やすく構造化されたコンテンツ
- 例示の量に応じた具体例やサンプル

出力は必ず以下のJSON形式で返してください。JSON以外の文字列は含めないでください：
{
  "content": "学習コンテンツ（Markdown形式）",
  "taskDescription": "ハンズオン課題の説明（具体的で実践的な内容）"
}`

        const chapterContext = `
【カリキュラム全体】
タイトル: ${structure.name}
説明: ${structure.description}
研修ゴール: ${sanitizedGoal}
対象者: ${structure.targetAudience}
難易度: ${difficultyLabels[structure.difficultyLevel]}

【このチャプター】
タイトル: ${chapter.title}
概要: ${chapter.summary}
学習目標:
${chapter.learningObjectives.map((obj: string, i: number) => `${i + 1}. ${obj}`).join('\n')}
目安時間: ${chapter.estimatedMinutes}分
チャプター番号: ${chapter.order} / ${structure.chapters.length}

【参照資料】
${truncateText(materialText, FILE_CONSTANTS.MAX_TEXT_LENGTH_FOR_CHAPTER)}`

        const userPrompt = `以下のチャプター構成と資料に基づいて、詳細な学習コンテンツを作成してください。
${chapterContext}

上記の構成と資料に基づいて、学習目標を達成できる詳細なコンテンツとハンズオン課題をJSON形式で出力してください。
資料の内容を正確に反映しつつ、分かりやすく構成してください。`

        // Claude Sonnet 4.5でコンテンツ生成
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

        totalInputTokens += message.usage.input_tokens
        totalOutputTokens += message.usage.output_tokens

        // テキスト応答を抽出
        const textContent = message.content.find(block => block.type === 'text')
        if (!textContent || textContent.type !== 'text') {
          throw new Error(`チャプター「${chapter.title}」のコンテンツ生成に失敗しました`)
        }

        // JSONをパース
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
          order: chapter.order,
          title: chapter.title,
          content: chapterContent.content,
          taskDescription: chapterContent.taskDescription,
          estimatedMinutes: chapter.estimatedMinutes,
        })
      }

      // 完成したカリキュラムを返却
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          curriculum: {
            name: structure.name,
            description: structure.description,
            difficultyLevel: structure.difficultyLevel,
            tags: structure.tags || [],
            chapters: generatedChapters,
          },
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            model: 'claude-sonnet-4-5-20250929',
            chaptersGenerated: generatedChapters.length,
          },
        }),
      }
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: '無効なリクエストです' }),
    }

  } catch (error) {
    console.error('Error generating curriculum from material:', error)

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

    const errorMessage = error instanceof Error ? error.message : 'カリキュラム生成中にエラーが発生しました'
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage }),
    }
  }
}

export { handler }
