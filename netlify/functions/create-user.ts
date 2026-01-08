import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, createPreflightResponse } from './shared/cors'

interface CreateUserRequest {
  email: string
  password: string
  name: string
  role: 'super_admin' | 'group_admin' | 'trainee'
  group_id?: string
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const origin = event.headers.origin
  const headers = getCorsHeaders(origin)

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return createPreflightResponse(origin)
  }

  // Create Supabase admin client inside handler to ensure env vars are available
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
    const body: CreateUserRequest = JSON.parse(event.body || '{}')

    if (!body.email || !body.password || !body.name || !body.role) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' }),
      }
    }

    // Create auth user
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    })

    if (createError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: createError.message }),
      }
    }

    // Update profile (created by database trigger)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        email: body.email,
        name: body.name,
        role: body.role,
        group_id: body.group_id || null,
        must_change_password: true, // Force password change on first login
      })
      .eq('id', authData.user.id)
      .select()
      .single()

    if (profileError) {
      console.error('Profile update error:', profileError)
      // Rollback: delete auth user if profile update fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: profileError.message }),
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ user: authData.user, profile }),
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

export { handler }
