// ============================================
// チャットメッセージコンポーネント
// ============================================

import { UserIcon, SparklesIcon } from '@heroicons/react/24/outline'
import type { ChatMessage as ChatMessageType } from '@/types/database'

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
}

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <div className="px-4 py-2 text-center">
        <span className="text-xs text-text-light bg-gray-100 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 px-4 py-3 ${isUser ? 'bg-white' : 'bg-gray-50'}`}>
      {/* アバター */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-primary-light text-primary' : 'bg-secondary/20 text-secondary'
        }`}
      >
        {isUser ? (
          <UserIcon className="w-5 h-5" />
        ) : (
          <SparklesIcon className="w-5 h-5" />
        )}
      </div>

      {/* メッセージ本文 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-text">
            {isUser ? 'あなた' : 'AI アシスタント'}
          </span>
          <span className="text-xs text-text-light">
            {formatTime(message.created_at)}
          </span>
        </div>

        <div className="text-sm text-text leading-relaxed whitespace-pre-wrap">
          {message.content}
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
          )}
        </div>

        {/* トークン情報（アシスタントメッセージのみ） */}
        {!isUser && message.output_tokens && (
          <div className="mt-2 text-xs text-text-light">
            {message.output_tokens.toLocaleString()} tokens
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// ストリーミング中のメッセージ
// ============================================
interface StreamingMessageProps {
  content: string
}

export function StreamingMessage({ content }: StreamingMessageProps) {
  return (
    <div className="flex gap-3 px-4 py-3 bg-gray-50">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-secondary/20 text-secondary">
        <SparklesIcon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-text">AI アシスタント</span>
          <span className="text-xs text-text-light">入力中...</span>
        </div>
        <div className="text-sm text-text leading-relaxed whitespace-pre-wrap">
          {content}
          <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
        </div>
      </div>
    </div>
  )
}

// ============================================
// ローディングインジケーター
// ============================================
export function LoadingMessage() {
  return (
    <div className="flex gap-3 px-4 py-3 bg-gray-50">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-secondary/20 text-secondary">
        <SparklesIcon className="w-5 h-5 animate-spin" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text">AI アシスタント</span>
          <span className="text-xs text-text-light">考え中...</span>
        </div>
        <div className="flex gap-1 mt-2">
          <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

// ============================================
// ヘルパー関数
// ============================================
function formatTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'たった今'
  if (diffMins < 60) return `${diffMins}分前`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}時間前`

  // 同じ日なら時刻のみ
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }

  // 日付表示
  return date.toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
