// ============================================
// チャット送信 API（SSEストリーミング対応）
// POST /api/chat-send
// ============================================

import type { Handler, HandlerEvent } from '@netlify/functions'
import { checkAuth, handlePreflight, checkMethod } from './shared/auth'
import { getCorsHeaders } from './shared/cors'
import { ErrorResponses } from './shared/errors'
import { streamCompletion, formatSSEToken, formatSSEDone, formatSSEError, AIMessage, DEFAULT_MODELS, AIProvider } from './shared/ai-providers'
import { checkTokenLimits, recordTokenUsage, calculateCost } from './shared/token-tracking'
import { sanitizeUserInput } from './shared/validation'

// ============================================
// リクエスト型
// ============================================
interface ChatSendRequest {
  sessionId?: string
  message: string
  provider?: AIProvider
  modelId?: string
  curriculumId?: string
  chapterId?: string
  sessionType?: 'learning' | 'qa' | 'general'
}

// ============================================
// ハンドラー
// ============================================
export const handler: Handler = async (event: HandlerEvent) => {
  // プリフライト処理
  const preflightResponse = handlePreflight(event)
  if (preflightResponse) return preflightResponse

  // メソッドチェック
  const methodError = checkMethod(event, 'POST')
  if (methodError) return methodError

  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // 認証チェック（trainee以上）
  const authResult = await checkAuth(event, {
    allowedRoles: ['super_admin', 'group_admin', 'trainee'],
  })
  if (!authResult.success) {
    return authResult.response
  }
  const { user, supabase } = authResult

  try {
    // リクエストボディのパース
    const body: ChatSendRequest = JSON.parse(event.body || '{}')
    const { sessionId, message, provider = 'anthropic', modelId, curriculumId, chapterId, sessionType = 'learning' } = body

    // メッセージのバリデーション
    if (!message || message.trim().length === 0) {
      return ErrorResponses.validationError(headers, 'メッセージを入力してください')
    }

    // 入力サニタイズ
    const sanitizedMessage = sanitizeUserInput(message)
    if (sanitizedMessage.length > 10000) {
      return ErrorResponses.validationError(headers, 'メッセージが長すぎます（最大10,000文字）')
    }

    // ユーザープロファイル取得
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, group_id, company_id, name')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return ErrorResponses.notFound(headers, 'プロファイル')
    }

    // トークン制限チェック
    const limitCheck = await checkTokenLimits(supabase, user.id)
    if (!limitCheck.allowed) {
      return ErrorResponses.rateLimited(headers)
    }

    // AIモデル取得または決定
    let selectedModelId = modelId || DEFAULT_MODELS[provider]
    let aiModelRecord: { id: string; model_id: string; provider: string } | null = null

    // DBからモデル情報を取得
    const { data: aiModel } = await supabase
      .from('ai_models')
      .select('id, model_id, provider')
      .eq('model_id', selectedModelId)
      .eq('is_active', true)
      .single()

    if (aiModel) {
      aiModelRecord = aiModel
      selectedModelId = aiModel.model_id
    }

    // セッション取得または作成
    let session: { id: string; system_prompt: string | null }

    if (sessionId) {
      // 既存セッション取得
      const { data: existingSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('id, system_prompt, profile_id')
        .eq('id', sessionId)
        .single()

      if (sessionError || !existingSession) {
        return ErrorResponses.notFound(headers, 'セッション')
      }

      // 自分のセッションかチェック
      if (existingSession.profile_id !== user.id) {
        return ErrorResponses.forbidden(headers, 'このセッションにアクセスする権限がありません')
      }

      session = existingSession
    } else {
      // 新規セッション作成
      const systemPrompt = await buildSystemPrompt(supabase, sessionType, curriculumId, chapterId)

      const { data: newSession, error: createError } = await supabase
        .from('chat_sessions')
        .insert({
          profile_id: user.id,
          session_type: sessionType,
          status: 'active',
          curriculum_id: curriculumId || null,
          chapter_id: chapterId || null,
          ai_model_id: aiModelRecord?.id || null,
          system_prompt: systemPrompt,
          title: sanitizedMessage.substring(0, 50) + (sanitizedMessage.length > 50 ? '...' : ''),
          started_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        })
        .select('id, system_prompt')
        .single()

      if (createError || !newSession) {
        console.error('Failed to create session:', createError)
        return ErrorResponses.serverError(headers, 'セッションの作成に失敗しました')
      }

      session = newSession
    }

    // ユーザーメッセージをDBに保存
    const { error: userMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: session.id,
        role: 'user',
        content: sanitizedMessage,
      })

    if (userMsgError) {
      console.error('Failed to save user message:', userMsgError)
    }

    // 会話履歴を取得
    const { data: historyMessages } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(20) // 最新20件に制限

    const messages: AIMessage[] = (historyMessages || []).map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }))

    // SSEストリーミングレスポンスを構築
    const encoder = new TextEncoder()
    let fullResponse = ''
    let totalInputTokens = 0
    let totalOutputTokens = 0

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // ストリーミング開始イベント
          controller.enqueue(encoder.encode(formatSSEToken('')))

          // AIストリーミング
          const aiStream = streamCompletion({
            provider,
            model: selectedModelId,
            messages,
            systemPrompt: session.system_prompt || undefined,
            maxTokens: 4096,
            temperature: 0.7,
          })

          for await (const chunk of aiStream) {
            if (chunk.type === 'token') {
              fullResponse += chunk.data as string
              controller.enqueue(encoder.encode(formatSSEToken(chunk.data as string)))
            } else if (chunk.type === 'done') {
              const usage = chunk.data as { inputTokens: number; outputTokens: number }
              totalInputTokens = usage.inputTokens
              totalOutputTokens = usage.outputTokens
              controller.enqueue(encoder.encode(formatSSEDone(usage)))
            } else if (chunk.type === 'error') {
              controller.enqueue(encoder.encode(formatSSEError((chunk.data as Error).message)))
            }
          }

          // アシスタントメッセージをDBに保存
          await supabase.from('chat_messages').insert({
            session_id: session.id,
            role: 'assistant',
            content: fullResponse,
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            metadata: { model_used: selectedModelId },
          })

          // セッションの最終メッセージ時刻を更新
          await supabase
            .from('chat_sessions')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', session.id)

          // トークン使用量を記録
          const estimatedCost = calculateCost(selectedModelId, totalInputTokens, totalOutputTokens)
          await recordTokenUsage(supabase, {
            profileId: user.id,
            groupId: profile.group_id,
            companyId: profile.company_id,
            aiModelId: aiModelRecord?.id,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            estimatedCost,
            sessionId: session.id,
          })

          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          controller.enqueue(
            encoder.encode(formatSSEError(error instanceof Error ? error.message : 'ストリーミングエラー'))
          )
          controller.close()
        }
      },
    })

    // SSEレスポンスを返す
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body: stream,
      isBase64Encoded: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  } catch (error) {
    console.error('Chat send error:', error)
    return ErrorResponses.serverError(headers, 'チャット送信に失敗しました')
  }
}

