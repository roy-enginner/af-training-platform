import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

interface SeriesRequest {
  seriesId: string
  materialId?: string  // 資料ID（任意）
  totalDurationMinutes: number
  durationPerPartMinutes: number
  templateId?: string
  options?: {
    depthLevel?: 'overview' | 'standard' | 'deep'
    exerciseRatio?: number
    exampleFrequency?: 'minimal' | 'moderate' | 'abundant'
    toneStyle?: 'formal' | 'casual' | 'technical'
  }
}

interface CurriculumPart {
  order: number
  partTitle: string
  name: string
  description: string
  durationMinutes: number
  chapters: {
    order: number
    title: string
    estimatedMinutes: number
  }[]
}

interface SeriesStructure {
  parts: CurriculumPart[]
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
    const body: SeriesRequest = JSON.parse(event.body || '{}')

    if (!body.seriesId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'シリーズIDを指定してください' }),
      }
    }

    // シリーズ情報を取得
    const { data: series, error: seriesError } = await supabaseAdmin
      .from('curriculum_series')
      .select('*')
      .eq('id', body.seriesId)
      .single()

    if (seriesError || !series) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'シリーズが見つかりません' }),
      }
    }

    // 資料テキスト取得（あれば）
    let materialText = ''
    if (body.materialId) {
      const { data: material } = await supabaseAdmin
        .from('source_materials')
        .select('extracted_text, name')
        .eq('id', body.materialId)
        .single()

      if (material?.extracted_text) {
        materialText = material.extracted_text.substring(0, 15000)
      }
    }

    // テンプレート情報取得（あれば）
    let templateContent: Record<string, unknown> = {}
    if (body.templateId) {
      const { data: template } = await supabaseAdmin
        .from('curriculum_templates')
        .select('content')
        .eq('id', body.templateId)
        .single()

      if (template?.content) {
        templateContent = template.content as Record<string, unknown>
      }
    }

    // オプションをマージ
    const options = {
      depthLevel: body.options?.depthLevel || templateContent.depthLevel || 'standard',
      exerciseRatio: body.options?.exerciseRatio ?? templateContent.exerciseRatio ?? 30,
      exampleFrequency: body.options?.exampleFrequency || templateContent.exampleFrequency || 'moderate',
      toneStyle: body.options?.toneStyle || templateContent.toneStyle || 'formal',
    }

    // パート数を計算
    const numParts = Math.ceil(body.totalDurationMinutes / body.durationPerPartMinutes)

    // Anthropicクライアント初期化
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    })

    // 生成オプションラベル
    const depthLabels: Record<string, string> = {
      overview: '概要中心',
      standard: '標準',
      deep: '深掘り',
    }

    const difficultyLabels: Record<string, string> = {
      beginner: '初級',
      intermediate: '中級',
      advanced: '上級',
      mixed: '混合',
    }

    const systemPrompt = `あなたは企業研修のカリキュラム設計の専門家です。
シリーズ全体の構成を設計し、各パート（カリキュラム）の構成を出力してください。

## シリーズ情報
- シリーズ名: ${series.name}
- 説明: ${series.description || ''}
- タイプ: ${series.series_type === 'sequential' ? '順序型（順番に受講）' : 'モジュール型（独立受講可能）'}
- 難易度: ${difficultyLabels[series.difficulty_level || 'beginner']}
- 対象者: ${series.target_audience || '企業研修受講者'}

## 要件
- 合計時間: ${body.totalDurationMinutes}分
- 1パートあたり: ${body.durationPerPartMinutes}分
- パート数: ${numParts}パート
- 内容の深さ: ${depthLabels[options.depthLevel as string]}

## 設計ガイドライン
- 各パートは独立したテーマを持つ
- ${series.series_type === 'sequential' ? 'パート間で連続性を持たせる' : '各パートは独立して受講できる構成にする'}
- 各パートには3-5個のチャプターを含める
- チャプターの時間配分は内容に応じて調整

出力は必ず以下のJSON形式で返してください。JSON以外の文字列は含めないでください：
{
  "parts": [
    {
      "order": 1,
      "partTitle": "Day 1: 基礎編",
      "name": "カリキュラム名",
      "description": "このパートで学ぶ内容の説明",
      "durationMinutes": 60,
      "chapters": [
        {
          "order": 0,
          "title": "チャプタータイトル",
          "estimatedMinutes": 15
        }
      ]
    }
  ]
}`

    const userPrompt = `以下の条件でシリーズの構成を設計してください。

${materialText ? `【参照資料】\n${materialText}\n\n` : ''}【追加要件】
- 各パートの合計時間が${body.durationPerPartMinutes}分程度になるように設計
- ${numParts}パートで構成
- 実践的な演習を含める

上記の情報を踏まえて、シリーズ全体の構成をJSON形式で出力してください。`

    // Claude Opus 4.5で構成生成
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
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
    let seriesStructure: SeriesStructure
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
      seriesStructure = JSON.parse(jsonStr.trim())
    } catch {
      console.error('Failed to parse series structure JSON:', textContent.text)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AIの応答を解析できませんでした' }),
      }
    }

    // 各パートのカリキュラムを作成
    const createdCurricula = []

    for (const part of seriesStructure.parts) {
      // カリキュラム作成
      const { data: curriculum, error: curriculumError } = await supabaseAdmin
        .from('curricula')
        .insert({
          name: part.name,
          description: part.description,
          content_type: 'document',
          duration_minutes: part.durationMinutes,
          difficulty_level: series.difficulty_level || 'beginner',
          tags: series.tags || [],
          is_active: true,
          series_id: body.seriesId,
          series_order: part.order,
          part_title: part.partTitle,
          source_material_id: body.materialId || null,
          template_id: body.templateId || null,
          generation_params: options,
        })
        .select()
        .single()

      if (curriculumError) {
        console.error('Failed to create curriculum:', curriculumError)
        continue
      }

      // チャプター作成
      const chaptersToInsert = part.chapters.map(chapter => ({
        curriculum_id: curriculum.id,
        title: chapter.title,
        content: null,  // 後で生成
        task_description: null,
        estimated_minutes: chapter.estimatedMinutes,
        sort_order: chapter.order,
        is_active: true,
      }))

      const { error: chaptersError } = await supabaseAdmin
        .from('chapters')
        .insert(chaptersToInsert)

      if (chaptersError) {
        console.error('Failed to create chapters:', chaptersError)
      }

      createdCurricula.push({
        id: curriculum.id,
        name: curriculum.name,
        partTitle: part.partTitle,
        chapterCount: part.chapters.length,
      })
    }

    // シリーズの合計時間を更新
    await supabaseAdmin
      .from('curriculum_series')
      .update({
        total_duration_minutes: body.totalDurationMinutes,
      })
      .eq('id', body.seriesId)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: `${createdCurricula.length}件のカリキュラムを作成しました`,
        series: {
          id: series.id,
          name: series.name,
        },
        curricula: createdCurricula,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          model: 'claude-opus-4-5-20251101',
        },
      }),
    }

  } catch (error) {
    console.error('Error generating series:', error)

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

    const errorMessage = error instanceof Error ? error.message : 'シリーズ生成中にエラーが発生しました'
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage }),
    }
  }
}

export { handler }
