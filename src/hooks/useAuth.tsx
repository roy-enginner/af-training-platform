import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import {
  AUTH_STORAGE_KEY,
  AUTH_SAFETY_TIMEOUT,
  PROFILE_FETCH_RETRY_DELAY,
  PROFILE_FETCH_MAX_RETRIES,
} from '@/lib/constants'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile, UserRole } from '@/types/database'
import { isValidProfile } from '@/types/database'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  isLoading: boolean
  isAuthenticated: boolean
  role: UserRole | null
  mustChangePassword: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null; role: UserRole | null; mustChangePassword: boolean }>
  signOut: () => Promise<void>
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  clearMustChangePassword: () => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const isProcessingRef = useRef(false)
  const isMountedRef = useRef(true)
  const isLoadingRef = useRef(true)
  const isSigningInRef = useRef(false)

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    for (let attempt = 0; attempt < PROFILE_FETCH_MAX_RETRIES; attempt++) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()

        if (!error && data) {
          if (isValidProfile(data)) {
            return data
          }
          console.error('Invalid profile data structure:', data)
          return null
        }
      } catch (err) {
        console.error('Profile fetch error:', err)
      }
      if (attempt < PROFILE_FETCH_MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, PROFILE_FETCH_RETRY_DELAY))
      }
    }
    return null
  }, [])

  const clearState = useCallback(() => {
    setSession(null)
    setUser(null)
    setProfile(null)
    setIsLoading(false)
    isLoadingRef.current = false
  }, [])

  const processAuthState = useCallback(async (currentSession: Session | null): Promise<void> => {
    if (!currentSession?.user) {
      clearState()
      return
    }

    if (isProcessingRef.current) {
      return
    }

    isProcessingRef.current = true

    try {
      const currentUser = currentSession.user
      setSession(currentSession)
      setUser(currentUser)

      const profileData = await fetchProfile(currentUser.id)

      if (!isMountedRef.current) return

      if (!profileData) {
        clearState()
        return
      }

      setProfile(profileData)
      setIsLoading(false)
      isLoadingRef.current = false
    } catch (err) {
      console.error('Auth error:', err)
      clearState()
    } finally {
      isProcessingRef.current = false
    }
  }, [clearState, fetchProfile])

  useEffect(() => {
    isMountedRef.current = true
    let subscription: { unsubscribe: () => void } | null = null

    const initializeAuth = async () => {
      const { data } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (!isMountedRef.current) return

        if (event === 'SIGNED_OUT') {
          clearState()
          return
        }

        if (event === 'TOKEN_REFRESHED' && newSession) {
          setSession(newSession)
          setUser(newSession.user)
          return
        }

        setTimeout(() => {
          if (isMountedRef.current) {
            processAuthState(newSession)
          }
        }, 0)
      })

      subscription = data.subscription

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          clearState()
          return
        }

        await processAuthState(sessionData.session)
      } catch (err) {
        clearState()
      }
    }

    initializeAuth()

    const safetyTimeout = setTimeout(() => {
      if (isMountedRef.current && isLoadingRef.current) {
        setIsLoading(false)
        isLoadingRef.current = false
      }
    }, AUTH_SAFETY_TIMEOUT)

    return () => {
      isMountedRef.current = false
      subscription?.unsubscribe()
      clearTimeout(safetyTimeout)
    }
  }, [clearState, processAuthState])

  const signIn = async (email: string, password: string) => {
    // Prevent concurrent sign-in attempts
    if (isSigningInRef.current) {
      return { error: 'Sign in already in progress', role: null, mustChangePassword: false }
    }

    isSigningInRef.current = true

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        return { error: error.message, role: null, mustChangePassword: false }
      }

      if (!data.user) {
        return { error: 'Login failed', role: null, mustChangePassword: false }
      }

      const profileData = await fetchProfile(data.user.id)

      if (!profileData) {
        return { error: 'Profile not found', role: null, mustChangePassword: false }
      }

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setSession(data.session)
        setUser(data.user)
        setProfile(profileData)
        setIsLoading(false)
        isLoadingRef.current = false
      }

      return {
        error: null,
        role: profileData.role,
        mustChangePassword: profileData.must_change_password ?? false
      }
    } catch (err) {
      return { error: 'Login failed', role: null, mustChangePassword: false }
    } finally {
      isSigningInRef.current = false
    }
  }

  const signOut = async () => {
    clearState()
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Sign out error:', err)
    }
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) return { error: error.message }
      return { error: null }
    } catch (err) {
      return { error: 'Password update failed' }
    }
  }

  const resetPassword = async (email: string) => {
    try {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: appUrl + '/reset-password',
      })
      if (error) return { error: error.message }
      return { error: null }
    } catch (err) {
      return { error: 'Password reset failed' }
    }
  }

  const clearMustChangePassword = async () => {
    if (!user) return { error: 'Not logged in' }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', user.id)

      if (error) return { error: error.message }

      setProfile(prev => prev ? { ...prev, must_change_password: false } : null)
      return { error: null }
    } catch (err) {
      return { error: 'Failed to update flag' }
    }
  }

  const value: AuthContextType = {
    user,
    profile,
    session,
    isLoading,
    isAuthenticated: !!session && !!profile,
    role: profile?.role ?? null,
    mustChangePassword: profile?.must_change_password ?? false,
    signIn,
    signOut,
    updatePassword,
    resetPassword,
    clearMustChangePassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
