// ============================================
// QAチャットボット API（エスカレーション判定付き）
// POST /api/qa-ask
// ============================================

import type { Handler, HandlerEvent } from '@netlify/functions'
import { SupabaseClient } from '@supabase/supabase-js'
import { checkAuth, handlePreflight, checkMethod } from './shared/auth'
import { getCorsHeaders } from './shared/cors'
import { ErrorResponses } from './shared/errors'
import { streamCompletion, formatSSEToken, formatSSEDone, formatSSEError, AIMessage } from './shared/ai-providers'
import { checkTokenLimits, recordTokenUsage, calculateCost } from './shared/token-tracking'
import { sanitizeUserInput } from './shared/validation'
import { searchSimilarContent, SimilarContent } from './shared/embeddings'

// ============================================
// 定数定義
// ============================================
const MAX_CHAPTER_CONTENT_LENGTH = 1000  // チャプター内容の最大文字数

// ============================================
// エスカレーション通知ペイロード型
// ============================================
interface EscalationNotifyPayload {
  sessionId: string
  profileId: string
  trigger?: string
  keywords?: string[]
  message: string
  userName: string
  userEmail: string
  companyId?: string | null
  groupId?: string | null
}

// ============================================
// エスカレーション通知（リトライ付き）
// ============================================
async function sendEscalationNotifyWithRetry(
  payload: EscalationNotifyPayload,
  maxRetries: number = 3
): Promise<void> {
  const internalSecret = process.env.INTERNAL_API_SECRET
  const notifyUrl = `${process.env.URL}/.netlify/functions/escalation-notify`

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(notifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 内部API認証ヘッダー（設定されている場合のみ）
          ...(internalSecret ? { 'X-Internal-Secret': internalSecret } : {}),
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        console.log(`Escalation notification sent successfully (attempt ${attempt})`)
        return
      }

      // 4xx エラーはリトライしない（認証エラー等）
      if (response.status >= 400 && response.status < 500) {
        console.error(`Escalation notify failed with client error: ${response.status}`)
        return
      }

      // 5xx エラーはリトライ
      console.warn(`Escalation notify attempt ${attempt} failed with status ${response.status}`)
    } catch (err) {
      console.error(`Escalation notify attempt ${attempt} error:`, err)
    }

    // リトライ前に待機（指数バックオフ: 1秒, 2秒, 4秒）
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt - 1) * 1000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  // 全リトライ失敗
  console.error(`Escalation notification failed after ${maxRetries} attempts for session ${payload.sessionId}`)
}

// ============================================
// エスカレーションキーワード
// ============================================
const ESCALATION_KEYWORDS = {
  system_error: ['エラー', 'バグ', '動かない', '表示されない', 'クラッシュ', 'フリーズ', '500', '404', 'システム障害'],
  bug_report: ['不具合', 'おかしい', '壊れ', '正しく動作しない', '意図しない動作'],
  urgent: ['緊急', '至急', '急ぎ', 'すぐに', '今すぐ', '大至急'],
}

// ============================================
// エスカレーション判定
// ============================================
function checkEscalation(message: string): { shouldEscalate: boolean; trigger?: string; keywords?: string[] } {
  const lowerMessage = message.toLowerCase()

  for (const [trigger, keywords] of Object.entries(ESCALATION_KEYWORDS)) {
    const matchedKeywords = keywords.filter(keyword =>
      lowerMessage.includes(keyword.toLowerCase())
    )
    if (matchedKeywords.length > 0) {
      return { shouldEscalate: true, trigger, keywords: matchedKeywords }
    }
  }

  return { shouldEscalate: false }
}

// ============================================
// QA用システムプロンプト（ベース）
// ============================================
const QA_BASE_PROMPT = `あなたはAI研修プラットフォーム専用のQAアシスタントです。
このプラットフォームに関する質問にのみ回答してください。

【対応範囲】
- プラットフォームの使い方・操作方法
- カリキュラムや研修内容に関する質問
- AI（ChatGPT, Claude, Gemini）の業務活用方法
- 研修の進め方・学習方法のアドバイス

【対応範囲外 - 回答を拒否】
- 研修プラットフォームと無関係な一般的な質問
- 雑談・世間話・個人的な相談
- プログラミングの具体的なコード作成依頼
- 翻訳・文章作成などの汎用AI作業
→ これらは「申し訳ございませんが、このQAアシスタントは研修プラットフォームに関する質問専用です。」と回答して終了

【エスカレーション対象】
- システムの不具合やバグの報告 → 管理者へ転送
- アカウントや請求に関する問題 → サポートへ案内
- セキュリティに関する懸念 → 管理者へ転送

【重要な指針】
- 対応範囲外の質問には一切回答しない（トークン節約のため）
- 分からないことは正直に「分かりません」と伝える
- 技術的な問題は管理者への連絡を案内する
- 簡潔で分かりやすい回答を心がける
- 以下の「参考情報」がある場合は、それを活用して回答する`

