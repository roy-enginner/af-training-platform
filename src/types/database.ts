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
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'mixed'
export type SeriesType = 'sequential' | 'modular'

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
  // シリーズ関連
  series_id: string | null
  series_order: number | null
  part_title: string | null
  // 資料・テンプレート関連
  source_material_id: string | null
  template_id: string | null
  generation_params: GenerationOptions | null
  current_version: number
  created_at: string
  updated_at: string
}

// ============================================
// カリキュラムシリーズ
// ============================================
export interface CurriculumSeries {
  id: string
  name: string
  description: string | null
  series_type: SeriesType
  target_audience: string | null
  difficulty_level: DifficultyLevel | null
  total_duration_minutes: number | null
  tags: string[] | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CurriculumSeriesWithCurricula extends CurriculumSeries {
  curricula: Curriculum[]
}

// ============================================
// ソース資料
// ============================================
export type MaterialType = 'pdf' | 'url' | 'text' | 'markdown' | 'excel'
export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface SourceMaterial {
  id: string
  name: string
  material_type: MaterialType
  storage_path: string | null
  original_filename: string | null
  original_url: string | null
  file_size_bytes: number | null
  mime_type: string | null
  extracted_text: string | null
  extraction_status: ExtractionStatus
  extraction_error: string | null
  extracted_at: string | null
  metadata: MaterialMetadata | null
  tags: string[] | null
  uploaded_by: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MaterialMetadata {
  page_count?: number
  char_count?: number
  word_count?: number
  sheet_names?: string[]
  title?: string
  author?: string
}

// ============================================
// カリキュラム↔資料リンク
// ============================================
export interface CurriculumMaterialLink {
  id: string
  curriculum_id: string
  material_id: string
  reference_range: ReferenceRange | null
  usage_note: string | null
  created_at: string
}

export interface ReferenceRange {
  start_page?: number
  end_page?: number
  sections?: string[]
}

// ============================================
// シリーズ進捗
// ============================================
export interface SeriesProgress {
  id: string
  profile_id: string
  series_id: string
  status: CurriculumStatus
  completed_curricula_count: number
  total_curricula_count: number
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

// ============================================
// カリキュラムテンプレート
// ============================================
export type TemplateType = 'structure' | 'prompt' | 'style'

export interface CurriculumTemplate {
  id: string
  name: string
  description: string | null
  template_type: TemplateType
  content: TemplateContent
  is_system: boolean
  created_by: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TemplateContent {
  depthLevel?: DepthLevel
  exerciseRatio?: number
  exampleFrequency?: ExampleFrequency
  toneStyle?: ToneStyle
  promptAddition?: string
  chapterStructure?: ChapterTemplateStructure[]
}

export interface ChapterTemplateStructure {
  titlePattern: string
  estimatedMinutes: number
  includeExercise: boolean
}

// ============================================
// カリキュラムバージョン
// ============================================
export interface CurriculumVersion {
  id: string
  curriculum_id: string
  version_number: number
  content_snapshot: CurriculumSnapshot
  change_summary: string | null
  created_by: string | null
  created_at: string
}

export interface CurriculumSnapshot {
  curriculum: Omit<Curriculum, 'id' | 'created_at' | 'updated_at'>
  chapters: Omit<Chapter, 'id' | 'created_at' | 'updated_at'>[]
}

// ============================================
// カリキュラムフィードバック
// ============================================
export type FeedbackType = 'helpful' | 'unclear' | 'too_easy' | 'too_hard' | 'error' | 'suggestion'

export interface CurriculumFeedback {
  id: string
  curriculum_id: string
  chapter_id: string | null
  profile_id: string
  feedback_type: FeedbackType
  rating: number | null
  comment: string | null
  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  // AI改善サジェスト（Phase 4追加）
  ai_suggestion: string | null
  ai_suggestion_generated_at: string | null
  created_at: string
}

export interface CurriculumFeedbackWithProfile extends CurriculumFeedback {
  profile: Pick<Profile, 'id' | 'name' | 'email'>
}

// ============================================
// AIモデル (Phase 4)
// ============================================
export type AIProvider = 'openai' | 'anthropic' | 'google'

export interface AIModel {
  id: string
  provider: AIProvider
  model_id: string
  display_name: string
  input_token_cost: number | null
  output_token_cost: number | null
  max_context_tokens: number
  supports_streaming: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================
// チャットセッション (Phase 4)
// ============================================
export type ChatSessionType = 'learning' | 'qa' | 'general'
export type ChatSessionStatus = 'active' | 'completed' | 'escalated'

export interface ChatSession {
  id: string
  profile_id: string
  session_type: ChatSessionType
  status: ChatSessionStatus
  curriculum_id: string | null
  chapter_id: string | null
  ai_model_id: string | null
  system_prompt: string | null
  title: string | null
  metadata: ChatSessionMetadata | null
  escalated_at: string | null
  escalation_reason: string | null
  started_at: string
  last_message_at: string
  completed_at: string | null
  created_at: string
}

export interface ChatSessionMetadata {
  context?: string
  tags?: string[]
  [key: string]: unknown
}

export interface ChatSessionWithMessages extends ChatSession {
  messages: ChatMessage[]
  ai_model?: AIModel | null
}

// ============================================
// チャットメッセージ (Phase 4)
// ============================================
export type ChatMessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  session_id: string
  role: ChatMessageRole
  content: string
  input_tokens: number | null
  output_tokens: number | null
  metadata: ChatMessageMetadata | null
  created_at: string
}

export interface ChatMessageMetadata {
  model_used?: string
  response_time_ms?: number
  error?: string
  [key: string]: unknown
}

// ============================================
// トークン使用量 (Phase 4)
// ============================================
export interface TokenUsage {
  id: string
  profile_id: string
  group_id: string | null
  company_id: string | null
  ai_model_id: string | null
  input_tokens: number
  output_tokens: number
  estimated_cost: number | null
  usage_date: string
  session_id: string | null
  created_at: string
}

export interface TokenUsageAggregation {
  date: string
  total_input_tokens: number
  total_output_tokens: number
  total_cost: number
  session_count: number
}

// ============================================
// エスカレーション設定 (Phase 4)
// ============================================
export type EscalationChannel = 'email' | 'teams' | 'slack'
export type EscalationTrigger = 'system_error' | 'bug_report' | 'urgent' | 'manual' | 'sentiment'

export interface EscalationConfig {
  id: string
  company_id: string | null
  group_id: string | null
  name: string
  description: string | null
  channels: EscalationChannel[]
  email_recipients: string[] | null
  email_cc: string[] | null
  teams_webhook_url: string | null
  teams_channel_name: string | null
  slack_webhook_url: string | null
  slack_channel: string | null
  triggers: EscalationTrigger[]
  trigger_keywords: TriggerKeywords | null
  is_active: boolean
  priority: number
  created_at: string
  updated_at: string
}

export interface TriggerKeywords {
  // トリガーごとのキーワードリスト
  system_error?: string[]
  bug_report?: string[]
  urgent?: string[]
  // センチメント分析の閾値
  negative_sentiment_threshold?: number
}

// ============================================
// エスカレーション履歴 (Phase 4)
// ============================================
export interface EscalationLog {
  id: string
  config_id: string | null
  session_id: string | null
  message_id: string | null
  profile_id: string | null
  trigger: EscalationTrigger
  trigger_details: TriggerDetails | null
  channels_notified: EscalationChannel[] | null
  notification_results: NotificationResults | null
  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null
  created_at: string
}

export interface TriggerDetails {
  matched_keywords?: string[]
  sentiment_score?: number
  original_message?: string
  [key: string]: unknown
}

export interface NotificationResults {
  email?: {
    success: boolean
    message_id?: string
    error?: string
  }
  teams?: {
    success: boolean
    error?: string
  }
  slack?: {
    success: boolean
    error?: string
  }
}

export interface EscalationLogWithRelations extends EscalationLog {
  config: EscalationConfig | null
  profile: Pick<Profile, 'id' | 'name' | 'email'> | null
  session: Pick<ChatSession, 'id' | 'title' | 'session_type'> | null
}

// ============================================
// 生成オプション
// ============================================
export type DepthLevel = 'overview' | 'standard' | 'deep'
export type ExampleFrequency = 'minimal' | 'moderate' | 'abundant'
export type ToneStyle = 'formal' | 'casual' | 'technical'

export interface GenerationOptions {
  depthLevel: DepthLevel
  exerciseRatio: number
  exampleFrequency: ExampleFrequency
  toneStyle: ToneStyle
  templateId?: string
  customInstructions?: string
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
      // 新規テーブル
      curriculum_series: {
        Row: CurriculumSeries
        Insert: Omit<CurriculumSeries, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<CurriculumSeries, 'id' | 'created_at'>>
      }
      source_materials: {
        Row: SourceMaterial
        Insert: Omit<SourceMaterial, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<SourceMaterial, 'id' | 'created_at'>>
      }
      curriculum_material_links: {
        Row: CurriculumMaterialLink
        Insert: Omit<CurriculumMaterialLink, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<CurriculumMaterialLink, 'id' | 'created_at'>>
      }
      series_progress: {
        Row: SeriesProgress
        Insert: Omit<SeriesProgress, 'id' | 'updated_at'> & {
          id?: string
          updated_at?: string
        }
        Update: Partial<Omit<SeriesProgress, 'id'>>
      }
      curriculum_templates: {
        Row: CurriculumTemplate
        Insert: Omit<CurriculumTemplate, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<CurriculumTemplate, 'id' | 'created_at'>>
      }
      curriculum_versions: {
        Row: CurriculumVersion
        Insert: Omit<CurriculumVersion, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<CurriculumVersion, 'id' | 'created_at'>>
      }
      curriculum_feedback: {
        Row: CurriculumFeedback
        Insert: Omit<CurriculumFeedback, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<CurriculumFeedback, 'id' | 'created_at'>>
      }
      // Phase 4: AI チャット・エスカレーション
      ai_models: {
        Row: AIModel
        Insert: Omit<AIModel, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<AIModel, 'id' | 'created_at'>>
      }
      chat_sessions: {
        Row: ChatSession
        Insert: Omit<ChatSession, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<ChatSession, 'id' | 'created_at'>>
      }
      chat_messages: {
        Row: ChatMessage
        Insert: Omit<ChatMessage, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<ChatMessage, 'id' | 'created_at'>>
      }
      token_usage: {
        Row: TokenUsage
        Insert: Omit<TokenUsage, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<TokenUsage, 'id' | 'created_at'>>
      }
      escalation_configs: {
        Row: EscalationConfig
        Insert: Omit<EscalationConfig, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<EscalationConfig, 'id' | 'created_at'>>
      }
      escalation_logs: {
        Row: EscalationLog
        Insert: Omit<EscalationLog, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<EscalationLog, 'id' | 'created_at'>>
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
      series_type: SeriesType
      material_type: MaterialType
      extraction_status: ExtractionStatus
      template_type: TemplateType
      feedback_type: FeedbackType
      depth_level: DepthLevel
      example_frequency: ExampleFrequency
      tone_style: ToneStyle
      // Phase 4
      ai_provider: AIProvider
      chat_session_type: ChatSessionType
      chat_session_status: ChatSessionStatus
      chat_message_role: ChatMessageRole
      escalation_channel: EscalationChannel
      escalation_trigger: EscalationTrigger
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
