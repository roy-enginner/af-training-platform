// ============================================
// 埋め込みベクトル生成・検索モジュール
// RAG (Retrieval-Augmented Generation) 用
// ============================================

import { SupabaseClient } from '@supabase/supabase-js'

// ============================================
// 型定義
// ============================================
export interface SimilarContent {
  id: string
  sourceType: string
  sourceId: string
  contentChunk: string
  chunkIndex: number
  similarity: number
  metadata: Record<string, unknown>
}

export interface EmbeddingResult {
  embedding: number[]
  tokensUsed: number
}

// ============================================
// OpenAI Embedding 生成
// ============================================
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  // テキストの前処理（改行を空白に置換、余分な空白を削除）
  const cleanedText = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()

  // OpenAI Embeddings API を直接呼び出し（SDK不要で軽量）
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: cleanedText,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI Embedding API error: ${error}`)
  }

  const data = await response.json()
  return {
    embedding: data.data[0].embedding,
    tokensUsed: data.usage.total_tokens,
  }
}

// ============================================
// 類似コンテンツ検索
// ============================================
export async function searchSimilarContent(
  supabase: SupabaseClient,
  queryText: string,
  options: {
    matchThreshold?: number
    matchCount?: number
    sourceType?: string
    companyId?: string
  } = {}
): Promise<SimilarContent[]> {
  const {
    matchThreshold = 0.7,
    matchCount = 5,
    sourceType,
    companyId,
  } = options

  // クエリテキストの埋め込みを生成
  const { embedding } = await generateEmbedding(queryText)

  // Supabaseの類似検索関数を呼び出し
  const { data, error } = await supabase.rpc('search_similar_content', {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    filter_source_type: sourceType || null,
    filter_company_id: companyId || null,
  })

  if (error) {
    console.error('Similar content search error:', error)
    return []
  }

  // キャメルケースに変換して返す
  return (data || []).map((row: {
    id: string
    source_type: string
    source_id: string
    content_chunk: string
    chunk_index: number
    similarity: number
    metadata: Record<string, unknown>
  }) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    contentChunk: row.content_chunk,
    chunkIndex: row.chunk_index,
    similarity: row.similarity,
    metadata: row.metadata,
  }))
}

// ============================================
// コンテンツの埋め込みを保存
// ============================================
export async function saveContentEmbedding(
  supabase: SupabaseClient,
  options: {
    sourceType: string
    sourceId: string
    content: string
    chunkIndex?: number
    metadata?: Record<string, unknown>
  }
): Promise<{ success: boolean; error?: string }> {
  const { sourceType, sourceId, content, chunkIndex = 0, metadata = {} } = options

  try {
    // 埋め込みを生成
    const { embedding } = await generateEmbedding(content)

    // 既存のエントリを削除（更新の場合）
    await supabase
      .from('content_embeddings')
      .delete()
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .eq('chunk_index', chunkIndex)

    // 新しいエントリを挿入
    const { error } = await supabase.from('content_embeddings').insert({
      source_type: sourceType,
      source_id: sourceId,
      content_chunk: content,
      chunk_index: chunkIndex,
      embedding,
      metadata,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ============================================
// テキストをチャンクに分割
// ============================================
export function splitIntoChunks(
  text: string,
  options: {
    maxChunkSize?: number
    overlap?: number
  } = {}
): string[] {
  const { maxChunkSize = 500, overlap = 50 } = options

  // 段落で分割
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let currentChunk = ''

  for (const paragraph of paragraphs) {
    // 段落が長すぎる場合は文で分割
    if (paragraph.length > maxChunkSize) {
      // 現在のチャンクを保存
      if (currentChunk) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }

      // 文で分割
      const sentences = paragraph.split(/(?<=[。！？.!?])\s*/)
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize) {
          if (currentChunk) {
            chunks.push(currentChunk.trim())
            // オーバーラップ部分を保持
            currentChunk = currentChunk.slice(-overlap) + sentence
          } else {
            // 1文が長すぎる場合はそのまま追加
            chunks.push(sentence.trim())
          }
        } else {
          currentChunk += sentence
        }
      }
    } else if (currentChunk.length + paragraph.length > maxChunkSize) {
      // チャンクサイズを超える場合は新しいチャンクを開始
      chunks.push(currentChunk.trim())
      currentChunk = currentChunk.slice(-overlap) + paragraph
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph
    }
  }

  // 残りのチャンクを追加
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

// ============================================
// ナレッジベースの全コンテンツの埋め込みを生成
// ============================================
export async function generateKnowledgeBaseEmbeddings(
  supabase: SupabaseClient
): Promise<{ processed: number; errors: number }> {
  // アクティブなナレッジベースコンテンツを取得
  const { data: knowledgeItems, error } = await supabase
    .from('knowledge_base')
    .select('id, title, content')
    .eq('is_active', true)

  if (error || !knowledgeItems) {
    console.error('Failed to fetch knowledge base:', error)
    return { processed: 0, errors: 1 }
  }

  let processed = 0
  let errors = 0

  for (const item of knowledgeItems) {
    // タイトルと内容を結合
    const fullContent = `${item.title}\n\n${item.content}`
    const chunks = splitIntoChunks(fullContent)

    for (let i = 0; i < chunks.length; i++) {
      const result = await saveContentEmbedding(supabase, {
        sourceType: 'knowledge_base',
        sourceId: item.id,
        content: chunks[i],
        chunkIndex: i,
        metadata: { title: item.title },
      })

      if (result.success) {
        processed++
      } else {
        console.error(`Failed to embed knowledge_base ${item.id} chunk ${i}:`, result.error)
        errors++
      }

      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return { processed, errors }
}

// ============================================
// チャプターの埋め込みを生成
// ============================================
export async function generateChapterEmbedding(
  supabase: SupabaseClient,
  chapterId: string
): Promise<{ success: boolean; error?: string }> {
  // チャプター情報を取得
  const { data: chapter, error } = await supabase
    .from('chapters')
    .select('id, title, content, task_description')
    .eq('id', chapterId)
    .single()

  if (error || !chapter) {
    return { success: false, error: 'Chapter not found' }
  }

  // コンテンツを結合
  const fullContent = [
    `チャプター: ${chapter.title}`,
    chapter.content || '',
    chapter.task_description ? `課題: ${chapter.task_description}` : '',
  ].filter(Boolean).join('\n\n')

  const chunks = splitIntoChunks(fullContent)

  for (let i = 0; i < chunks.length; i++) {
    const result = await saveContentEmbedding(supabase, {
      sourceType: 'chapter',
      sourceId: chapter.id,
      content: chunks[i],
      chunkIndex: i,
      metadata: { title: chapter.title },
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    // レート制限対策
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return { success: true }
}
