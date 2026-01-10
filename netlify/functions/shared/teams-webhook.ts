// ============================================
// Microsoft Teams Webhook 通知モジュール
// ============================================

// ============================================
// 型定義
// ============================================
export interface TeamsMessage {
  title: string
  subtitle?: string
  text: string
  themeColor?: string // Hex color (例: "FF0000")
  sections?: TeamsSection[]
  potentialAction?: TeamsAction[]
}

export interface TeamsSection {
  activityTitle?: string
  activitySubtitle?: string
  activityImage?: string
  activityText?: string
  facts?: Array<{ name: string; value: string }>
  text?: string
  markdown?: boolean
}

export interface TeamsAction {
  '@type': 'OpenUri' | 'HttpPOST' | 'ActionCard'
  name: string
  targets?: Array<{ os: string; uri: string }>
  body?: string
}

export interface TeamsSendResult {
  success: boolean
  error?: string
}

// ============================================
// Teams カラー定数
// ============================================
export const TEAMS_COLORS = {
  error: 'FF0000',    // 赤
  warning: 'FFA500',  // オレンジ
  success: '00FF00',  // 緑
  info: '0078D4',     // 青（Microsoft Blue）
  urgent: 'FF00FF',   // マゼンタ
} as const

// ============================================
// Adaptive Card 形式のメッセージ作成
// ============================================
interface AdaptiveCardContent {
  type: 'AdaptiveCard'
  $schema: string
  version: string
  body: Array<{
    type: string
    text?: string
    size?: string
    weight?: string
    color?: string
    wrap?: boolean
    facts?: Array<{ title: string; value: string }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }>
  actions?: Array<{
    type: string
    title: string
    url?: string
  }>
}

export function createAdaptiveCard(options: {
  title: string
  subtitle?: string
  body: string
  color?: 'error' | 'warning' | 'success' | 'info' | 'urgent'
  facts?: Array<{ title: string; value: string }>
  actionUrl?: string
  actionTitle?: string
}): AdaptiveCardContent {
  const colorMap: Record<string, string> = {
    error: 'attention',
    warning: 'warning',
    success: 'good',
    info: 'accent',
    urgent: 'attention',
  }

  const body: AdaptiveCardContent['body'] = [
    {
      type: 'TextBlock',
      text: options.title,
      size: 'Large',
      weight: 'Bolder',
      color: options.color ? colorMap[options.color] : 'default',
      wrap: true,
    },
  ]

  if (options.subtitle) {
    body.push({
      type: 'TextBlock',
      text: options.subtitle,
      size: 'Small',
      color: 'accent',
      wrap: true,
    })
  }

  body.push({
    type: 'TextBlock',
    text: options.body,
    wrap: true,
  })

  if (options.facts && options.facts.length > 0) {
    body.push({
      type: 'FactSet',
      facts: options.facts,
    })
  }

  const card: AdaptiveCardContent = {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body,
  }

  if (options.actionUrl && options.actionTitle) {
    card.actions = [
      {
        type: 'Action.OpenUrl',
        title: options.actionTitle,
        url: options.actionUrl,
      },
    ]
  }

  return card
}

