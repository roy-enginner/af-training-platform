import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

interface ResetPasswordRequest {
  userId: string
  newPassword: string
  userEmail: string
  userName: string
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return createPreflightResponse(origin)
  }

  // Create Supabase admin client
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables')
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
    .select('role')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.role !== 'super_admin' && callerProfile?.role !== 'group_admin') {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Admin access required' }),
    }
  }

  try {
    const body: ResetPasswordRequest = JSON.parse(event.body || '{}')

    if (!body.userId || !body.newPassword || !body.userEmail || !body.userName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' }),
      }
    }

    // Prevent admin from resetting their own password via this endpoint
    if (body.userId === caller.id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '自分自身のパスワードはこの方法ではリセットできません' }),
      }
    }

    // Check target user's role to prevent privilege escalation
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', body.userId)
      .single()

    // group_admin cannot reset password of super_admin or other group_admin
    if (callerProfile?.role === 'group_admin') {
      if (targetProfile?.role === 'super_admin' || targetProfile?.role === 'group_admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'group_adminは上位権限のユーザーのパスワードをリセットできません' }),
        }
      }
    }

    // Update user password using admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      body.userId,
      { password: body.newPassword }
    )

    if (updateError) {
      console.error('Password update error:', updateError)
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: updateError.message }),
      }
    }

    // Set must_change_password to true
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', body.userId)

    if (profileError) {
      console.error('Profile update error:', profileError)
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: profileError.message }),
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    }
  } catch (error) {
    console.error('Reset password error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

export { handler }
