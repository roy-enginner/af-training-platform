// ============================================
// AIモデル選択コンポーネント
// ============================================

import { useState } from 'react'
import { CheckIcon } from '@heroicons/react/24/outline'
import type { AIProvider } from '@/types/database'

// ============================================
// モデル定義
// ============================================
interface ModelInfo {
  id: string
  provider: AIProvider
  name: string
  description: string
  recommended?: boolean
}

const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    name: 'Claude Sonnet 4.5',
    description: 'バランスの取れた高性能モデル',
    recommended: true,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    name: 'Claude Haiku',
    description: '高速レスポンス、軽量タスク向け',
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    description: 'OpenAIの最新マルチモーダルモデル',
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    description: '軽量で高速、コスト効率が良い',
  },
  {
    id: 'gemini-2.0-flash',
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    description: 'Google最新、高速レスポンス',
  },
]

// ============================================
// プロバイダーアイコン
// ============================================
function ProviderIcon({ provider }: { provider: AIProvider }) {
  const colors: Record<AIProvider, string> = {
    anthropic: 'bg-orange-100 text-orange-600',
    openai: 'bg-green-100 text-green-600',
    google: 'bg-blue-100 text-blue-600',
  }

  const labels: Record<AIProvider, string> = {
    anthropic: 'A',
    openai: 'O',
    google: 'G',
  }

  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${colors[provider]}`}
    >
      {labels[provider]}
    </span>
  )
}

// ============================================
// ModelSelector コンポーネント
// ============================================
interface ModelSelectorProps {
  onSelect: (provider: AIProvider, modelId: string) => void
  selectedModelId?: string
}

export function ModelSelector({ onSelect, selectedModelId }: ModelSelectorProps) {
  const [selected, setSelected] = useState<string>(
    selectedModelId || AVAILABLE_MODELS.find((m) => m.recommended)?.id || AVAILABLE_MODELS[0].id
  )

  const handleSelect = (model: ModelInfo) => {
    setSelected(model.id)
    onSelect(model.provider, model.id)
  }

  return (
    <div className="p-3">
      <div className="text-xs font-medium text-text-light mb-2">AIモデルを選択</div>
      <div className="space-y-1">
        {AVAILABLE_MODELS.map((model) => (
          <button
            key={model.id}
            onClick={() => handleSelect(model)}
            className={`
              w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors
              ${
                selected === model.id
                  ? 'bg-primary-light/50 border border-primary/30'
                  : 'hover:bg-gray-100 border border-transparent'
              }
            `}
          >
            <ProviderIcon provider={model.provider} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text">{model.name}</span>
                {model.recommended && (
                  <span className="px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded">
                    推奨
                  </span>
                )}
              </div>
              <div className="text-xs text-text-light truncate">{model.description}</div>
            </div>
            {selected === model.id && (
              <CheckIcon className="w-5 h-5 text-primary flex-shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
