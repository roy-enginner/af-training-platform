// Extract Supabase Project ID from URL
// URL format: https://<project-id>.supabase.co
function getSupabaseProjectId(): string {
  const url = import.meta.env.VITE_SUPABASE_URL
  if (!url) {
    throw new Error('VITE_SUPABASE_URL is not defined')
  }
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/)
  if (!match) {
    throw new Error('Invalid VITE_SUPABASE_URL format')
  }
  return match[1]
}

const SUPABASE_PROJECT_ID = getSupabaseProjectId()

// Auth storage key
export const AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_ID}-auth-token`

// Timeouts (in milliseconds)
export const AUTH_SAFETY_TIMEOUT = 10000
export const PROFILE_FETCH_RETRY_DELAY = 500
export const PROFILE_FETCH_MAX_RETRIES = 3
