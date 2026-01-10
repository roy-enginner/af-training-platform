/**
 * MarkdownコードブロックからプレーンなJSON文字列を抽出
 *
 * AIの応答が ```json で囲まれている場合に対応
 */
export function extractJsonFromMarkdown(text: string): string {
  let jsonStr = text.trim()

  // ```json または ``` で始まる場合
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7)
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3)
  }

  // ``` で終わる場合
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3)
  }

  return jsonStr.trim()
}

/**
 * AIの応答からJSONを安全にパース
 *
 * @throws {Error} JSONのパースに失敗した場合
 */
export function parseAiJsonResponse<T>(text: string): T {
  const jsonStr = extractJsonFromMarkdown(text)
  return JSON.parse(jsonStr) as T
}
