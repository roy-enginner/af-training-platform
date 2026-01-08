export type UserRole = 'super_admin' | 'group_admin' | 'trainee'

// ============================================
// 企業
// ============================================
export interface Company {
  id: string
  name: string
  contract_start_date: string | null
  contract_end_date: string | null
  is_active: boolean
  daily_token_limit: number
  notes: string | null
  created_at: string
  updated_at: string
}

// ============================================
// 部署
// ============================================
export interface Department {
  id: string
  company_id: string
  parent_department_id: string | null
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DepartmentWithCompany extends Department {
  company: Company | null
}

// ============================================
// グループ
// ============================================
export interface Group {
  id: string
  name: string
  company_id: string | null
  department_id: string | null
  daily_token_limit: number
  start_date: string | null
  end_date: string | null
  review_period_days: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface GroupTrainingDate {
  id: string
  group_id: string
  training_date: string
  description: string | null
  created_at: string
}

export interface GroupWithRelations extends Group {
  company: Company | null
  department: Department | null
  training_dates: GroupTrainingDate[]
}

// ============================================
// プロファイル
// ============================================
export interface Profile {
  id: string
  email: string
  name: string
  role: UserRole
  company_id: string | null
  department_id: string | null
  group_id: string | null
  is_individual: boolean
  start_date: string | null
  end_date: string | null
  review_period_days: number
  notification_enabled: boolean
  notification_forced: boolean
  must_change_password: boolean
  access_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface ProfileWithRelations extends Profile {
  company: Company | null
  department: Department | null
  group: Group | null
}

// Legacy alias
export interface ProfileWithGroup extends Profile {
  group: Group | null
}

export interface GroupWithTrainingDates extends Group {
  training_dates: GroupTrainingDate[]
}

// ============================================
// 個人研修日
// ============================================
export interface IndividualTrainingDate {
  id: string
  profile_id: string
  training_date: string
  description: string | null
  created_at: string
}

// ============================================
// ユーザー属性
// ============================================
export interface UserAttribute {
  id: string
  profile_id: string
  attribute_key: string
  attribute_value: string
  created_at: string
}

export type AttributeType = 'text' | 'select' | 'number' | 'date'

export interface AttributeDefinition {
  id: string
  key: string
  label: string
  attribute_type: AttributeType
  options: string[] | null // JSON parsed
  sort_order: number
  is_active: boolean
  created_at: string
}

// ============================================
// カリキュラム
// ============================================
export type ContentType = 'document' | 'video' | 'quiz' | 'external'
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced'

export interface Curriculum {
  id: string
  name: string
  description: string | null
  content_type: ContentType
  content_url: string | null
  duration_minutes: number | null
  difficulty_level: DifficultyLevel
  tags: string[] | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================
// チャプター
// ============================================
export interface Chapter {
  id: string
  curriculum_id: string
  title: string
  content: string | null
  task_description: string | null
  sort_order: number
  estimated_minutes: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================
// カリキュラム割当
// ============================================
export type CurriculumTargetType = 'company' | 'department' | 'group' | 'individual'

export interface CurriculumAssignment {
  id: string
  curriculum_id: string
  target_type: CurriculumTargetType
  target_id: string
  due_date: string | null
  is_required: boolean
  assigned_by: string | null
  assigned_at: string
}

export interface CurriculumAssignmentWithDetails extends CurriculumAssignment {
  curriculum: Curriculum
}

// ============================================
// カリキュラム進捗
// ============================================
export type CurriculumStatus = 'not_started' | 'in_progress' | 'completed'

export interface CurriculumProgress {
  id: string
  profile_id: string
  curriculum_id: string
  status: CurriculumStatus
  progress_percent: number
  started_at: string | null
  completed_at: string | null
  score: number | null
  notes: string | null
  updated_at: string
}

export interface CurriculumProgressWithDetails extends CurriculumProgress {
  curriculum: Curriculum
}

// ============================================
// Database Schema Types (for Supabase)
// ============================================
export type Database = {
  public: {
    Tables: {
      companies: {
        Row: Company
        Insert: Omit<Company, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Company, 'id' | 'created_at'>>
      }
      departments: {
        Row: Department
        Insert: Omit<Department, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Department, 'id' | 'created_at'>>
      }
      profiles: {
        Row: Profile
        Insert: {
          id: string
          email: string
          name: string
          role: UserRole
          company_id?: string | null
          department_id?: string | null
          group_id?: string | null
          is_individual?: boolean
          start_date?: string | null
          end_date?: string | null
          review_period_days?: number
          notification_enabled?: boolean
          notification_forced?: boolean
          must_change_password?: boolean
          access_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
        Relationships: [
          {
            foreignKeyName: 'profiles_company_id_fkey'
            columns: ['company_id']
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'profiles_department_id_fkey'
            columns: ['department_id']
            referencedRelation: 'departments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'profiles_group_id_fkey'
            columns: ['group_id']
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      groups: {
        Row: Group
        Insert: {
          id?: string
          name: string
          company_id?: string | null
          department_id?: string | null
          daily_token_limit?: number
          start_date?: string | null
          end_date?: string | null
          review_period_days?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Group, 'id' | 'created_at'>>
        Relationships: [
          {
            foreignKeyName: 'groups_company_id_fkey'
            columns: ['company_id']
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'groups_department_id_fkey'
            columns: ['department_id']
            referencedRelation: 'departments'
            referencedColumns: ['id']
          }
        ]
      }
      group_training_dates: {
        Row: GroupTrainingDate
        Insert: {
          id?: string
          group_id: string
          training_date: string
          description?: string | null
          created_at?: string
        }
        Update: Partial<Omit<GroupTrainingDate, 'id' | 'created_at'>>
      }
      individual_training_dates: {
        Row: IndividualTrainingDate
        Insert: {
          id?: string
          profile_id: string
          training_date: string
          description?: string | null
          created_at?: string
        }
        Update: Partial<Omit<IndividualTrainingDate, 'id' | 'created_at'>>
      }
      user_attributes: {
        Row: UserAttribute
        Insert: {
          id?: string
          profile_id: string
          attribute_key: string
          attribute_value: string
          created_at?: string
        }
        Update: Partial<Omit<UserAttribute, 'id' | 'created_at'>>
      }
      attribute_definitions: {
        Row: AttributeDefinition
        Insert: Omit<AttributeDefinition, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<AttributeDefinition, 'id' | 'created_at'>>
      }
      curricula: {
        Row: Curriculum
        Insert: Omit<Curriculum, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Curriculum, 'id' | 'created_at'>>
      }
      chapters: {
        Row: Chapter
        Insert: Omit<Chapter, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Chapter, 'id' | 'created_at'>>
      }
      curriculum_assignments: {
        Row: CurriculumAssignment
        Insert: Omit<CurriculumAssignment, 'id' | 'assigned_at'> & {
          id?: string
          assigned_at?: string
        }
        Update: Partial<Omit<CurriculumAssignment, 'id' | 'assigned_at'>>
      }
      curriculum_progress: {
        Row: CurriculumProgress
        Insert: Omit<CurriculumProgress, 'id' | 'updated_at'> & {
          id?: string
          updated_at?: string
        }
        Update: Partial<Omit<CurriculumProgress, 'id'>>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      curriculum_target_type: CurriculumTargetType
      curriculum_status: CurriculumStatus
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ============================================
// CSV Import Types
// ============================================
export type CsvAction = 'add' | 'delete'

export interface CsvUserRow {
  action: CsvAction
  companyName: string
  departmentName: string
  groupName: string
  userName: string
  email: string
  role: UserRole
  isIndividual: boolean
}

export interface CsvDepartmentRow {
  action: CsvAction
  companyName: string
  departmentName: string
  parentDepartmentName: string
  sortOrder: number
}

export interface CsvGroupRow {
  action: CsvAction
  companyName: string
  departmentName: string
  groupName: string
  dailyTokenLimit: number
  startDate: string
  endDate: string
  reviewPeriodDays: number
}

// ============================================
// API Response Types
// ============================================
export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

// ============================================
// Role Permissions
// ============================================
export const ROLE_PERMISSIONS = {
  super_admin: {
    canManageCompanies: true,
    canManageDepartments: true,
    canManageGroups: true,
    canManageAllUsers: true,
    canManageGroupUsers: true,
    canAssignAdminRole: true,
    canManageCurriculum: true,
    canManageAttributes: true,
    canViewAllReports: true,
  },
  group_admin: {
    canManageCompanies: false,
    canManageDepartments: false,
    canManageGroups: false,
    canManageAllUsers: false,
    canManageGroupUsers: true,
    canAssignAdminRole: false,
    canManageCurriculum: false,
    canManageAttributes: false,
    canViewAllReports: false,
  },
  trainee: {
    canManageCompanies: false,
    canManageDepartments: false,
    canManageGroups: false,
    canManageAllUsers: false,
    canManageGroupUsers: false,
    canAssignAdminRole: false,
    canManageCurriculum: false,
    canManageAttributes: false,
    canViewAllReports: false,
  },
} as const

export function hasPermission(
  role: UserRole,
  permission: keyof typeof ROLE_PERMISSIONS.super_admin
): boolean {
  return ROLE_PERMISSIONS[role]?.[permission] ?? false
}

// ============================================
// Runtime Validation Helpers
// ============================================
const VALID_ROLES: UserRole[] = ['super_admin', 'group_admin', 'trainee']

export function isValidProfile(data: unknown): data is Profile {
  if (!data || typeof data !== 'object') return false

  const profile = data as Record<string, unknown>

  return (
    typeof profile.id === 'string' &&
    typeof profile.email === 'string' &&
    typeof profile.name === 'string' &&
    typeof profile.role === 'string' &&
    VALID_ROLES.includes(profile.role as UserRole) &&
    typeof profile.is_individual === 'boolean' &&
    typeof profile.review_period_days === 'number' &&
    typeof profile.notification_enabled === 'boolean' &&
    typeof profile.notification_forced === 'boolean' &&
    typeof profile.must_change_password === 'boolean' &&
    typeof profile.created_at === 'string' &&
    typeof profile.updated_at === 'string'
  )
}

export function validateProfile(data: unknown): Profile {
  if (!isValidProfile(data)) {
    throw new Error('Invalid profile data received from database')
  }
  return data
}
