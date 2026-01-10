// ============================================
// エスカレーション管理 API（管理者専用）
// GET/POST/PATCH/DELETE /api/admin-escalation
// ============================================

import type { Handler, HandlerEvent } from '@netlify/functions'
import { checkAuth, handlePreflight } from './shared/auth'
import { getCorsHeaders } from './shared/cors'
import { ErrorResponses } from './shared/errors'

export const handler: Handler = async (event: HandlerEvent) => {
  const preflightResponse = handlePreflight(event)
  if (preflightResponse) return preflightResponse

  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // 管理者のみ
  const authResult = await checkAuth(event, { requireSuperAdmin: true })
  if (!authResult.success) {
    return authResult.response
  }
  const { supabase } = authResult

  try {
    const params = event.queryStringParameters || {}
    const resource = params.resource || 'logs' // 'logs' | 'configs'

    switch (event.httpMethod) {
      case 'GET': {
        if (resource === 'configs') {
          // エスカレーション設定一覧
          const { data, error, count } = await supabase
            .from('escalation_configs')
            .select(`
              *,
              company:companies(id, name),
              group:groups(id, name)
            `, { count: 'exact' })
            .order('priority', { ascending: false })

          if (error) throw error
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ configs: data, total: count }),
          }
        } else {
          // エスカレーションログ一覧
          const limit = Math.min(parseInt(params.limit || '50', 10), 100)
          const offset = parseInt(params.offset || '0', 10)
          const isResolved = params.isResolved

          let query = supabase
            .from('escalation_logs')
            .select(`
              *,
              profile:profiles(id, name, email),
              session:chat_sessions(id, title, session_type),
              config:escalation_configs(id, name)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

          if (isResolved !== undefined) {
            query = query.eq('is_resolved', isResolved === 'true')
          }

          const { data, error, count } = await query

          if (error) throw error
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ logs: data, total: count, limit, offset }),
          }
        }
      }

      case 'POST': {
        // エスカレーション設定作成
        const body = JSON.parse(event.body || '{}')
        const { data, error } = await supabase
          .from('escalation_configs')
          .insert({
            company_id: body.companyId || null,
            group_id: body.groupId || null,
            name: body.name,
            description: body.description || null,
            channels: body.channels || ['email'],
            email_recipients: body.emailRecipients || [],
            email_cc: body.emailCc || [],
            teams_webhook_url: body.teamsWebhookUrl || null,
            teams_channel_name: body.teamsChannelName || null,
            slack_webhook_url: body.slackWebhookUrl || null,
            slack_channel: body.slackChannel || null,
            triggers: body.triggers || ['system_error', 'bug_report'],
            trigger_keywords: body.triggerKeywords || null,
            is_active: body.isActive ?? true,
            priority: body.priority || 0,
          })
          .select()
          .single()

        if (error) throw error
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify({ config: data }),
        }
      }

      case 'PATCH': {
        const body = JSON.parse(event.body || '{}')
        const { id, ...updates } = body

        if (!id) {
          return ErrorResponses.validationError(headers, 'IDが必要です')
        }

        // ログの解決ステータス更新
        if (resource === 'logs') {
          const { data, error } = await supabase
            .from('escalation_logs')
            .update({
              is_resolved: updates.isResolved,
              resolved_at: updates.isResolved ? new Date().toISOString() : null,
              resolved_by: updates.resolvedBy || null,
              resolution_notes: updates.resolutionNotes || null,
            })
            .eq('id', id)
            .select()
            .single()

          if (error) throw error
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ log: data }),
          }
        }

        // 設定の更新
        const updateData: Record<string, unknown> = {}
        if (updates.name !== undefined) updateData.name = updates.name
        if (updates.description !== undefined) updateData.description = updates.description
        if (updates.channels !== undefined) updateData.channels = updates.channels
        if (updates.emailRecipients !== undefined) updateData.email_recipients = updates.emailRecipients
        if (updates.emailCc !== undefined) updateData.email_cc = updates.emailCc
        if (updates.teamsWebhookUrl !== undefined) updateData.teams_webhook_url = updates.teamsWebhookUrl
        if (updates.triggers !== undefined) updateData.triggers = updates.triggers
        if (updates.isActive !== undefined) updateData.is_active = updates.isActive
        if (updates.priority !== undefined) updateData.priority = updates.priority
        updateData.updated_at = new Date().toISOString()

        const { data, error } = await supabase
          .from('escalation_configs')
          .update(updateData)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ config: data }),
        }
      }

      case 'DELETE': {
        const id = params.id
        if (!id) {
          return ErrorResponses.validationError(headers, 'IDが必要です')
        }

        const { error } = await supabase
          .from('escalation_configs')
          .delete()
          .eq('id', id)

        if (error) throw error
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true }),
        }
      }

      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } }),
        }
    }
  } catch (error) {
    console.error('Admin escalation error:', error)
    return ErrorResponses.serverError(headers, 'エスカレーション管理に失敗しました')
  }
}
