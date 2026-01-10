import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

interface PasswordResetRequest {
  email: string
  name: string
  password: string
  loginUrl: string
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return createPreflightResponse(origin)
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  // Verify authorization
  const authHeader = event.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Unauthorized' }),
    }
  }

  // Validate caller is admin
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' }),
    }
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const token = authHeader.split(' ')[1]
  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !caller) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Invalid token' }),
    }
  }

  // Verify caller is admin
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role, group_id')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.role !== 'super_admin' && callerProfile?.role !== 'group_admin') {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Admin access required' }),
    }
  }

  // Check Resend API key
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not set')
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Email service not configured' }),
    }
  }

  const resend = new Resend(resendApiKey)

  try {
    const { email, name, password, loginUrl } = JSON.parse(event.body || '{}') as PasswordResetRequest

    if (!email || !name || !password || !loginUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' }),
      }
    }

    // group_adminの場合、対象ユーザーが自グループ内かチェック
    if (callerProfile?.role === 'group_admin') {
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('group_id')
        .eq('email', email)
        .single()

      if (!targetProfile || targetProfile.group_id !== callerProfile.group_id) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Cannot reset password for users outside your group' }),
        }
      }
    }

    const { data, error } = await resend.emails.send({
      from: 'AI研修プラットフォーム <noreply@assist-frontier.site>',
      to: email,
      subject: '【Assist Frontier】パスワードがリセットされました',
      html: `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: 'M PLUS 1p', 'Hiragino Sans', sans-serif; background-color: #F8FAFC; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">パスワードリセット</h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0;">AI研修プラットフォーム</p>
            </div>

            <!-- Content -->
            <div style="padding: 30px;">
              <h2 style="color: #2C3E50; margin-top: 0;">${name}様</h2>

              <p style="color: #2C3E50; line-height: 1.8;">
                管理者によりパスワードがリセットされました。<br>
                以下の新しいパスワードでログインしてください。
              </p>

              <!-- Login info box -->
              <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0 0 10px; color: #2C3E50;">
                  <strong>メールアドレス:</strong><br>
                  ${email}
                </p>
                <p style="margin: 0; color: #2C3E50;">
                  <strong>新しいパスワード:</strong><br>
                  <code style="background-color: white; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 16px;">${password}</code>
                </p>
              </div>

              <p style="color: #EF4444; font-size: 14px; font-weight: bold;">
                ※ セキュリティのため、ログイン後に必ずパスワードを変更してください。
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${loginUrl}" style="display: inline-block; background-color: #F59E0B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold;">
                  ログインする
                </a>
              </div>

              <p style="color: #64748B; font-size: 14px; line-height: 1.6;">
                ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください：<br>
                <a href="${loginUrl}" style="color: #F59E0B;">${loginUrl}</a>
              </p>

              <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 20px 0;">

              <p style="color: #94A3B8; font-size: 12px; line-height: 1.6;">
                このメールに心当たりがない場合は、管理者にお問い合わせください。
              </p>
            </div>

            <!-- Footer -->
            <div style="background-color: #F8FAFC; padding: 20px; text-align: center; border-top: 1px solid #E2E8F0;">
              <p style="color: #64748B; margin: 0; font-size: 12px;">
                &copy; ${new Date().getFullYear()} Assist Frontier. All rights reserved.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    })

    if (error) {
      console.error('Resend error:', error)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to send email' }),
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, messageId: data?.id }),
    }
  } catch (error) {
    console.error('Error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

export { handler }
