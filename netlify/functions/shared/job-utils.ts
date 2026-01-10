import { createClient, SupabaseClient } from '@supabase/supabase-js'

// 定数
export const MIN_GOAL_LENGTH = 10
export const DEFAULT_TARGET_AUDIENCE = '企業の一般社員'
export const DEFAULT_DURATION_MINUTES = 60
export const DEFAULT_DIFFICULTY_LEVEL = 'beginner'

// ジョブ進捗更新用の型
export interface JobProgressUpdates {
  status?: string
  progress?: number
  current_step?: string
  result?: unknown
  error_message?: string
  tokens_used?: number
  model_used?: string
  started_at?: string
  completed_at?: string
}

/**
 * Supabase管理クライアントを作成
 */
export function createSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * ジョブの進捗を更新
 */
export async function updateJobProgress(
  supabase: SupabaseClient,
  jobId: string,
  updates: JobProgressUpdates
): Promise<void> {
  const { error } = await supabase
    .from('curriculum_generation_jobs')
    .update(updates)
    .eq('id', jobId)

  if (error) {
    console.error('Failed to update job progress:', error)
  }
}

/**
 * ジョブを失敗状態に更新
 */
export async function markJobAsFailed(
  supabase: SupabaseClient,
  jobId: string,
  errorMessage: string
): Promise<void> {
  await updateJobProgress(supabase, jobId, {
    status: 'failed',
    progress: 0,
    current_step: 'エラーが発生しました',
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
  })
}

/**
 * 内部関数呼び出し用のシークレットを検証
 */
export function validateInternalSecret(providedSecret: string | undefined): boolean {
  const internalSecret = process.env.INTERNAL_FUNCTION_SECRET

  // シークレットが設定されていない場合は警告を出力（開発環境用）
  if (!internalSecret) {
    console.warn('INTERNAL_FUNCTION_SECRET is not set. Skipping authentication check.')
    return true
  }

  return providedSecret === internalSecret
}

/**
 * 難易度ラベルを取得
 */
export function getDifficultyLabel(level: string): string {
  const labels: Record<string, string> = {
    beginner: '初級（基礎から丁寧に説明）',
    intermediate: '中級（基本は理解している前提で応用的な内容）',
    advanced: '上級（専門的な内容を深掘り）',
  }
  return labels[level] || labels.beginner
}
