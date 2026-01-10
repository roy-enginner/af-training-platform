import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'
import { ErrorResponses } from './shared/errors'

const FUNCTION_NAME = 'send-invitation'

interface InvitationRequest {
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
    return ErrorResponses.badRequest(headers, FUNCTION_NAME, `HTTPメソッド ${event.httpMethod} は許可されていません。POSTを使用してください。`)
  }

  // Verify authorization
  const authHeader = event.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return ErrorResponses.unauthorized(headers, FUNCTION_NAME, 'Authorizationヘッダーが必要です。')
  }

  // Validate caller is admin
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return ErrorResponses.configError(headers, FUNCTION_NAME, 'VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY')
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
    return ErrorResponses.invalidToken(headers, FUNCTION_NAME)
  }

  // Verify caller is admin
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.role !== 'super_admin' && callerProfile?.role !== 'group_admin') {
    return ErrorResponses.groupAdminRequired(headers, FUNCTION_NAME)
  }

  // Check Resend API key
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not set')
    return ErrorResponses.configError(headers, FUNCTION_NAME, 'RESEND_API_KEY')
  }

  const resend = new Resend(resendApiKey)

  try {
    const { email, name, password, loginUrl } = JSON.parse(event.body || '{}') as InvitationRequest

    // 必須フィールドの検証
    const missingFields: string[] = []
    if (!email) missingFields.push('email')
    if (!name) missingFields.push('name')
    if (!password) missingFields.push('password')
    if (!loginUrl) missingFields.push('loginUrl')

    if (missingFields.length > 0) {
      return ErrorResponses.validationError(
        headers,
        FUNCTION_NAME,
        `必須フィールドが不足しています: ${missingFields.join(', ')}`,
        { missingFields }
      )
    }

    const { data, error } = await resend.emails.send({
      from: 'AI研修プラットフォーム <noreply@assist-frontier.site>',
      to: email,
      subject: '【Assist Frontier】AI研修プログラムへようこそ',
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
            <div style="background: linear-gradient(135deg, #0088CC 0%, #00C4D4 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">AI研修プラットフォーム</h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0;">Assist Frontier</p>
            </div>

            <!-- Content -->
            <div style="padding: 30px;">
              <h2 style="color: #2C3E50; margin-top: 0;">${name}様</h2>

              <p style="color: #2C3E50; line-height: 1.8;">
                AI研修プログラムへのご登録ありがとうございます。<br>
                以下の情報でログインしてください。
              </p>

              <!-- Login info box -->
              <div style="background-color: #E6F4FA; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0 0 10px; color: #2C3E50;">
                  <strong>メールアドレス:</strong><br>
                  ${email}
                </p>
                <p style="margin: 0; color: #2C3E50;">
                  <strong>初期パスワード:</strong><br>
                  <code style="background-color: white; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${password}</code>
                </p>
              </div>

              <p style="color: #EF4444; font-size: 14px;">
                ※ セキュリティのため、初回ログイン後に必ずパスワードを変更してください。
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${loginUrl}" style="display: inline-block; background-color: #0088CC; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold;">
                  ログインする
                </a>
              </div>

              <p style="color: #64748B; font-size: 14px; line-height: 1.6;">
                ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください：<br>
                <a href="${loginUrl}" style="color: #0088CC;">${loginUrl}</a>
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
      return ErrorResponses.emailError(
        headers,
        FUNCTION_NAME,
        `招待メールの送信に失敗しました: ${error.message || '不明なエラー'}`
      )
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, messageId: data?.id }),
    }
  } catch (error) {
    console.error('Error in send-invitation:', error)
    return ErrorResponses.serverError(
      headers,
      FUNCTION_NAME,
      'リクエスト処理',
      `予期しないエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`
    )
  }
}

export { handler }
