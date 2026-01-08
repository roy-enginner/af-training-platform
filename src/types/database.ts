export type UserRole = 'admin' | 'trainee'

export interface Profile {
  id: string
  name: string
  role: UserRole
  group_id: string | null
  notification_enabled: boolean
  notification_forced: boolean
  access_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface Group {
  id: string
  name: string
  daily_token_limit: number
  created_at: string
  updated_at: string
}

export interface ProfileWithGroup extends Profile {
  group: Group | null
}

// Database types for Supabase
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: {
          id: string
          name: string
          role: UserRole
          group_id?: string | null
          notification_enabled?: boolean
          notification_forced?: boolean
          access_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          role?: UserRole
          group_id?: string | null
          notification_enabled?: boolean
          notification_forced?: boolean
          access_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          }
        ]
      }
      groups: {
        Row: Group
        Insert: {
          id?: string
          name: string
          daily_token_limit?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          daily_token_limit?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// CSV Import types
export interface CsvUserRow {
  groupName: string
  userName: string
  email: string
}

// API Response types
export interface ApiResponse<T> {
  data: T | null
  error: string | null
}
