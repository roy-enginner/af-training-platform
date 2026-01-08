# af-training-platform メタプロンプト

Claude Codeでこのプロジェクトを開発する際に使用するメタプロンプトです。

---

## プロジェクト初期化プロンプト

```
あなたはAI研修プラットフォーム「af-training-platform」の開発を担当するシニアフルスタックエンジニアです。

## プロジェクト概要

**目的**: Assist FrontierのAI研修サービス用プラットフォーム構築
**ドメイン**: assist-frontier.site
**技術スタック**: React 19 + Vite + Tailwind CSS 4 + Supabase + Netlify Functions

## 技術要件

### フロントエンド
- React 19.x + TypeScript
- react-router-dom 7.x
- Tailwind CSS 4.x
- framer-motion 12.x（アニメーション）
- @heroicons/react 2.x（アイコン）
- react-hook-form + zod（フォーム・バリデーション）
- Vite 7.x（ビルド）

### バックエンド・インフラ
- Netlify（ホスティング + Functions）
- Supabase（PostgreSQL + Auth + Storage）
- Resend（メール送信）
- Square（決済連携）

### AI API連携（2026年1月時点最新モデル）
**OpenAI**: GPT-5.2 (Instant/Thinking/Pro), GPT-5, o4-mini, o3
**Anthropic**: Claude Opus 4.5, Claude Sonnet 4.5/4, Claude Haiku 4.5
**Google**: Gemini 3 Pro/Flash, Gemini 2.5 Pro/Flash

## デザインシステム

カラーパレット:
- Primary: #0088CC（青）
- Primary Dark: #005A8C
- Primary Light: #E6F4FA
- Secondary: #00C4D4（シアン）
- Accent: #FFB800（黄色）
- Text: #2C3E50
- Text Light: #64748B

フォント: "M PLUS 1p", "Hiragino Sans", sans-serif

グラデーション:
- gradient-hero: linear-gradient(135deg, #0088CC 0%, #00C4D4 100%)

## ディレクトリ構造

```
af-training-platform/
├── public/
│   ├── favicon.svg
│   └── images/
├── src/
│   ├── components/
│   │   ├── common/          # 共通コンポーネント
│   │   ├── layout/          # レイアウト（Header, Footer等）
│   │   ├── ui/              # UIコンポーネント（Button, Card等）
│   │   ├── admin/           # 管理画面コンポーネント
│   │   ├── trainee/         # 研修生画面コンポーネント
│   │   └── chat/            # チャット関連コンポーネント
│   ├── pages/
│   │   ├── admin/           # 管理画面ページ
│   │   ├── trainee/         # 研修生ページ
│   │   └── auth/            # 認証ページ
│   ├── hooks/               # カスタムフック
│   ├── lib/
│   │   ├── supabase.ts      # Supabaseクライアント
│   │   ├── ai/              # AI API連携
│   │   └── utils.ts         # ユーティリティ
│   ├── types/               # 型定義
│   ├── styles/
│   │   └── animations.ts    # Framer Motionアニメーション
│   └── App.tsx
├── netlify/
│   └── functions/           # Netlify Functions
│       ├── chat.ts          # チャットAPI
│       ├── curriculum.ts    # カリキュラム生成API
│       └── auth.ts          # 認証関連API
├── supabase/
│   └── migrations/          # DBマイグレーション
└── package.json
```

## コーディング規約

1. TypeScriptを厳格に使用（strict: true）
2. コンポーネントは関数コンポーネント + hooksで実装
3. スタイリングはTailwind CSSを優先、カスタムCSSは最小限
4. 非同期処理はasync/awaitで統一
5. エラーハンドリングは適切なtry-catchで実装
6. コメントは日本語でOK

## セキュリティ要件

- APIキーは環境変数で管理（.env）
- Supabase RLSを必ず設定
- ユーザー入力はzodでバリデーション
- XSS対策（React標準のエスケープを活用）

## 実装の優先順位

Phase 1: 基盤構築（認証、ユーザー管理）
Phase 2: カリキュラム機能
Phase 3: チャット機能
Phase 4: 進捗管理・分析
Phase 5: 通知・連携機能

まずはPhase 1から順番に実装していきます。
```

---

## Phase 1: 基盤構築プロンプト

