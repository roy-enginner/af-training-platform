/**
 * ランダムパスワード生成ユーティリティ
 * 紛らわしい文字（0, O, 1, l, I）を除外した安全なパスワードを生成
 */

/**
 * ランダムパスワードを生成
 * @param length パスワードの長さ（デフォルト: 12）
 * @returns 生成されたパスワード
 */
export function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
