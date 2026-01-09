// ============================================
// エスカレーション通知 API
// POST /api/escalation-notify
// ============================================

import type { Handler, HandlerEvent } from '@netlify/functions'
import { Resend } from 'resend'
import { createSupabaseAdmin, handlePreflight, checkMethod } from './shared/auth'
import { getCorsHeaders } from './shared/cors'
import { ErrorResponses } from './shared/errors'
import {
  sendTeamsWebhook,
  createEscalationNotification,
} from './shared/teams-webhook'

// ============================================
// ハンドラー
// ============================================
export const handler: Handler = async (event: HandlerEvent) => {
  const preflightResponse = handlePreflight(event)
  if (preflightResponse) return preflightResponse

  const methodError = checkMethod(event, 'POST')
  if (methodError) return methodError

  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  try {
    const body = JSON.parse(event.body || '{}')
    const {
      sessionId,
      profileId,
      trigger,
      keywords,
      message,
      userName,
      userEmail,
      companyId,
      groupId,
    } = body

    const supabase = createSupabaseAdmin()
    if (!supabase) {
      return ErrorResponses.serverError(headers, 'サーバー設定エラー')
    }

    // エスカレーション設定を取得
    let configQuery = supabase
      .from('escalation_configs')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })

    // 企業・グループ固有の設定を優先
    if (companyId) {
      configQuery = configQuery.or(`company_id.eq.${companyId},company_id.is.null`)
    }
    if (groupId) {
      configQuery = configQuery.or(`group_id.eq.${groupId},group_id.is.null`)
    }

    const { data: configs } = await configQuery.limit(1)
    const config = configs?.[0]

    // 設定がない場合はデフォルト動作
    const channels = config?.channels || ['email']
    const emailRecipients = config?.email_recipients || [process.env.ADMIN_EMAIL || 'admin@assist-frontier.site']
    const teamsWebhookUrl = config?.teams_webhook_url || process.env.TEAMS_DEFAULT_WEBHOOK_URL

    const notificationResults: Record<string, { success: boolean; error?: string; message_id?: string }> = {}

    // メール通知
    if (channels.includes('email') && emailRecipients.length > 0) {
      try {
        const resendApiKey = process.env.RESEND_API_KEY
        if (resendApiKey) {
          const resend = new Resend(resendApiKey)

          const triggerLabels: Record<string, string> = {
            system_error: 'システムエラー',
            bug_report: 'バグ報告',
            urgent: '緊急',
            manual: '手動エスカレーション',
            sentiment: 'ネガティブ感情検出',
          }

          const { data, error } = await resend.emails.send({
            from: 'AI研修プラットフォーム <noreply@assist-frontier.site>',
            to: emailRecipients,
            cc: config?.email_cc || [],
            subject: `[エスカレーション] ${triggerLabels[trigger] || trigger} - ${userName}`,
            html: `
              <h2>エスカレーション通知</h2>
              <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>ユーザー</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${userName} (${userEmail})</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>トリガー</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${triggerLabels[trigger] || trigger}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>検出キーワード</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${keywords?.join(', ') || '-'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>メッセージ</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${message}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>セッションID</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${sessionId}</td>
                </tr>
              </table>
              <p style="margin-top: 20px;">
                <a href="${process.env.URL}/admin/escalation" style="background: #0088CC; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
                  管理画面で確認
                </a>
              </p>
            `,
          })

          notificationResults.email = error
            ? { success: false, error: error.message }
            : { success: true, message_id: data?.id }
        }
      } catch (err) {
        notificationResults.email = { success: false, error: String(err) }
      }
    }

    // Teams通知
    if (channels.includes('teams') && teamsWebhookUrl) {
      try {
        const teamsMessage = createEscalationNotification({
          trigger,
          userName,
          userEmail,
          sessionType: 'qa',
          message,
          matchedKeywords: keywords,
          dashboardUrl: `${process.env.URL}/admin/escalation`,
        })

        const result = await sendTeamsWebhook(teamsWebhookUrl, teamsMessage)
        notificationResults.teams = result
      } catch (err) {
        notificationResults.teams = { success: false, error: String(err) }
      }
    }

    // エスカレーションログを更新
    if (sessionId) {
      await supabase
        .from('escalation_logs')
        .update({
          config_id: config?.id || null,
          channels_notified: channels,
          notification_results: notificationResults,
        })
        .eq('session_id', sessionId)
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(1)
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        notificationResults,
      }),
    }
  } catch (error) {
    console.error('Escalation notify error:', error)
    return ErrorResponses.serverError(headers, 'エスカレーション通知に失敗しました')
  }
}
