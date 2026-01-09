// ============================================
// チャット入力コンポーネント
// ============================================

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { PaperAirplaneIcon, StopIcon } from '@heroicons/react/24/solid'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  isStreaming?: boolean
  placeholder?: string
  maxLength?: number
}

export function ChatInput({
  onSend,
  disabled = false,
  isStreaming = false,
  placeholder = 'メッセージを入力...',
  maxLength = 10000,
}: ChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // テキストエリアの高さを自動調整
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [message])

  // メッセージ送信
  const handleSend = () => {
    const trimmed = message.trim()
    if (!trimmed || disabled || isStreaming) return

    onSend(trimmed)
    setMessage('')

    // 高さをリセット
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  // Enterキーで送信（Shift+Enterは改行）
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const remainingChars = maxLength - message.length
  const isOverLimit = remainingChars < 0

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <div className="flex gap-2 items-end">
        {/* テキストエリア */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={`
              w-full resize-none rounded-lg border px-4 py-3 text-sm
              focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
              disabled:bg-gray-100 disabled:cursor-not-allowed
              ${isOverLimit ? 'border-error focus:ring-error/50' : 'border-gray-300'}
            `}
            style={{ maxHeight: '200px' }}
          />

          {/* 文字数カウンター */}
          {message.length > maxLength * 0.8 && (
            <div
              className={`absolute right-2 bottom-2 text-xs ${
                isOverLimit ? 'text-error' : 'text-text-light'
              }`}
            >
              {remainingChars.toLocaleString()}
            </div>
          )}
        </div>

        {/* 送信ボタン */}
        <button
          onClick={handleSend}
          disabled={disabled || isOverLimit || !message.trim()}
          className={`
            flex-shrink-0 p-3 rounded-lg transition-colors
            ${
              disabled || isOverLimit || !message.trim()
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary-dark'
            }
          `}
          title={isStreaming ? '生成を停止' : 'メッセージを送信 (Enter)'}
        >
          {isStreaming ? (
            <StopIcon className="w-5 h-5" />
          ) : (
            <PaperAirplaneIcon className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* ヒント */}
      <div className="mt-2 text-xs text-text-light">
        <span>Shift + Enter で改行</span>
        {isStreaming && <span className="ml-4 text-primary">AI が応答中...</span>}
      </div>
    </div>
  )
}