```
## Phase 1: 基盤構築

以下の順番で実装してください。

### 1.1 プロジェクト初期化

```bash
npm create vite@latest af-training-platform -- --template react-ts
cd af-training-platform
npm install react-router-dom@7 framer-motion@12 @heroicons/react@2 react-hook-form @hookform/resolvers zod @supabase/supabase-js
npm install -D tailwindcss@4 @tailwindcss/postcss autoprefixer
```

### 1.2 Supabaseセットアップ

以下のテーブルを作成するマイグレーションを生成:

**users拡張**（Supabase Authのusersを拡張）
- profiles テーブル
  - id: uuid (PK, auth.users.id参照)
  - name: text
  - role: text ('admin' | 'trainee')
  - group_id: uuid (nullable)
  - notification_enabled: boolean (default: true)
  - notification_forced: boolean (default: false)
  - access_expires_at: timestamptz (nullable)

**groups**
- id: uuid (PK)
- name: text
- daily_token_limit: integer (default: 100000)
- created_at, updated_at

**RLSポリシー**
- 管理者は全データアクセス可能
- 研修生は自分のデータのみアクセス可能

### 1.3 認証機能

- ログインページ (/login)
- パスワード変更ページ (/change-password)
- 認証状態管理フック (useAuth)
- ProtectedRouteコンポーネント
- 役割別リダイレクト（管理者→/admin、研修生→/trainee）

### 1.4 レイアウト

- AdminLayout: 管理画面用レイアウト（サイドバー付き）
- TraineeLayout: 研修生用レイアウト
- 共通Header, Footer

### 1.5 ユーザー管理（管理画面）

- ユーザー一覧ページ (/admin/users)
- CSV一括登録機能
  - CSVフォーマット: グループ名,ユーザー名,メールアドレス
  - ランダムパスワード生成
  - Supabase Authへのユーザー作成
  - 招待メール送信（Resend経由）
- 個別ユーザー編集・削除

### 1.6 企業グループ管理

- グループ一覧ページ (/admin/groups)
- グループ作成・編集・削除
- 日次トークン制限設定
```

---

## Phase 2: カリキュラム機能プロンプト

```
## Phase 2: カリキュラム機能

### 2.1 データベーステーブル追加

**curricula**
- id, title, goal, version, status ('draft'|'published'|'archived')
- created_by, created_at, updated_at

**chapters**
- id, curriculum_id, order_index, title, content, task_description
- estimated_minutes (default: 5)
- created_at, updated_at

**curriculum_assignments**
- id, curriculum_id, curriculum_version
- assignee_type ('group'|'user'), assignee_id
- assigned_at, expires_at

### 2.2 カリキュラム自動生成（Claude API）

Netlify Function: /api/curriculum/generate

入力: { goal: string }
処理:
1. Claude API (claude-sonnet-4-5-20250929) に以下のプロンプトを送信:
   「以下の研修ゴールを達成するためのカリキュラムを作成してください。
   各チャプターは5分程度で学習できる内容に分割してください。
   
   ゴール: {goal}
   
   出力形式（JSON）:
   {
     "title": "カリキュラムタイトル",
     "chapters": [
       {
         "title": "チャプタータイトル",
         "content": "学習コンテンツ（Markdown形式）",
         "task_description": "ハンズオン課題の説明"
       }
     ]
   }」
2. レスポンスをパースしてDBに保存
3. ドラフトステータスで作成

### 2.3 カリキュラム管理UI

- カリキュラム一覧 (/admin/curricula)
- カリキュラム作成ウィザード
  1. ゴール入力
  2. 自動生成実行（ローディング表示）
  3. プレビュー・編集
  4. 公開
- チャプター編集（ドラッグ&ドロップ並び替え対応）
- バージョン管理表示

### 2.4 カリキュラム割当

- 割当画面 (/admin/curricula/:id/assign)
- グループ単位割当
- 個人単位割当
- 有効期限設定
```

---

## Phase 3: チャット機能プロンプト

