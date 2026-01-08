import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import type {
  Curriculum,
  CurriculumProgress,
  CurriculumAssignment,
  Chapter,
} from '@/types/database'

export interface AssignedCurriculum extends Curriculum {
  assignment: CurriculumAssignment
  progress: CurriculumProgress | null
  chapters: Chapter[]
  completedChapters: number
}

export interface TraineeCurriculaStats {
  totalAssigned: number
  completed: number
  inProgress: number
  notStarted: number
  overallProgress: number
}

export function useTraineeCurricula() {
  const { profile } = useAuth()
  const [curricula, setCurricula] = useState<AssignedCurriculum[]>([])
  const [stats, setStats] = useState<TraineeCurriculaStats>({
    totalAssigned: 0,
    completed: 0,
    inProgress: 0,
    notStarted: 0,
    overallProgress: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCurricula = useCallback(async () => {
    if (!profile) return

    try {
      setIsLoading(true)
      setError(null)

      // Build target IDs to check for assignments
      const targetIds: string[] = [profile.id] // Individual assignment
      if (profile.group_id) targetIds.push(profile.group_id)
      if (profile.department_id) targetIds.push(profile.department_id)
      if (profile.company_id) targetIds.push(profile.company_id)

      // Fetch all assignments that apply to this user
      const { data: assignments, error: assignmentError } = await supabase
        .from('curriculum_assignments')
        .select('*')
        .in('target_id', targetIds)

      if (assignmentError) throw assignmentError

      if (!assignments || assignments.length === 0) {
        setCurricula([])
        setStats({
          totalAssigned: 0,
          completed: 0,
          inProgress: 0,
          notStarted: 0,
          overallProgress: 0,
        })
        return
      }

      // Get unique curriculum IDs
      const curriculumIds = [...new Set(assignments.map((a) => a.curriculum_id))]

      // Fetch curricula details
      const { data: curriculaData, error: curriculaError } = await supabase
        .from('curricula')
        .select('*')
        .in('id', curriculumIds)
        .eq('is_active', true)
        .order('sort_order')

      if (curriculaError) throw curriculaError

      // Fetch progress for all curricula
      const { data: progressData, error: progressError } = await supabase
        .from('curriculum_progress')
        .select('*')
        .eq('profile_id', profile.id)
        .in('curriculum_id', curriculumIds)

      if (progressError) throw progressError

      // Fetch chapters for all curricula
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('chapters')
        .select('*')
        .in('curriculum_id', curriculumIds)
        .eq('is_active', true)
        .order('sort_order')

      if (chaptersError) throw chaptersError

      // Combine data
      const assignedCurricula: AssignedCurriculum[] = (curriculaData || []).map(
        (curriculum) => {
          // Find the most specific assignment (individual > group > department > company)
          const curriculumAssignments = assignments.filter(
            (a) => a.curriculum_id === curriculum.id
          )
          const assignment =
            curriculumAssignments.find((a) => a.target_id === profile.id) ||
            curriculumAssignments.find((a) => a.target_id === profile.group_id) ||
            curriculumAssignments.find((a) => a.target_id === profile.department_id) ||
            curriculumAssignments.find((a) => a.target_id === profile.company_id) ||
            curriculumAssignments[0]

          const progress =
            progressData?.find((p) => p.curriculum_id === curriculum.id) || null

          const chapters = (chaptersData || []).filter(
            (c) => c.curriculum_id === curriculum.id
          )

          // Calculate completed chapters (simplified - based on progress percent)
          const completedChapters = progress
            ? Math.floor((progress.progress_percent / 100) * chapters.length)
            : 0

          return {
            ...curriculum,
            assignment,
            progress,
            chapters,
            completedChapters,
          }
        }
      )

      setCurricula(assignedCurricula)

      // Calculate stats
      const completed = assignedCurricula.filter(
        (c) => c.progress?.status === 'completed'
      ).length
      const inProgress = assignedCurricula.filter(
        (c) => c.progress?.status === 'in_progress'
      ).length
      const notStarted = assignedCurricula.filter(
        (c) => !c.progress || c.progress.status === 'not_started'
      ).length

      const totalProgress = assignedCurricula.reduce(
        (sum, c) => sum + (c.progress?.progress_percent || 0),
        0
      )
      const overallProgress =
        assignedCurricula.length > 0
          ? Math.round(totalProgress / assignedCurricula.length)
          : 0

      setStats({
        totalAssigned: assignedCurricula.length,
        completed,
        inProgress,
        notStarted,
        overallProgress,
      })
    } catch (err) {
      console.error('Error fetching curricula:', err)
      setError('カリキュラムの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [profile])

  useEffect(() => {
    fetchCurricula()
  }, [fetchCurricula])

  return {
    curricula,
    stats,
    isLoading,
    error,
    refetch: fetchCurricula,
  }
}

// Hook for single curriculum with detailed progress
export function useTraineeCurriculum(curriculumId: string) {
  const { profile } = useAuth()
  const [curriculum, setCurriculum] = useState<AssignedCurriculum | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCurriculum = useCallback(async () => {
    if (!profile || !curriculumId) return

    try {
      setIsLoading(true)
      setError(null)

      // Fetch curriculum
      const { data: curriculumData, error: curriculumError } = await supabase
        .from('curricula')
        .select('*')
        .eq('id', curriculumId)
        .single()

      if (curriculumError) throw curriculumError

      // Fetch assignment
      const targetIds = [profile.id]
      if (profile.group_id) targetIds.push(profile.group_id)
      if (profile.department_id) targetIds.push(profile.department_id)
      if (profile.company_id) targetIds.push(profile.company_id)

      const { data: assignments, error: assignmentError } = await supabase
        .from('curriculum_assignments')
        .select('*')
        .eq('curriculum_id', curriculumId)
        .in('target_id', targetIds)

      if (assignmentError) throw assignmentError

      if (!assignments || assignments.length === 0) {
        throw new Error('このカリキュラムへのアクセス権限がありません')
      }

      const assignment =
        assignments.find((a) => a.target_id === profile.id) ||
        assignments.find((a) => a.target_id === profile.group_id) ||
        assignments.find((a) => a.target_id === profile.department_id) ||
        assignments.find((a) => a.target_id === profile.company_id) ||
        assignments[0]

      // Fetch progress
      const { data: progressData } = await supabase
        .from('curriculum_progress')
        .select('*')
        .eq('profile_id', profile.id)
        .eq('curriculum_id', curriculumId)
        .single()

      // Fetch chapters
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('chapters')
        .select('*')
        .eq('curriculum_id', curriculumId)
        .eq('is_active', true)
        .order('sort_order')

      if (chaptersError) throw chaptersError

      const chapters = chaptersData || []
      const progress = progressData || null
      const completedChapters = progress
        ? Math.floor((progress.progress_percent / 100) * chapters.length)
        : 0

      setCurriculum({
        ...curriculumData,
        assignment,
        progress,
        chapters,
        completedChapters,
      })
    } catch (err) {
      console.error('Error fetching curriculum:', err)
      setError(err instanceof Error ? err.message : 'カリキュラムの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [profile, curriculumId])

  // Update progress
  const updateProgress = useCallback(
    async (chapterIndex: number, totalChapters: number) => {
      if (!profile || !curriculumId) return

      const progressPercent = Math.round(((chapterIndex + 1) / totalChapters) * 100)
      const status =
        progressPercent >= 100
          ? 'completed'
          : progressPercent > 0
            ? 'in_progress'
            : 'not_started'

      try {
        const { data: existing } = await supabase
          .from('curriculum_progress')
          .select('id')
          .eq('profile_id', profile.id)
          .eq('curriculum_id', curriculumId)
          .single()

        if (existing) {
          await supabase
            .from('curriculum_progress')
            .update({
              progress_percent: progressPercent,
              status,
              completed_at: status === 'completed' ? new Date().toISOString() : null,
            })
            .eq('id', existing.id)
        } else {
          await supabase.from('curriculum_progress').insert({
            profile_id: profile.id,
            curriculum_id: curriculumId,
            progress_percent: progressPercent,
            status,
            started_at: new Date().toISOString(),
            completed_at: status === 'completed' ? new Date().toISOString() : null,
          })
        }

        // Refetch to update local state
        fetchCurriculum()
      } catch (err) {
        console.error('Error updating progress:', err)
      }
    },
    [profile, curriculumId, fetchCurriculum]
  )

  // Start curriculum (mark as in_progress)
  const startCurriculum = useCallback(async () => {
    if (!profile || !curriculumId) return

    try {
      const { data: existing } = await supabase
        .from('curriculum_progress')
        .select('id')
        .eq('profile_id', profile.id)
        .eq('curriculum_id', curriculumId)
        .single()

      if (!existing) {
        await supabase.from('curriculum_progress').insert({
          profile_id: profile.id,
          curriculum_id: curriculumId,
          progress_percent: 0,
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        fetchCurriculum()
      }
    } catch (err) {
      console.error('Error starting curriculum:', err)
    }
  }, [profile, curriculumId, fetchCurriculum])

  useEffect(() => {
    fetchCurriculum()
  }, [fetchCurriculum])

  return {
    curriculum,
    isLoading,
    error,
    refetch: fetchCurriculum,
    updateProgress,
    startCurriculum,
  }
}
