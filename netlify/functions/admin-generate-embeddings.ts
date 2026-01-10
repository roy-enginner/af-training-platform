// ============================================
// 埋め込みベクトル生成 API（管理者専用）
// POST /api/admin-generate-embeddings
// ============================================

import type { Handler, HandlerEvent } from '@netlify/functions'
import { checkAuth, handlePreflight, checkMethod } from './shared/auth'
import { getCorsHeaders } from './shared/cors'
import { ErrorResponses } from './shared/errors'
import { generateKnowledgeBaseEmbeddings, generateChapterEmbedding } from './shared/embeddings'

export const handler: Handler = async (event: HandlerEvent) => {
  const preflightResponse = handlePreflight(event)
  if (preflightResponse) return preflightResponse

  const methodError = checkMethod(event, 'POST')
  if (methodError) return methodError

  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // super_admin のみ実行可能
  const authResult = await checkAuth(event, {
    allowedRoles: ['super_admin'],
  })
  if (!authResult.success) {
    return authResult.response
  }
  const { supabase } = authResult

  try {
    const body = JSON.parse(event.body || '{}')
    const { target, chapterId } = body

    // target: 'knowledge_base' | 'chapter' | 'all'
    const results: {
      knowledgeBase?: { processed: number; errors: number }
      chapter?: { success: boolean; error?: string }
    } = {}

    if (target === 'knowledge_base' || target === 'all') {
      console.log('Generating knowledge base embeddings...')
      results.knowledgeBase = await generateKnowledgeBaseEmbeddings(supabase)
      console.log(`Knowledge base embeddings: ${results.knowledgeBase.processed} processed, ${results.knowledgeBase.errors} errors`)
    }

    if (target === 'chapter' && chapterId) {
      console.log(`Generating chapter embedding for ${chapterId}...`)
      results.chapter = await generateChapterEmbedding(supabase, chapterId)
      console.log(`Chapter embedding: ${results.chapter.success ? 'success' : results.chapter.error}`)
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        results,
      }),
    }
  } catch (error) {
    console.error('Generate embeddings error:', error)
    return ErrorResponses.serverError(headers, '埋め込み生成に失敗しました')
  }
}
