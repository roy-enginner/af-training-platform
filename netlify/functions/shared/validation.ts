import { INPUT_LIMITS, ALLOWED_MIME_TYPES, EXTENSION_TO_MIME, FILE_CONSTANTS } from './constants'

// ============================================
// 入力サニタイゼーション
// ============================================

// プロンプトインジェクション対策
export function sanitizeUserInput(input: string): string {
  if (!input || typeof input !== 'string') return ''

  let sanitized = input
    // システムプロンプト/ロール切り替えの試行をブロック
    .replace(/\[INST\]/gi, '')
    .replace(/\[\/INST\]/gi, '')
    .replace(/<<SYS>>/gi, '')
    .replace(/<<\/SYS>>/gi, '')
    .replace(/<\|im_start\|>/gi, '')
    .replace(/<\|im_end\|>/gi, '')
    .replace(/system:/gi, '')
    .replace(/assistant:/gi, '')
    .replace(/human:/gi, '')
    .replace(/user:/gi, '')
    // JSONペイロードインジェクションの防止
    .replace(/}\s*{/g, '} {')
    // 連続した改行を制限
    .replace(/\n{4,}/g, '\n\n\n')
    // 制御文字を除去（改行・タブは許可）
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  return sanitized.trim()
}

// ============================================
// 入力バリデーション
// ============================================
export type InputField = keyof typeof INPUT_LIMITS

export interface ValidationResult {
  valid: boolean
  sanitized?: string
  error?: string
}

export function validateUserInput(
  field: InputField,
  value: string | undefined,
  required: boolean = false
): ValidationResult {
  const limits = INPUT_LIMITS[field]

  if (!value || value.trim().length === 0) {
    if (required) {
      return { valid: false, error: `${field}を入力してください` }
    }
    return { valid: true, sanitized: '' }
  }

  const sanitized = sanitizeUserInput(value)

  if (sanitized.length < limits.min) {
    return { valid: false, error: `${field}は${limits.min}文字以上で入力してください` }
  }

  if (sanitized.length > limits.max) {
    return { valid: false, error: `${field}は${limits.max}文字以内で入力してください` }
  }

  return { valid: true, sanitized }
}

// ============================================
// ファイル検証
// ============================================

// ファイル名の検証（パストラバーサル防止）
export function isValidFilename(filename: string): boolean {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false
  }
  if (/[\x00-\x1f\x7f]/.test(filename)) {
    return false
  }
  if (filename.trim().length === 0) {
    return false
  }
  return true
}

// MIMEタイプとファイル拡張子の整合性チェック
export function validateMimeType(
  materialType: string,
  mimeType: string | undefined,
  filename: string | undefined
): { valid: boolean; error?: string } {
  if (!mimeType) {
    return { valid: true }
  }

  const allowedMimes = ALLOWED_MIME_TYPES[materialType]
  if (allowedMimes && !allowedMimes.includes(mimeType)) {
    return {
      valid: false,
      error: `許可されていないファイル形式です: ${mimeType}`,
    }
  }

  if (filename) {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    const expectedMimes = EXTENSION_TO_MIME[ext]
    if (expectedMimes && !expectedMimes.includes(mimeType)) {
      return {
        valid: false,
        error: `ファイル拡張子(${ext})とMIMEタイプ(${mimeType})が一致しません`,
      }
    }
  }

  return { valid: true }
}

// ファイルサイズ検証
export function validateFileSize(sizeBytes: number | undefined): { valid: boolean; error?: string } {
  if (!sizeBytes) {
    return { valid: true }
  }
  if (sizeBytes > FILE_CONSTANTS.MAX_FILE_SIZE_BYTES) {
    const maxMB = FILE_CONSTANTS.MAX_FILE_SIZE_BYTES / 1024 / 1024
    return {
      valid: false,
      error: `ファイルサイズが大きすぎます。最大${maxMB}MBまでです。`,
    }
  }
  return { valid: true }
}

// ============================================
// テキスト処理
// ============================================

// テキストを最大長に切り詰める
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '\n\n[... 資料の続きは省略されています ...]'
}
