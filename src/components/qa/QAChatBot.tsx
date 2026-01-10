// ============================================
// QAチャットボット（Floating FAB + ウィンドウ）
// 全ページで利用可能な独立したQAボット
// ============================================

import { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  QuestionMarkCircleIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { SparklesIcon } from '@heroicons/react/24/solid'
import { supabase } from '@/lib/supabase'
import type { ChatMessage } from '@/types/database'

// ============================================
// QAChatBot コンポーネント
// ============================================
export function QAChatBot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [escalationWarning, setEscalationWarning] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // フォーカス
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // メッセージ送信
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    const userMessage = input.trim()
    setInput('')
    setError(null)
    setEscalationWarning(null)
    setIsStreaming(true)
    setStreamingContent('')

    // ユーザーメッセージを追加
    const tempUserMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      session_id: sessionId || '',
      role: 'user',
      content: userMessage,
      input_tokens: null,
      output_tokens: null,
      metadata: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('認証が必要です')
      }

      const response = await fetch('/.netlify/functions/qa-ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
        }),
      })

      if (!response.ok) {
        throw new Error('送信に失敗しました')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('ストリームの読み取りに失敗')

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
          if (line.startsWith('event: escalation')) {
            continue
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.trigger) {
                // エスカレーション通知
                setEscalationWarning(data.message)
              } else if (data.token !== undefined) {
                fullContent += data.token
                setStreamingContent(fullContent)
              } else if (data.usage) {
                // 完了
                const assistantMsg: ChatMessage = {
                  id: `assistant-${Date.now()}`,
                  session_id: sessionId || '',
                  role: 'assistant',
                  content: fullContent,
                  input_tokens: data.usage.inputTokens,
                  output_tokens: data.usage.outputTokens,
                  metadata: null,
                  created_at: new Date().toISOString(),
                }
                setMessages((prev) => [...prev, assistantMsg])
              }
            } catch {
              // パースエラーは無視
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
    }
  }, [input, isStreaming, sessionId])

  // Enter送信
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // クリア
  const clearChat = () => {
    setMessages([])
    setSessionId(null)
    setError(null)
    setEscalationWarning(null)
  }

  return (
    <>
      {/* FABボタン */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 left-6 z-50 p-4 bg-secondary text-white rounded-full shadow-lg hover:bg-secondary/90 transition-colors"
            title="QAアシスタント"
          >
            <QuestionMarkCircleIcon className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* チャットウィンドウ */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-6 z-50 w-96 h-[500px] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden border border-gray-200"
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 bg-secondary text-white">
              <div className="flex items-center gap-2">
                <QuestionMarkCircleIcon className="w-5 h-5" />
                <span className="font-medium">QAアシスタント</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearChat}
                  className="p-1.5 hover:bg-white/20 rounded transition-colors"
                  title="会話をクリア"
                >
                  <ArrowPathIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-white/20 rounded transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* エスカレーション警告 */}
            {escalationWarning && (
              <div className="px-4 py-2 bg-warning/10 border-b border-warning/20 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 text-warning" />
                <span className="text-sm text-warning">{escalationWarning}</span>
              </div>
            )}

            {/* メッセージエリア */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && !isStreaming && (
                <div className="text-center py-8">
                  <QuestionMarkCircleIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-text-light mb-4">
                    プラットフォームの使い方や
                    <br />
                    研修に関する質問にお答えします
                  </p>
                  <div className="space-y-2">
                    <SuggestionChip onClick={() => setInput('このプラットフォームの使い方を教えて')}>
                      使い方を教えて
                    </SuggestionChip>
                    <SuggestionChip onClick={() => setInput('カリキュラムの進め方は？')}>
                      カリキュラムの進め方
                    </SuggestionChip>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {isStreaming && streamingContent && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
                    <SparklesIcon className="w-4 h-4 text-secondary" />
                  </div>
                  <div className="bg-gray-100 rounded-lg px-3 py-2 max-w-[80%]">
                    <p className="text-sm text-text whitespace-pre-wrap">
                      {streamingContent}
                      <span className="inline-block w-1.5 h-4 ml-0.5 bg-secondary animate-pulse" />
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-center py-2">
                  <p className="text-sm text-error">{error}</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* 入力エリア */}
            <div className="border-t border-gray-200 p-3">
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="質問を入力..."
                  rows={1}
                  className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                  style={{ maxHeight: '100px' }}
                  disabled={isStreaming}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isStreaming}
                  className="p-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ============================================
// メッセージバブル
// ============================================
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-primary/20' : 'bg-secondary/20'
        }`}
      >
        {isUser ? (
          <span className="text-xs font-medium text-primary">U</span>
        ) : (
          <SparklesIcon className="w-4 h-4 text-secondary" />
        )}
      </div>
      <div
        className={`rounded-lg px-3 py-2 max-w-[80%] ${
          isUser ? 'bg-primary text-white' : 'bg-gray-100 text-text'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}

// ============================================
// サジェスションチップ
// ============================================
function SuggestionChip({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 text-xs bg-secondary/10 text-secondary rounded-full hover:bg-secondary/20 transition-colors"
    >
      {children}
    </button>
  )
}
