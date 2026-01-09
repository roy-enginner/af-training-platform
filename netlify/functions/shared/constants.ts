// Cleanup settings (days after expiry to delete users/groups)
export const DAYS_AFTER_EXPIRY = 30

// ============================================
// ファイル処理の定数
// ============================================
export const FILE_CONSTANTS = {
  // 最大ファイルサイズ (50MB)
  MAX_FILE_SIZE_BYTES: 52428800,
  // AI生成用の最大テキスト長 (約20,000トークン相当)
  MAX_TEXT_LENGTH_FOR_AI: 80000,
  // チャプター生成用の最大テキスト長
  MAX_TEXT_LENGTH_FOR_CHAPTER: 40000,
} as const

// ============================================
// 入力バリデーションの制限
// ============================================
export const INPUT_LIMITS = {
  goal: { min: 10, max: 1000 },
  targetAudience: { min: 1, max: 200 },
  customInstructions: { min: 0, max: 500 },
  changeSummary: { min: 0, max: 500 },
} as const

// ============================================
// 許可されたMIMEタイプ
// ============================================
export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  excel: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ],
  text: ['text/plain'],
  markdown: ['text/plain', 'text/markdown', 'text/x-markdown'],
}

// ファイル拡張子とMIMEタイプのマッピング
export const EXTENSION_TO_MIME: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.xls': ['application/vnd.ms-excel'],
  '.txt': ['text/plain'],
  '.md': ['text/plain', 'text/markdown', 'text/x-markdown'],
  '.markdown': ['text/plain', 'text/markdown', 'text/x-markdown'],
}