```
## Phase 3: チャット機能

### 3.1 データベーステーブル追加

**chat_sessions**
- id, user_id, chapter_id (nullable), model, created_at

**chat_messages**
- id, session_id, role ('user'|'assistant'), content
- token_count, created_at

**token_usage**
- id, user_id, group_id, date, input_tokens, output_tokens, model

**api_settings**
- id, provider ('openai'|'anthropic'|'google')
- api_key_encrypted, enabled, created_at, updated_at

### 3.2 AI API連携 (Netlify Functions)

/api/chat エンドポイント:

```typescript
interface ChatRequest {
  sessionId?: string;
  chapterId?: string;
  model: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

// 処理フロー:
// 1. トークン制限チェック（個人・グループ）
// 2. 制限超過時はエラーレスポンス
// 3. プロバイダー判定（モデル名から）
// 4. 各APIにリクエスト（ストリーミング対応）
// 5. トークン使用量を記録
// 6. レスポンス返却
```

対応モデル:
- OpenAI: gpt-5.2-instant, gpt-5.2-thinking, gpt-5.2-pro, gpt-5, o4-mini, o3
- Anthropic: claude-opus-4-5-20251101, claude-sonnet-4-5-20250929, claude-sonnet-4-20250514, claude-haiku-4-5-20251001
- Google: gemini-3-pro-preview, gemini-3-flash-preview, gemini-2.5-pro, gemini-2.5-flash

### 3.3 チャットUI

コンポーネント:
- ChatContainer: チャット画面全体
- ChatHeader: モデル選択、セッション情報
- MessageList: メッセージ一覧（ストリーミング表示対応）
- ChatInput: 入力欄、送信ボタン
- TokenUsageIndicator: 残りトークン数表示

機能:
- モデル切り替え（ドロップダウン）
- ストリーミング応答表示
- Markdownレンダリング
- コードブロックのシンタックスハイライト
- 履歴セッション切り替え

### 3.4 トークン制限

- 日次制限（個人ごと、グループごと）
- 残量表示（プログレスバー）
- 制限到達時のUIブロック
- 翌日リセット（UTCベース or JSTベース設定可能）
```

---

## Phase 4: 進捗管理・分析プロンプト

```
## Phase 4: 進捗管理・分析

### 4.1 データベーステーブル追加

**progress**
- id, user_id, chapter_id, completed, completed_at, created_at

### 4.2 研修生向け進捗UI

- マイページ (/trainee)
  - 割当カリキュラム一覧
  - 全体進捗率（プログレスバー）
- カリキュラム詳細 (/trainee/curricula/:id)
  - チャプター一覧
  - 完了ステータス表示
  - 次のチャプターへのナビゲーション
- チャプター学習画面 (/trainee/chapters/:id)
  - 学習コンテンツ表示（Markdown）
  - ハンズオン課題説明
  - チャットエリア
  - 「課題完了」チェックボックス
  - 次のチャプターボタン

### 4.3 管理者ダッシュボード

/admin/dashboard:
- サマリーカード
  - 総研修生数
  - アクティブユーザー数（過去7日）
  - 平均完了率
  - 本日のAPI使用量
- グラフ
  - 日別API使用量推移（過去30日）
  - カリキュラム別完了率
  - モデル別使用比率

/admin/analytics:
- 企業別進捗サマリーテーブル
- 研修生別詳細進捗（フィルタリング可能）
- API利用量レポート（日次/月次切り替え）
- チャット利用統計（よく使われるモデル、平均セッション時間等）
- 研修完了率・離脱率分析

### 4.4 レポート機能

- CSV/Excelエクスポート
- 期間指定フィルター
- グループ・ユーザー絞り込み
```

---

## Phase 5: 通知・連携機能プロンプト

```
## Phase 5: 通知・連携機能

### 5.1 メール通知（Resend）

Netlify Function: /api/notifications/send

通知種別:
1. 招待メール
   - 件名: 【Assist Frontier】AI研修プログラムへようこそ
   - 内容: ログインURL、初期パスワード、パスワード変更の案内

2. リマインドメール（日次）
   - 件名: 【リマインド】未完了の研修チャプターがあります
   - 内容: 未完了チャプター一覧、学習再開リンク
   - 条件: notification_enabled=true かつ notification_forced=falseでユーザーがON、またはforced=true

3. 研修期限通知
   - 件名: 【お知らせ】研修アクセス期限が近づいています
   - 内容: 期限日、残りチャプター数

### 5.2 スケジュール実行

Netlify Scheduled Functions:
- 毎日9:00 JST: リマインドメール送信
- 毎日0:00 JST: 期限切れユーザーのデータ削除

### 5.3 管理者障害通知

エラー発生時:
1. メール通知（Resend）
2. Teams Webhook通知

対象:
- API呼び出し連続失敗
- データベース接続エラー
- 認証エラー多発

### 5.4 Square連携

管理画面機能:
- Square請求書作成ボタン
- 請求書ステータス確認
- 入金確認後の手動アカウント有効化

### 5.5 PDF出力

機能:
- カリキュラム内容のPDF生成
- react-pdf または jspdf 使用
- レイアウト: A4縦、ヘッダー/フッター付き
- 内容: カリキュラムタイトル、各チャプターのコンテンツ・課題

ダウンロードボタン:
- 管理画面: カリキュラム詳細ページ
- 研修生画面: 割当カリキュラム詳細ページ
```

---

## トラブルシューティングプロンプト

```
## トラブルシューティング

以下の問題が発生した場合の対処法を教えてください。

### よくある問題

1. Supabase RLSでアクセス拒否される
2. Netlify Functionsのタイムアウト
3. AI APIのレート制限エラー
4. ストリーミングレスポンスが途中で切れる
5. CSVアップロードで文字化け
6. Resendのメール送信失敗

### デバッグ方法

- Supabase: ダッシュボードのログ確認、RLSポリシーのテスト
- Netlify Functions: netlify dev でローカルテスト
- AI API: リトライロジックの確認、エラーレスポンスのログ出力
```

---

## 使用方法

1. Claude Codeを起動
2. 「プロジェクト初期化プロンプト」を貼り付けて実行
3. 各Phaseのプロンプトを順番に実行
4. 必要に応じて「トラブルシューティングプロンプト」を参照

---

## 補足: 環境変数設定

```env
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI APIs
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_AI_API_KEY=your_google_key

# Resend
RESEND_API_KEY=your_resend_key

# Square
SQUARE_ACCESS_TOKEN=your_square_token
SQUARE_ENVIRONMENT=sandbox # or production

# Teams Webhook
TEAMS_WEBHOOK_URL=your_webhook_url
```
