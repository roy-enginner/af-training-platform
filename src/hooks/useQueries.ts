import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Profile, Group, ProfileWithGroup } from '@/types/database'

// Query Keys
export const queryKeys = {
  // Stats
  dashboardStats: ['dashboard', 'stats'] as const,

  // Users
  users: ['users'] as const,
  user: (id: string) => ['users', id] as const,

  // Groups
  groups: ['groups'] as const,
  group: (id: string) => ['groups', id] as const,
}

// ==================== Dashboard Stats ====================

interface DashboardStats {
  totalUsers: number
  totalGroups: number
  activeTrainees: number
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboardStats,
    queryFn: async (): Promise<DashboardStats> => {
      const [usersResult, groupsResult, traineesResult] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('groups').select('*', { count: 'exact', head: true }),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'trainee'),
      ])

      return {
        totalUsers: usersResult.count || 0,
        totalGroups: groupsResult.count || 0,
        activeTrainees: traineesResult.count || 0,
      }
    },
  })
}

// ==================== Users ====================

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: async (): Promise<ProfileWithGroup[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          group:groups(*)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as ProfileWithGroup[]
    },
  })
}

export function useUser(id: string) {
  return useQuery({
    queryKey: queryKeys.user(id),
    queryFn: async (): Promise<ProfileWithGroup | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          group:groups(*)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      return data as ProfileWithGroup
    },
    enabled: !!id,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (user: {
      email: string
      password: string
      name: string
      role: 'admin' | 'trainee'
      group_id?: string
    }) => {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      })

      if (authError) throw authError

      // Create profile
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          name: user.name,
          role: user.role,
          group_id: user.group_id || null,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Profile> & { id: string }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users })
      queryClient.invalidateQueries({ queryKey: queryKeys.user(data.id) })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('profiles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats })
    },
  })
}

// ==================== Groups ====================

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: async (): Promise<Group[]> => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
  })
}

export function useGroup(id: string) {
  return useQuery({
    queryKey: queryKeys.group(id),
    queryFn: async (): Promise<Group | null> => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCreateGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (group: { name: string; daily_token_limit?: number }) => {
      const { data, error } = await supabase
        .from('groups')
        .insert(group)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats })
    },
  })
}

export function useUpdateGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Group> & { id: string }) => {
      const { data, error } = await supabase
        .from('groups')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups })
      queryClient.invalidateQueries({ queryKey: queryKeys.group(data.id) })
    },
  })
}

export function useDeleteGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('groups').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats })
    },
  })
}
