// ============================================
// チャットパネルコンポーネント
// 学習ページの右サイドパネルとして表示
// ============================================

import { useRef, useEffect, useState } from 'react'
import {
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  ChevronDownIcon,
  TrashIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { ChatMessage, StreamingMessage, LoadingMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ModelSelector } from './ModelSelector'
import { useChat } from '@/hooks/useChat'
import type { AIProvider, ChatSessionType } from '@/types/database'

// ============================================
// Props
// ============================================
interface ChatPanelProps {
  curriculumId?: string
  chapterId?: string
  curriculumName?: string
  chapterTitle?: string
  sessionType?: ChatSessionType
  isOpen?: boolean
  onToggle?: () => void
  className?: string
}

// ============================================
// ChatPanel コンポーネント
// ============================================
export function ChatPanel({
  curriculumId,
  chapterId,
  curriculumName,
  chapterTitle,
  sessionType = 'learning',
  isOpen = true,
  onToggle,
  className = '',
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showModelSelector, setShowModelSelector] = useState(false)

  const {
    // session は将来的にセッション情報表示で使用予定
    messages,
    isLoading,
    isStreaming,
    error,
    streamingContent,
    sendMessage,
    clearSession,
    setProvider,
    setModelId,
  } = useChat({
    sessionType,
    curriculumId,
    chapterId,
    autoLoadSession: true,
  })

  // メッセージが追加されたらスクロール
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingContent])

  // モデル変更ハンドラー
  const handleModelChange = (provider: AIProvider, modelId: string) => {
    setProvider(provider)
    setModelId(modelId)
    setShowModelSelector(false)
  }

  // 折りたたみ状態
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 right-6 p-4 bg-primary text-white rounded-full shadow-lg hover:bg-primary-dark transition-colors z-50"
        title="AIチャットを開く"
      >
        <ChatBubbleLeftRightIcon className="w-6 h-6" />
      </button>
    )
  }

  return (
    <div
      className={`flex flex-col bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden ${className}`}
      style={{ width: '400px', height: '600px' }}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <ChatBubbleLeftRightIcon className="w-5 h-5 text-primary" />
          <span className="font-medium text-text">AI アシスタント</span>
        </div>
        <div className="flex items-center gap-1">
          {/* モデル選択ボタン */}
          <button
            onClick={() => setShowModelSelector(!showModelSelector)}
            className="p-1.5 text-text-light hover:text-text hover:bg-gray-200 rounded transition-colors"
            title="AIモデルを選択"
          >
            <ChevronDownIcon className="w-4 h-4" />
          </button>
          {/* セッションクリア */}
          <button
            onClick={clearSession}
            className="p-1.5 text-text-light hover:text-text hover:bg-gray-200 rounded transition-colors"
            title="会話をクリア"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
          {/* 閉じるボタン */}
          {onToggle && (
            <button
              onClick={onToggle}
              className="p-1.5 text-text-light hover:text-text hover:bg-gray-200 rounded transition-colors"
              title="閉じる"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* モデルセレクター（展開時） */}
      {showModelSelector && (
        <div className="border-b border-gray-200">
          <ModelSelector onSelect={handleModelChange} />
        </div>
      )}

      {/* コンテキスト表示 */}
      {(curriculumName || chapterTitle) && (
        <div className="px-4 py-2 bg-primary-light/30 border-b border-gray-200">
          <div className="text-xs text-text-light">学習中:</div>
          <div className="text-sm text-text font-medium truncate">
            {curriculumName}
            {chapterTitle && ` > ${chapterTitle}`}
          </div>
        </div>
      )}

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto">
        {/* 初期メッセージ */}
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <ChatBubbleLeftRightIcon className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-text mb-2">AIアシスタント</h3>
            <p className="text-sm text-text-light mb-4">
              {sessionType === 'learning'
                ? 'カリキュラムの内容について質問できます。分からないことがあれば、お気軽にどうぞ！'
                : 'ご質問やお困りのことがあれば、お気軽にどうぞ。'}
            </p>
            <div className="grid gap-2 w-full max-w-xs">
              <SuggestionButton
                onClick={() => sendMessage('このチャプターの要点を教えてください')}
                disabled={isStreaming}
              >
                要点を教えて
              </SuggestionButton>
              <SuggestionButton
                onClick={() => sendMessage('具体的な例を挙げて説明してください')}
                disabled={isStreaming}
              >
                具体例を教えて
              </SuggestionButton>
              <SuggestionButton
                onClick={() => sendMessage('初心者にも分かるように説明してください')}
                disabled={isStreaming}
              >
                分かりやすく説明
              </SuggestionButton>
            </div>
          </div>
        )}

        {/* メッセージ表示 */}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* ストリーミング中のメッセージ */}
        {isStreaming && streamingContent && (
          <StreamingMessage content={streamingContent} />
        )}

        {/* ローディング */}
        {isLoading && !isStreaming && <LoadingMessage />}

        {/* エラー表示 */}
        {error && (
          <div className="px-4 py-3 bg-error/10 border-t border-error/20">
            <div className="flex items-center gap-2 text-error text-sm">
              <XMarkIcon className="w-4 h-4" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 flex items-center gap-1 text-xs text-error hover:underline"
            >
              <ArrowPathIcon className="w-3 h-3" />
              ページを再読み込み
            </button>
          </div>
        )}

        {/* スクロール用の空要素 */}
        <div ref={messagesEndRef} />
      </div>

      {/* 入力エリア */}
      <ChatInput
        onSend={sendMessage}
        disabled={isLoading}
        isStreaming={isStreaming}
        placeholder={
          sessionType === 'learning'
            ? 'カリキュラムについて質問...'
            : 'メッセージを入力...'
        }
      />
    </div>
  )
}

// ============================================
// サジェスションボタン
// ============================================
function SuggestionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 text-sm text-primary bg-primary-light/50 hover:bg-primary-light rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

// ============================================
// 再エクスポート
// ============================================
export { ChatMessage, StreamingMessage, LoadingMessage } from './ChatMessage'
export { ChatInput } from './ChatInput'
