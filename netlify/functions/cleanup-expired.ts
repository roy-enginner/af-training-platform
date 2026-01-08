import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { DAYS_AFTER_EXPIRY } from './shared/constants'

const handler: Handler = async (_event: HandlerEvent, _context: HandlerContext) => {
  console.log('Starting cleanup of expired groups and users...')

  // Create Supabase admin client
  const supabaseUrl = process.env.VITE_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables')
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' }),
    }
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const results = {
    deletedUsers: 0,
    deletedGroups: 0,
    errors: [] as string[],
  }

  try {
    // Calculate cutoff date (30 days ago)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_AFTER_EXPIRY)
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]

    console.log(`Cutoff date: ${cutoffDateStr}`)

    // 1. Find groups that expired more than 30 days ago
    const { data: expiredGroups, error: groupsError } = await supabaseAdmin
      .from('groups')
      .select('id, name, end_date')
      .not('end_date', 'is', null)
      .lt('end_date', cutoffDateStr)

    if (groupsError) {
      console.error('Error fetching expired groups:', groupsError)
      results.errors.push(`Failed to fetch expired groups: ${groupsError.message}`)
    }

    if (expiredGroups && expiredGroups.length > 0) {
      console.log(`Found ${expiredGroups.length} expired groups to clean up`)

      for (const group of expiredGroups) {
        console.log(`Processing group: ${group.name} (expired: ${group.end_date})`)

        // Get users in this group (only trainees, not admins)
        const { data: users, error: usersError } = await supabaseAdmin
          .from('profiles')
          .select('id, email, role')
          .eq('group_id', group.id)
          .eq('role', 'trainee')

        if (usersError) {
          console.error(`Error fetching users for group ${group.name}:`, usersError)
          results.errors.push(`Failed to fetch users for group ${group.name}`)
          continue
        }

        // Delete trainee users from this group in parallel
        if (users && users.length > 0) {
          const deletePromises = users.map(user =>
            supabaseAdmin.auth.admin.deleteUser(user.id)
              .then(({ error }) => ({ user, error, success: !error }))
              .catch(err => ({ user, error: err, success: false }))
          )

          const deleteResults = await Promise.allSettled(deletePromises)

          for (const result of deleteResults) {
            if (result.status === 'fulfilled') {
              const { user, error, success } = result.value
              if (success) {
                console.log(`Deleted user: ${user.email}`)
                results.deletedUsers++
              } else {
                console.error(`Failed to delete user ${user.email}:`, error)
                results.errors.push(`Failed to delete user ${user.email}`)
              }
            } else {
              results.errors.push(`Unexpected error during user deletion`)
            }
          }
        }

        // Delete training dates for this group
        const { error: trainingDatesError } = await supabaseAdmin
          .from('group_training_dates')
          .delete()
          .eq('group_id', group.id)

        if (trainingDatesError) {
          console.error(`Failed to delete training dates for group ${group.name}:`, trainingDatesError)
        }

        // Delete the group itself
        const { error: deleteGroupError } = await supabaseAdmin
          .from('groups')
          .delete()
          .eq('id', group.id)

        if (deleteGroupError) {
          console.error(`Failed to delete group ${group.name}:`, deleteGroupError)
          results.errors.push(`Failed to delete group ${group.name}`)
        } else {
          console.log(`Deleted group: ${group.name}`)
          results.deletedGroups++
        }
      }
    } else {
      console.log('No expired groups found')
    }

    // 2. Find individual users with expired access (access_expires_at)
    const { data: expiredUsers, error: expiredUsersError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, access_expires_at')
      .not('access_expires_at', 'is', null)
      .lt('access_expires_at', cutoffDateStr)
      .eq('role', 'trainee')

    if (expiredUsersError) {
      console.error('Error fetching expired users:', expiredUsersError)
      results.errors.push(`Failed to fetch expired users: ${expiredUsersError.message}`)
    }

    if (expiredUsers && expiredUsers.length > 0) {
      console.log(`Found ${expiredUsers.length} individually expired users to clean up`)

      const deletePromises = expiredUsers.map(user =>
        supabaseAdmin.auth.admin.deleteUser(user.id)
          .then(({ error }) => ({ user, error, success: !error }))
          .catch(err => ({ user, error: err, success: false }))
      )

      const deleteResults = await Promise.allSettled(deletePromises)

      for (const result of deleteResults) {
        if (result.status === 'fulfilled') {
          const { user, error, success } = result.value
          if (success) {
            console.log(`Deleted expired user: ${user.email}`)
            results.deletedUsers++
          } else {
            console.error(`Failed to delete expired user ${user.email}:`, error)
            results.errors.push(`Failed to delete user ${user.email}`)
          }
        } else {
          results.errors.push(`Unexpected error during user deletion`)
        }
      }
    } else {
      console.log('No individually expired users found')
    }

    console.log('Cleanup completed:', results)

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Cleanup completed. Deleted ${results.deletedUsers} users and ${results.deletedGroups} groups.`,
        details: results,
      }),
    }
  } catch (error) {
    console.error('Cleanup error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Cleanup failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}

export { handler }
