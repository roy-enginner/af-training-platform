import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { AccessDeniedPage } from '@/pages/auth/AccessDeniedPage'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { checkTraineeAccess, checkIndividualAccess } from '@/utils/accessControl'
import type { Group, GroupTrainingDate, IndividualTrainingDate } from '@/types/database'

export function TraineeLayout() {
  const { profile } = useAuth()
  const [isChecking, setIsChecking] = useState(true)
  const [accessAllowed, setAccessAllowed] = useState(true)
  const [accessMessage, setAccessMessage] = useState('')

  useEffect(() => {
    const checkAccess = async () => {
      if (!profile) {
        setIsChecking(false)
        return
      }

      // Admin roles always have access
      if (profile.role === 'super_admin' || profile.role === 'group_admin') {
        setAccessAllowed(true)
        setIsChecking(false)
        return
      }

      try {
        // Check if user is individual (not belonging to a group)
        if (profile.is_individual) {
          // Fetch individual training dates
          const { data: trainingDates } = await supabase
            .from('individual_training_dates')
            .select('*')
            .eq('profile_id', profile.id)

          const result = checkIndividualAccess(
            profile,
            (trainingDates || []) as IndividualTrainingDate[]
          )

          setAccessAllowed(result.allowed)
          setAccessMessage(result.message)
        } else {
          // Group-based user needs group_id
          if (!profile.group_id) {
            setAccessAllowed(false)
            setAccessMessage('グループに所属していないため、アクセスできません。管理者にお問い合わせください。')
            setIsChecking(false)
            return
          }

          // Fetch group info
          const { data: group } = await supabase
            .from('groups')
            .select('*')
            .eq('id', profile.group_id)
            .single()

          // Fetch training dates
          const { data: trainingDates } = await supabase
            .from('group_training_dates')
            .select('*')
            .eq('group_id', profile.group_id)

          const result = checkTraineeAccess(
            group as Group | null,
            (trainingDates || []) as GroupTrainingDate[]
          )

          setAccessAllowed(result.allowed)
          setAccessMessage(result.message)
        }
      } catch (err) {
        console.error('Error checking access:', err)
        // On error, allow access (fail open for better UX)
        setAccessAllowed(true)
      } finally {
        setIsChecking(false)
      }
    }

    checkAccess()
  }, [profile])

  // Show loading while checking access
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-light">アクセスを確認中...</p>
        </div>
      </div>
    )
  }

  // Show access denied page if not allowed
  if (!accessAllowed) {
    return <AccessDeniedPage message={accessMessage} />
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <Header />

      {/* Page content */}
      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  )
}
