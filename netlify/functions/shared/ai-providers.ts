// ============================================
// AIプロバイダー統一インターフェース
// OpenAI, Anthropic, Google AI APIの抽象化
// ============================================

import Anthropic from '@anthropic-ai/sdk'

// ============================================
// 型定義
// ============================================
export type AIProvider = 'openai' | 'anthropic' | 'google'

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIStreamOptions {
  model: string
  provider: AIProvider
  messages: AIMessage[]
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  onToken?: (token: string) => void
  onComplete?: (fullText: string, usage: TokenUsageInfo) => void
  onError?: (error: Error) => void
}

export interface AICompletionOptions {
  model: string
  provider: AIProvider
  messages: AIMessage[]
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
}

export interface AICompletionResult {
  content: string
  usage: TokenUsageInfo
  model: string
}

export interface TokenUsageInfo {
  inputTokens: number
  outputTokens: number
}

// ============================================
// プロバイダー別クライアント取得
// ============================================

// Anthropic クライアント (シングルトン)
let anthropicClient: Anthropic | null = null

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set')
    }
    anthropicClient = new Anthropic({ apiKey })
  }
  return anthropicClient
}

// OpenAI クライアント取得
async function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  // 動的インポートで OpenAI SDK を読み込み
  const { default: OpenAI } = await import('openai')
  return new OpenAI({ apiKey })
}

// Google AI クライアント取得
async function getGoogleAIClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not set')
  }
  // 動的インポートで Google AI SDK を読み込み
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  return new GoogleGenerativeAI(apiKey)
}

// ============================================
// ストリーミング対応の完了生成
// ============================================

export async function* streamCompletion(
  options: Omit<AIStreamOptions, 'onToken' | 'onComplete' | 'onError'>
): AsyncGenerator<{ type: 'token' | 'done' | 'error'; data: string | TokenUsageInfo | Error }> {
  const { provider, model, messages, systemPrompt, maxTokens = 4096, temperature = 0.7 } = options

  try {
    switch (provider) {
      case 'anthropic':
        yield* streamAnthropicCompletion(model, messages, systemPrompt, maxTokens, temperature)
        break
      case 'openai':
        yield* streamOpenAICompletion(model, messages, systemPrompt, maxTokens, temperature)
        break
      case 'google':
        yield* streamGoogleCompletion(model, messages, systemPrompt, maxTokens, temperature)
        break
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  } catch (error) {
    yield { type: 'error', data: error instanceof Error ? error : new Error(String(error)) }
  }
}

// ============================================
// Anthropic ストリーミング
// ============================================
async function* streamAnthropicCompletion(
  model: string,
  messages: AIMessage[],
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number
): AsyncGenerator<{ type: 'token' | 'done'; data: string | TokenUsageInfo }> {
  const client = getAnthropicClient()

  // メッセージ形式を変換（systemは別扱い）
  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

  // システムプロンプトを結合
  const systemContent = [
    systemPrompt,
    ...messages.filter((m) => m.role === 'system').map((m) => m.content),
  ]
    .filter(Boolean)
    .join('\n\n')

  let fullText = ''
  let inputTokens = 0
  let outputTokens = 0

  const stream = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemContent || undefined,
    messages: anthropicMessages,
    stream: true,
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text
      yield { type: 'token', data: event.delta.text }
    } else if (event.type === 'message_start' && event.message.usage) {
      inputTokens = event.message.usage.input_tokens
    } else if (event.type === 'message_delta' && event.usage) {
      outputTokens = event.usage.output_tokens
    }
  }

  yield { type: 'done', data: { inputTokens, outputTokens } }
}

// ============================================
// OpenAI ストリーミング
// ============================================
async function* streamOpenAICompletion(
  model: string,
  messages: AIMessage[],
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number
): AsyncGenerator<{ type: 'token' | 'done'; data: string | TokenUsageInfo }> {
  const client = await getOpenAIClient()

  // システムプロンプトをメッセージに追加
  const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
  if (systemPrompt) {
    openaiMessages.push({ role: 'system', content: systemPrompt })
  }
  openaiMessages.push(
    ...messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }))
  )

  let fullText = ''

  const stream = await client.chat.completions.create({
    model,
    messages: openaiMessages,
    max_tokens: maxTokens,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
  })

  let inputTokens = 0
  let outputTokens = 0

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      fullText += content
      yield { type: 'token', data: content }
    }
    // 使用量情報を取得
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens
      outputTokens = chunk.usage.completion_tokens
    }
  }

  // OpenAI はストリーム終了時に usage を返さない場合があるため推定
  if (inputTokens === 0) {
    inputTokens = estimateTokens(openaiMessages.map((m) => m.content).join(' '))
    outputTokens = estimateTokens(fullText)
  }

  yield { type: 'done', data: { inputTokens, outputTokens } }
}