// ============================================
// Teams Webhook送信
// ============================================
export async function sendTeamsWebhook(
  webhookUrl: string,
  message: TeamsMessage
): Promise<TeamsSendResult> {
  try {
    // MessageCard形式のペイロードを作成
    const payload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: message.themeColor || TEAMS_COLORS.info,
      summary: message.title,
      title: message.title,
      ...(message.subtitle && { subtitle: message.subtitle }),
      text: message.text,
      sections: message.sections?.map((section) => ({
        activityTitle: section.activityTitle,
        activitySubtitle: section.activitySubtitle,
        activityImage: section.activityImage,
        activityText: section.activityText,
        facts: section.facts,
        text: section.text,
        markdown: section.markdown ?? true,
      })),
      potentialAction: message.potentialAction,
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Teams webhook failed:', response.status, errorText)
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Teams webhook error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ============================================
// Adaptive Card形式での送信（新しいTeams Workflow対応）
// ============================================
export async function sendTeamsAdaptiveCard(
  webhookUrl: string,
  card: AdaptiveCardContent
): Promise<TeamsSendResult> {
  try {
    const payload = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: card,
        },
      ],
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Teams adaptive card webhook failed:', response.status, errorText)
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Teams adaptive card webhook error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ============================================
// エスカレーション通知用のテンプレート
// ============================================
export function createEscalationNotification(options: {
  trigger: string
  userName: string
  userEmail: string
  sessionType: string
  message: string
  matchedKeywords?: string[]
  dashboardUrl?: string
}): TeamsMessage {
  const facts: Array<{ name: string; value: string }> = [
    { name: 'ユーザー', value: `${options.userName} (${options.userEmail})` },
    { name: 'トリガー', value: options.trigger },
    { name: 'セッション種別', value: options.sessionType },
  ]

  if (options.matchedKeywords && options.matchedKeywords.length > 0) {
    facts.push({
      name: '検出キーワード',
      value: options.matchedKeywords.join(', '),
    })
  }

  const message: TeamsMessage = {
    title: '🚨 エスカレーション通知',
    subtitle: `トリガー: ${options.trigger}`,
    text: options.message,
    themeColor: TEAMS_COLORS.urgent,
    sections: [
      {
        facts,
        markdown: true,
      },
    ],
  }

  if (options.dashboardUrl) {
    message.potentialAction = [
      {
        '@type': 'OpenUri',
        name: '管理画面を開く',
        targets: [{ os: 'default', uri: options.dashboardUrl }],
      },
    ]
  }

  return message
}

// ============================================
// システムエラー通知用のテンプレート
// ============================================
export function createSystemErrorNotification(options: {
  errorType: string
  errorMessage: string
  functionName?: string
  userId?: string
  timestamp?: string
}): TeamsMessage {
  const facts: Array<{ name: string; value: string }> = [
    { name: 'エラー種別', value: options.errorType },
  ]

  if (options.functionName) {
    facts.push({ name: '関数名', value: options.functionName })
  }
  if (options.userId) {
    facts.push({ name: 'ユーザーID', value: options.userId })
  }
  if (options.timestamp) {
    facts.push({ name: '発生時刻', value: options.timestamp })
  }

  return {
    title: '⚠️ システムエラー',
    text: options.errorMessage,
    themeColor: TEAMS_COLORS.error,
    sections: [
      {
        facts,
        markdown: true,
      },
    ],
  }
}

// ============================================
// バグレポート通知用のテンプレート
// ============================================
export function createBugReportNotification(options: {
  reportedBy: string
  reporterEmail: string
  description: string
  category?: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  dashboardUrl?: string
}): TeamsMessage {
  const severityColors: Record<string, string> = {
    low: TEAMS_COLORS.info,
    medium: TEAMS_COLORS.warning,
    high: TEAMS_COLORS.error,
    critical: TEAMS_COLORS.urgent,
  }

  const severityLabels: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '緊急',
  }

  const facts: Array<{ name: string; value: string }> = [
    { name: '報告者', value: `${options.reportedBy} (${options.reporterEmail})` },
  ]

  if (options.category) {
    facts.push({ name: 'カテゴリ', value: options.category })
  }
  if (options.severity) {
    facts.push({ name: '重要度', value: severityLabels[options.severity] })
  }

  const message: TeamsMessage = {
    title: '🐛 バグレポート',
    text: options.description,
    themeColor: options.severity ? severityColors[options.severity] : TEAMS_COLORS.warning,
    sections: [
      {
        facts,
        markdown: true,
      },
    ],
  }

  if (options.dashboardUrl) {
    message.potentialAction = [
      {
        '@type': 'OpenUri',
        name: '詳細を確認',
        targets: [{ os: 'default', uri: options.dashboardUrl }],
      },
    ]
  }

  return message
}
