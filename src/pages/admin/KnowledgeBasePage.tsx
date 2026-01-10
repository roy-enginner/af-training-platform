// ============================================
// ナレッジベース管理ページ
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'

interface KnowledgeItem {
  id: string
  category: string
  title: string
  content: string
  is_active: boolean
  created_at: string
}


export default function KnowledgeBasePage() {
  const { session } = useAuth()
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([])
  const [embeddingStatuses, setEmbeddingStatuses] = useState<Map<string, boolean>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // データ取得関数
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      // ナレッジベース取得
      const { data: items, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .order('category', { ascending: true })
        .order('title', { ascending: true })

      if (error) throw error
      setKnowledgeItems(items || [])

      // エンベディング状態を取得
      const { data: embeddings } = await supabase
        .from('content_embeddings')
        .select('source_id')
        .eq('source_type', 'knowledge_base')

      const statusMap = new Map<string, boolean>()
      items?.forEach(item => {
        statusMap.set(item.id, embeddings?.some(e => e.source_id === item.id) || false)
      })
      setEmbeddingStatuses(statusMap)
    } catch (err) {
      console.error('Failed to fetch knowledge base:', err)
      setMessage({ type: 'error', text: 'データの取得に失敗しました' })
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ナレッジベースとエンベディング状態を取得
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 埋め込み生成
  const handleGenerateEmbeddings = async () => {
    if (!session?.access_token) {
      setMessage({ type: 'error', text: 'ログインが必要です' })
      return
    }

    setIsGenerating(true)
    setMessage(null)

    try {
      const response = await fetch('/.netlify/functions/admin-generate-embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ target: 'knowledge_base' }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '埋め込み生成に失敗しました')
      }

      const { processed, errors } = result.results.knowledgeBase || { processed: 0, errors: 0 }
      setMessage({
        type: errors > 0 ? 'error' : 'success',
        text: `埋め込み生成完了: ${processed}件成功${errors > 0 ? `、${errors}件エラー` : ''}`,
      })

      // 状態を再取得
      await fetchData()
    } catch (err) {
      console.error('Generate embeddings error:', err)
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setIsGenerating(false)
    }
  }

  // カテゴリラベル
  const categoryLabels: Record<string, string> = {
    general: '一般',
    faq: 'FAQ',
    platform_usage: 'プラットフォーム使用方法',
    ai_basics: 'AI基礎知識',
    troubleshooting: 'トラブルシューティング',
  }

  // カテゴリごとにグループ化
  const groupedItems = knowledgeItems.reduce((acc, item) => {
    const category = item.category || 'general'
    if (!acc[category]) acc[category] = []
    acc[category].push(item)
    return acc
  }, {} as Record<string, KnowledgeItem[]>)

  // 埋め込み済みの件数
  const embeddedCount = Array.from(embeddingStatuses.values()).filter(Boolean).length
  const totalCount = knowledgeItems.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">ナレッジベース管理</h1>
        <Button
          onClick={handleGenerateEmbeddings}
          disabled={isGenerating || isLoading}
          variant="primary"
        >
          {isGenerating ? '生成中...' : '埋め込みを生成'}
        </Button>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'error' : 'success'}>
          {message.text}
        </Alert>
      )}

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{totalCount}</div>
              <div className="text-sm text-text-light">ナレッジ件数</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-success">{embeddedCount}</div>
              <div className="text-sm text-text-light">埋め込み済み</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-warning">{totalCount - embeddedCount}</div>
              <div className="text-sm text-text-light">未処理</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ナレッジ一覧 */}
      {isLoading ? (
        <div className="text-center py-8 text-text-light">読み込み中...</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([category, items]) => (
            <Card key={category}>
              <CardHeader title={categoryLabels[category] || category} />
              <CardContent>
                <div className="space-y-3">
                  {items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text">{item.title}</span>
                          {embeddingStatuses.get(item.id) ? (
                            <Badge variant="success">埋め込み済</Badge>
                          ) : (
                            <Badge variant="warning">未処理</Badge>
                          )}
                          {!item.is_active && (
                            <Badge variant="secondary">非アクティブ</Badge>
                          )}
                        </div>
                        <p className="text-sm text-text-light mt-1 line-clamp-2">
                          {item.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
