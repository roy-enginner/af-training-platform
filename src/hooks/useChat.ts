// ============================================
// チャット管理フック
// ============================================

import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  ChatSession,
  ChatMessage,
  ChatSessionType,
  AIProvider,
  ChatSessionWithMessages,
} from '@/types/database'

// ============================================
// 型定義
// ============================================
export interface UseChatOptions {
  sessionType?: ChatSessionType
  curriculumId?: string
  chapterId?: string
  provider?: AIProvider
  modelId?: string
  autoLoadSession?: boolean
}

export interface UseChatReturn {
  // 状態
  session: ChatSession | null
  messages: ChatMessage[]
  isLoading: boolean
  isStreaming: boolean
  error: string | null
  streamingContent: string

  // アクション
  sendMessage: (content: string) => Promise<void>
  loadSession: (sessionId: string) => Promise<void>
  createSession: () => Promise<string | null>
  clearSession: () => void
  setProvider: (provider: AIProvider) => void
  setModelId: (modelId: string) => void
}

// ============================================
// useChat フック
// ============================================
export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const {
    sessionType = 'learning',
    curriculumId,
    chapterId,
    provider: initialProvider = 'anthropic',
    modelId: initialModelId,
    autoLoadSession = false,
  } = options

  const [session, setSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [provider, setProvider] = useState<AIProvider>(initialProvider)
  const [modelId, setModelId] = useState<string | undefined>(initialModelId)

  const abortControllerRef = useRef<AbortController | null>(null)

  // 自動セッションロード
  useEffect(() => {
    if (autoLoadSession && curriculumId) {
      loadLatestSession()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoadSession, curriculumId, chapterId])

  // 最新のセッションをロード
  const loadLatestSession = useCallback(async () => {
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) return

      const params = new URLSearchParams({
        type: sessionType,
        limit: '1',
        includeMessages: 'true',
      })
      if (curriculumId) params.append('curriculumId', curriculumId)

      const response = await fetch(`/.netlify/functions/chat-sessions?${params}`, {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.sessions && data.sessions.length > 0) {
          const latestSession = data.sessions[0]
          setSession(latestSession)
          // メッセージも取得
          await loadSession(latestSession.id)
        }
      }
    } catch (err) {
      console.error('Failed to load latest session:', err)
    }
  }, [sessionType, curriculumId])

  // セッションロード
  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) {
        throw new Error('認証が必要です')
      }

      const response = await fetch(
        `/.netlify/functions/chat-sessions?id=${sessionId}&includeMessages=true`,
        {
          headers: {
            Authorization: `Bearer ${authSession.access_token}`,
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || `[チャット/セッション読み込み] セッションの読み込みに失敗しました (HTTP ${response.status})`)
      }

      const data: { session: ChatSessionWithMessages } = await response.json()
      setSession(data.session)
      setMessages(data.session.messages || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : '[チャット/セッション読み込み] 予期しないエラーが発生しました'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 新規セッション作成
  const createSession = useCallback(async (): Promise<string | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) {
        throw new Error('認証が必要です')
      }

      const response = await fetch('/.netlify/functions/chat-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({
          sessionType,
          curriculumId,
          chapterId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || `[チャット/セッション作成] セッションの作成に失敗しました (HTTP ${response.status})`)
      }

      const data: { session: ChatSession } = await response.json()
      setSession(data.session)
      setMessages([])
      return data.session.id
    } catch (err) {
      const message = err instanceof Error ? err.message : '[チャット/セッション作成] 予期しないエラーが発生しました'
      setError(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [sessionType, curriculumId, chapterId])

  // メッセージ送信（SSEストリーミング）
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return

    setError(null)
    setIsStreaming(true)
    setStreamingContent('')

    // ユーザーメッセージを即座に追加
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: session?.id || '',
      role: 'user',
      content,
      input_tokens: null,
      output_tokens: null,
      metadata: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) {
        throw new Error('認証が必要です')
      }

      // AbortController for cancellation
      abortControllerRef.current = new AbortController()

      const response = await fetch('/.netlify/functions/chat-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({
          sessionId: session?.id,
          message: content,
          provider,
          modelId,
          curriculumId,
          chapterId,
          sessionType,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || `[チャット/メッセージ送信] サーバーからエラーが返されました (HTTP ${response.status})`)
      }

      // SSEストリーミング処理
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('[チャット/ストリーム処理] レスポンスボディの読み取りに失敗しました。ネットワーク接続を確認してください。')
      }

      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          // SSEイベントタイプ行はスキップ
          if (line.startsWith('event: ')) {
            continue
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.token !== undefined) {
                fullContent += data.token
                setStreamingContent(fullContent)
              } else if (data.usage) {
                // 完了時、アシスタントメッセージを追加
                const assistantMessage: ChatMessage = {
                  id: `assistant-${Date.now()}`,
                  session_id: session?.id || '',
                  role: 'assistant',
                  content: fullContent,
                  input_tokens: data.usage.inputTokens,
                  output_tokens: data.usage.outputTokens,
                  metadata: null,
                  created_at: new Date().toISOString(),
                }
                setMessages((prev) => [...prev, assistantMessage])
              } else if (data.message) {
                // エラーメッセージ
                throw new Error(data.message)
              }
            } catch (parseError) {
              // JSON パースエラーは無視（不完全なチャンクの可能性）
            }
          }
        }
      }

      // セッションIDが新しく作成された場合、セッション情報を更新
      if (!session?.id) {
        await loadLatestSession()
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // キャンセルされた場合
        return
      }
      const message = err instanceof Error ? err.message : '[チャット/メッセージ送信] 予期しないエラーが発生しました'
      setError(message)
      // エラー時はユーザーメッセージも削除
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id))
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      abortControllerRef.current = null
    }
  }, [session?.id, provider, modelId, curriculumId, chapterId, sessionType, loadLatestSession])

  // セッションクリア
  const clearSession = useCallback(() => {
    setSession(null)
    setMessages([])
    setError(null)
    setStreamingContent('')
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  return {
    session,
    messages,
    isLoading,
    isStreaming,
    error,
    streamingContent,
    sendMessage,
    loadSession,
    createSession,
    clearSession,
    setProvider,
    setModelId,
  }
}

// ============================================
// セッション一覧取得フック
// ============================================
export interface UseChatSessionsOptions {
  sessionType?: ChatSessionType
  curriculumId?: string
  limit?: number
}

export function useChatSessions(options: UseChatSessionsOptions = {}) {
  const { sessionType, curriculumId, limit = 20 } = options
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const fetchSessions = useCallback(async (offset = 0) => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) {
        throw new Error('認証が必要です')
      }

      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      })
      if (sessionType) params.append('type', sessionType)
      if (curriculumId) params.append('curriculumId', curriculumId)

      const response = await fetch(`/.netlify/functions/chat-sessions?${params}`, {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || `[チャット/セッション一覧] セッション一覧の取得に失敗しました (HTTP ${response.status})`)
      }

      const data = await response.json()
      setSessions(data.sessions || [])
      setTotal(data.total || 0)
    } catch (err) {
      const message = err instanceof Error ? err.message : '[チャット/セッション一覧] 予期しないエラーが発生しました'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [sessionType, curriculumId, limit])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) {
        throw new Error('認証が必要です')
      }

      const response = await fetch(`/.netlify/functions/chat-sessions?id=${sessionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || `[チャット/セッション削除] セッションの削除に失敗しました (HTTP ${response.status})`)
      }

      // 一覧から削除
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      setTotal((prev) => prev - 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : '[チャット/セッション削除] 予期しないエラーが発生しました'
      setError(message)
    }
  }, [])

  return {
    sessions,
    isLoading,
    error,
    total,
    fetchSessions,
    deleteSession,
  }
}