// ============================================
// システムプロンプト構築
// ============================================
async function buildSystemPrompt(
  supabase: ReturnType<typeof import('./shared/auth').createSupabaseAdmin>,
  sessionType: string,
  curriculumId?: string,
  chapterId?: string
): Promise<string> {
  const basePrompt = `あなたはAI研修プラットフォームの学習支援アシスタントです。
研修生の学習をサポートし、質問に丁寧に回答してください。

重要なガイドライン:
- 研修内容に関する質問には、具体例を交えて分かりやすく説明してください
- 技術的な質問には、実践的なアドバイスを含めてください
- 分からないことは正直に伝え、推測で回答しないでください
- 研修生の理解度に合わせて説明の詳しさを調整してください`

  // カリキュラム・チャプター情報を追加
  if (curriculumId && supabase) {
    const { data: curriculum } = await supabase
      .from('curricula')
      .select('name, description')
      .eq('id', curriculumId)
      .single()

    if (curriculum) {
      let contextPrompt = `\n\n現在の学習コンテキスト:
- カリキュラム: ${curriculum.name}
- 概要: ${curriculum.description || '（説明なし）'}`

      if (chapterId) {
        const { data: chapter } = await supabase
          .from('chapters')
          .select('title, content, task_description')
          .eq('id', chapterId)
          .single()

        if (chapter) {
          contextPrompt += `\n- チャプター: ${chapter.title}`
          if (chapter.task_description) {
            contextPrompt += `\n- 課題: ${chapter.task_description}`
          }
          // チャプター内容の一部を含める（長すぎる場合は切り詰め）
          if (chapter.content) {
            const truncatedContent = chapter.content.length > 2000
              ? chapter.content.substring(0, 2000) + '...'
              : chapter.content
            contextPrompt += `\n\nチャプター内容（参考）:\n${truncatedContent}`
          }
        }
      }

      return basePrompt + contextPrompt
    }
  }

  // QAセッションの場合
  if (sessionType === 'qa') {
    return `${basePrompt}

このセッションはQ&A用です。プラットフォームの使い方や一般的な質問に回答してください。
システムの不具合報告や緊急の問題については、管理者へのエスカレーションを案内してください。`
  }

  return basePrompt
}