// ============================================
// RAG検索結果からコンテキストを構築
// ============================================
function buildRAGContext(similarContent: SimilarContent[]): string {
  if (similarContent.length === 0) return ''

  const contextParts = similarContent.map((item, index) => {
    const metadata = item.metadata as { title?: string }
    const title = metadata.title || '関連情報'
    return `[${index + 1}] ${title}\n${item.contentChunk}`
  })

  return `\n\n【参考情報（ナレッジベース）】\n${contextParts.join('\n\n')}`
}

// ============================================
// カリキュラムコンテキストを構築
// ============================================
async function buildCurriculumContext(
  supabase: SupabaseClient,
  profileId: string
): Promise<string> {
  // ユーザーの現在学習中のカリキュラムを取得
  const { data: progress } = await supabase
    .from('curriculum_progress')
    .select(`
      curriculum_id,
      current_chapter_id,
      curricula(name, description),
      chapters(title, content)
    `)
    .eq('profile_id', profileId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (!progress) return ''

  // 型アサーション
  const curriculum = progress.curricula as { name: string; description: string } | null
  const chapter = progress.chapters as { title: string; content: string } | null

  if (!curriculum) return ''

  let context = `\n\n【現在の学習コンテキスト】
- カリキュラム: ${curriculum.name}
- 概要: ${curriculum.description || '（説明なし）'}`

  if (chapter) {
    context += `\n- 学習中のチャプター: ${chapter.title}`
    // チャプター内容の一部を含める（長すぎる場合は切り詰め）
    if (chapter.content) {
      const truncatedContent = chapter.content.length > MAX_CHAPTER_CONTENT_LENGTH
        ? chapter.content.substring(0, MAX_CHAPTER_CONTENT_LENGTH) + '...'
        : chapter.content
      context += `\n\nチャプター内容（参考）:\n${truncatedContent}`
    }
  }

  return context
}

// ============================================
// 完全なシステムプロンプトを構築
// ============================================
async function buildFullSystemPrompt(
  supabase: SupabaseClient,
  profileId: string,
  userMessage: string,
  companyId?: string | null
): Promise<string> {
  let fullPrompt = QA_BASE_PROMPT

  try {
    // RAG検索（類似コンテンツを検索）
    const similarContent = await searchSimilarContent(supabase, userMessage, {
      matchThreshold: 0.6,
      matchCount: 3,
      companyId: companyId || undefined,
    })
    const ragContext = buildRAGContext(similarContent)
    if (ragContext) {
      fullPrompt += ragContext
    }
  } catch (err) {
    // RAG検索に失敗してもエラーにしない（フォールバック）
    console.warn('RAG search failed:', err)
  }

  try {
    // カリキュラムコンテキスト
    const curriculumContext = await buildCurriculumContext(supabase, profileId)
    if (curriculumContext) {
      fullPrompt += curriculumContext
    }
  } catch (err) {
    // カリキュラムコンテキスト取得に失敗してもエラーにしない
    console.warn('Curriculum context failed:', err)
  }

  return fullPrompt
}

// ============================================
// ハンドラー
// ============================================
export const handler: Handler = async (event: HandlerEvent) => {
  const preflightResponse = handlePreflight(event)
  if (preflightResponse) return preflightResponse

  const methodError = checkMethod(event, 'POST')
  if (methodError) return methodError

  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  const authResult = await checkAuth(event, {
    allowedRoles: ['super_admin', 'group_admin', 'trainee'],
  })
  if (!authResult.success) {
    return authResult.response
  }
  const { user, supabase } = authResult

  try {
    const body = JSON.parse(event.body || '{}')
    const { sessionId, message } = body

    if (!message || message.trim().length === 0) {
      return ErrorResponses.validationError(headers, 'メッセージを入力してください')
    }

    const sanitizedMessage = sanitizeUserInput(message)
    if (sanitizedMessage.length > 5000) {
      return ErrorResponses.validationError(headers, 'メッセージが長すぎます（最大5,000文字）')
    }

    // プロファイル取得
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, group_id, company_id, name, email')
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

    // エスカレーション判定
    const escalationCheck = checkEscalation(sanitizedMessage)

    // 動的システムプロンプトを構築（RAG + カリキュラムコンテキスト）
    const dynamicSystemPrompt = await buildFullSystemPrompt(
      supabase,
      user.id,
      sanitizedMessage,
      profile.company_id
    )

    // セッション取得または作成
    let session: { id: string }

    if (sessionId) {
      const { data: existingSession } = await supabase
        .from('chat_sessions')
        .select('id, profile_id')
        .eq('id', sessionId)
        .single()

      if (!existingSession || existingSession.profile_id !== user.id) {
        return ErrorResponses.notFound(headers, 'セッション')
      }
      session = existingSession
    } else {
      const { data: newSession, error: createError } = await supabase
        .from('chat_sessions')
        .insert({
          profile_id: user.id,
          session_type: 'qa',
          status: 'active',
          system_prompt: QA_BASE_PROMPT, // セッションにはベースプロンプトを保存
          title: sanitizedMessage.substring(0, 50) + (sanitizedMessage.length > 50 ? '...' : ''),
          started_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (createError || !newSession) {
        return ErrorResponses.serverError(headers, 'セッションの作成に失敗しました')
      }
      session = newSession
    }

    // ユーザーメッセージ保存
    await supabase.from('chat_messages').insert({
      session_id: session.id,
      role: 'user',
      content: sanitizedMessage,
    })

    // エスカレーションが必要な場合
    if (escalationCheck.shouldEscalate) {
      // エスカレーションログを記録
      await supabase.from('escalation_logs').insert({
        session_id: session.id,
        profile_id: user.id,
        trigger: escalationCheck.trigger,
        trigger_details: {
          matched_keywords: escalationCheck.keywords,
          original_message: sanitizedMessage,
        },
        is_resolved: false,
      })

      // セッションをエスカレーション状態に更新
      await supabase
        .from('chat_sessions')
        .update({
          status: 'escalated',
          escalated_at: new Date().toISOString(),
          escalation_reason: `キーワード検出: ${escalationCheck.keywords?.join(', ')}`,
        })
        .eq('id', session.id)

      // エスカレーション通知を非同期で送信（リトライ付き）
      sendEscalationNotifyWithRetry({
        sessionId: session.id,
        profileId: user.id,
        trigger: escalationCheck.trigger,
        keywords: escalationCheck.keywords,
        message: sanitizedMessage,
        userName: profile.name,
        userEmail: profile.email,
        companyId: profile.company_id,
        groupId: profile.group_id,
      })
    }

    // 会話履歴取得
    const { data: historyMessages } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(10)

    const messages: AIMessage[] = (historyMessages || []).map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }))

    // ストリーミングレスポンス
    const encoder = new TextEncoder()
    let fullResponse = ''
    let totalInputTokens = 0
    let totalOutputTokens = 0

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // エスカレーション通知をストリームの最初に送信
          if (escalationCheck.shouldEscalate) {
            controller.enqueue(encoder.encode(
              `event: escalation\ndata: ${JSON.stringify({
                trigger: escalationCheck.trigger,
                message: 'この質問は管理者に転送されました。追って対応いたします。',
              })}\n\n`
            ))
          }

          const aiStream = streamCompletion({
            provider: 'anthropic',
            model: 'claude-3-5-haiku-20241022', // QAには高速なHaikuを使用
            messages,
            systemPrompt: dynamicSystemPrompt, // RAG + カリキュラムコンテキスト付き
            maxTokens: 2048,
            temperature: 0.5,
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

          // アシスタントメッセージ保存
          await supabase.from('chat_messages').insert({
            session_id: session.id,
            role: 'assistant',
            content: fullResponse,
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          })

          // セッション更新
          await supabase
            .from('chat_sessions')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', session.id)

          // トークン使用量記録
          const estimatedCost = calculateCost('claude-3-5-haiku-20241022', totalInputTokens, totalOutputTokens)
          await recordTokenUsage(supabase, {
            profileId: user.id,
            groupId: profile.group_id,
            companyId: profile.company_id,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            estimatedCost,
            sessionId: session.id,
          })

          controller.close()
        } catch (error) {
          console.error('QA streaming error:', error)
          controller.enqueue(encoder.encode(formatSSEError('エラーが発生しました')))
          controller.close()
        }
      },
    })

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
    console.error('QA ask error:', error)
    return ErrorResponses.serverError(headers, 'QA処理に失敗しました')
  }
}