// ============================================
// Google AI ストリーミング
// ============================================
async function* streamGoogleCompletion(
  model: string,
  messages: AIMessage[],
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number
): AsyncGenerator<{ type: 'token' | 'done'; data: string | TokenUsageInfo }> {
  const client = await getGoogleAIClient()
  const genModel = client.getGenerativeModel({ model })

  // 会話履歴を構築
  const history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []
  let lastUserMessage = ''

  for (const msg of messages) {
    if (msg.role === 'system') {
      // システムメッセージはプロンプトに含める
      continue
    }
    if (msg.role === 'user') {
      lastUserMessage = msg.content
    } else if (msg.role === 'assistant') {
      if (lastUserMessage) {
        history.push({ role: 'user', parts: [{ text: lastUserMessage }] })
        lastUserMessage = ''
      }
      history.push({ role: 'model', parts: [{ text: msg.content }] })
    }
  }

  // 最後のユーザーメッセージを取得
  const userMessage = lastUserMessage || messages.filter((m) => m.role === 'user').pop()?.content || ''

  // システムプロンプトを含めたチャット
  const chat = genModel.startChat({
    history,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
    systemInstruction: systemPrompt
      ? { parts: [{ text: systemPrompt }] }
      : undefined,
  })

  let fullText = ''
  const result = await chat.sendMessageStream(userMessage)

  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) {
      fullText += text
      yield { type: 'token', data: text }
    }
  }

  // Google AI はトークン数を返さないため推定
  const inputTokens = estimateTokens(
    (systemPrompt || '') + messages.map((m) => m.content).join(' ')
  )
  const outputTokens = estimateTokens(fullText)

  yield { type: 'done', data: { inputTokens, outputTokens } }
}

// ============================================
// 非ストリーミング完了生成
// ============================================
export async function createCompletion(options: AICompletionOptions): Promise<AICompletionResult> {
  const { provider, model, messages, systemPrompt, maxTokens = 4096, temperature = 0.7 } = options

  switch (provider) {
    case 'anthropic':
      return createAnthropicCompletion(model, messages, systemPrompt, maxTokens, temperature)
    case 'openai':
      return createOpenAICompletion(model, messages, systemPrompt, maxTokens, temperature)
    case 'google':
      return createGoogleCompletion(model, messages, systemPrompt, maxTokens, temperature)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

async function createAnthropicCompletion(
  model: string,
  messages: AIMessage[],
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number
): Promise<AICompletionResult> {
  const client = getAnthropicClient()

  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

  const systemContent = [
    systemPrompt,
    ...messages.filter((m) => m.role === 'system').map((m) => m.content),
  ]
    .filter(Boolean)
    .join('\n\n')

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemContent || undefined,
    messages: anthropicMessages,
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : ''

  return {
    content,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    model: response.model,
  }
}

async function createOpenAICompletion(
  model: string,
  messages: AIMessage[],
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number
): Promise<AICompletionResult> {
  const client = await getOpenAIClient()

  const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
  if (systemPrompt) {
    openaiMessages.push({ role: 'system', content: systemPrompt })
  }
  openaiMessages.push(
    ...messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }))
  )

  const response = await client.chat.completions.create({
    model,
    messages: openaiMessages,
    max_tokens: maxTokens,
    temperature,
  })

  return {
    content: response.choices[0]?.message?.content || '',
    usage: {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
    },
    model: response.model,
  }
}

async function createGoogleCompletion(
  model: string,
  messages: AIMessage[],
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number
): Promise<AICompletionResult> {
  const client = await getGoogleAIClient()
  const genModel = client.getGenerativeModel({ model })

  // 会話履歴を構築
  const history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []
  let lastUserMessage = ''

  for (const msg of messages) {
    if (msg.role === 'system') continue
    if (msg.role === 'user') {
      lastUserMessage = msg.content
    } else if (msg.role === 'assistant') {
      if (lastUserMessage) {
        history.push({ role: 'user', parts: [{ text: lastUserMessage }] })
        lastUserMessage = ''
      }
      history.push({ role: 'model', parts: [{ text: msg.content }] })
    }
  }

  const userMessage = lastUserMessage || messages.filter((m) => m.role === 'user').pop()?.content || ''

  const chat = genModel.startChat({
    history,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
  })

  const result = await chat.sendMessage(userMessage)
  const content = result.response.text()

  // トークン推定
  const inputTokens = estimateTokens(
    (systemPrompt || '') + messages.map((m) => m.content).join(' ')
  )
  const outputTokens = estimateTokens(content)

  return {
    content,
    usage: { inputTokens, outputTokens },
    model,
  }
}

// ============================================
// トークン数推定（簡易版）
// ============================================
export function estimateTokens(text: string): number {
  // 日本語は約1.5文字で1トークン、英語は約4文字で1トークンとして概算
  const japaneseChars = (text.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g) || []).length
  const otherChars = text.length - japaneseChars

  return Math.ceil(japaneseChars / 1.5 + otherChars / 4)
}

// ============================================
// SSE フォーマットヘルパー
// ============================================
export function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function formatSSEToken(token: string): string {
  return formatSSE('token', { token })
}

export function formatSSEDone(usage: TokenUsageInfo): string {
  return formatSSE('done', { usage })
}

export function formatSSEError(message: string): string {
  return formatSSE('error', { message })
}

// ============================================
// モデル情報
// ============================================
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
}

export const MODEL_MAX_TOKENS: Record<string, number> = {
  // Anthropic
  'claude-opus-4-20250514': 32768,
  'claude-sonnet-4-20250514': 64000,
  'claude-3-5-haiku-20241022': 8192,
  // OpenAI
  'gpt-4o': 16384,
  'gpt-4o-mini': 16384,
  'gpt-4-turbo': 4096,
  // Google
  'gemini-2.0-flash': 8192,
  'gemini-1.5-pro': 8192,
  'gemini-1.5-flash': 8192,
}

export function getModelMaxTokens(model: string): number {
  return MODEL_MAX_TOKENS[model] || 4096
}
