# AI研修プラットフォーム要件定義書

**プロジェクト名**: af-training-platform
**ドメイン**: assist-frontier.site
**作成日**: 2026/01/07
**最終更新日**: 2026/01/09
**ステータス**: 実装中

---

## 1. プロジェクト概要

### 1.1 目的
Assist FrontierのAI研修サービス用プラットフォーム。企業向け・個人向けにAI活用研修を提供し、研修生がハンズオン形式で主要GAI（ChatGPT, Gemini, Claude）を体験できる環境を構築する。

### 1.2 主要機能
- 管理者によるカリキュラム自動生成（Claude API使用）
- 研修生向けチャットUI（複数AIモデル対応）
- 進捗管理・分析ダッシュボード
- API利用量制限（日次トークン数ベース）
- カリキュラムPDF出力
- **企業・部署・グループの階層管理**
- **個人ユーザー対応**
- **柔軟な属性管理（役職・スキル等）**

### 1.3 想定規模（ローンチ時）
| 項目 | 数値 |
|------|------|
| 企業数 | 約5社 |
| 研修生数 | 約500名 |
| 同時接続数 | 最大50名 |

---

## 2. 技術スタック

### 2.1 フロントエンド
| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| フレームワーク | React | ^19.x |
| ルーティング | react-router-dom | ^7.x |
| スタイリング | Tailwind CSS | ^4.x |
| アニメーション | framer-motion | ^12.x |
| アイコン | @heroicons/react | ^2.x |
| フォーム | react-hook-form + zod | 最新 |
| ビルド | Vite | ^7.x |
| PDF生成 | react-pdf / jspdf | 最新 |

### 2.2 バックエンド・インフラ
| カテゴリ | 技術 | 備考 |
|---------|------|------|
| ホスティング | Netlify | Functions + Scheduled Functions |
| データベース | Supabase (PostgreSQL) | 認証・Storage含む |
| 認証 | Supabase Auth | 招待メール機能内蔵 |
| メール送信 | Resend | 3,000通/月無料枠 |
| 決済 | Square | 請求書発行連携 |

### 2.3 AI API（2026/01時点最新モデル）

#### OpenAI
| モデル | 用途 | API識別子 |
|--------|------|-----------|
| GPT-5.2 Instant | 高速応答 | gpt-5.2-instant |
| GPT-5.2 Thinking | 構造化作業・コーディング | gpt-5.2-thinking |
| GPT-5.2 Pro | 高精度・難問 | gpt-5.2-pro |
| GPT-5 | 汎用 | gpt-5 |
| o4-mini | 高速推論・コスト効率 | o4-mini |
| o3 | 高度な推論 | o3 |

#### Anthropic Claude
| モデル | 用途 | API識別子 |
|--------|------|-----------|
| Claude Opus 4.5 | 最高性能・エージェント | claude-opus-4-5-20251101 |
| Claude Sonnet 4.5 | コーディング・エージェント | claude-sonnet-4-5-20250929 |
| Claude Sonnet 4 | 汎用・高速 | claude-sonnet-4-20250514 |
| Claude Haiku 4.5 | 軽量・低レイテンシ | claude-haiku-4-5-20251001 |

#### Google Gemini
| モデル | 用途 | API識別子 |
|--------|------|-----------|
| Gemini 3 Pro | 最新推論・エージェント | gemini-3-pro-preview |
| Gemini 3 Flash | 高速・低コスト | gemini-3-flash-preview |
| Gemini 2.5 Pro | 安定版・高性能 | gemini-2.5-pro |
| Gemini 2.5 Flash | 安定版・高速 | gemini-2.5-flash |

#### モデル使用戦略（実装済み）
| 機能 | モデル | 理由 |
|------|--------|------|
| カリキュラム構成生成 | Claude Opus 4.5 | 高精度なプランニング・構造化が必要 |
| カリキュラムコンテンツ生成 | Claude Sonnet 4.5 | コスト効率とコンテンツ品質のバランス |
| 研修生チャット | 複数モデル切替 | 学習目的に応じて選択可能 |

---

## 3. ユーザー権限・階層構造

### 3.1 組織階層（実装済み）
```
企業（Company）
├── 部署A（Department）※階層構造対応（入れ子可能）
│   ├── グループ1（Group）
│   │   ├── 研修生1（Trainee）
│   │   └── 研修生2
│   └── グループ2
│       └── ...
├── 部署B
│   └── グループ3
│       └── ...
└── 直下のグループ（部署なし）
    └── ...

個人ユーザー（is_individual = true）
├── 個人研修生A（企業・グループに属さない）
└── 個人研修生B
```

### 3.2 ユーザーロール（実装済み）
| ロール | 説明 |
|--------|------|
| `super_admin` | スーパー管理者（Assist Frontier）- 全機能アクセス可 |
| `group_admin` | グループ管理者（企業担当者）- 自グループのユーザー管理のみ |
| `trainee` | 研修生 - 学習機能のみ |

### 3.3 権限マトリクス（実装済み）
| 機能 | super_admin | group_admin | trainee |
|------|-------------|-------------|---------|
| 企業管理 | ✅ | ❌ | ❌ |
| 部署管理 | ✅ | ❌ | ❌ |
| グループ管理 | ✅ | ❌ | ❌ |
| 全ユーザー管理 | ✅ | ❌ | ❌ |
| 自グループユーザー管理 | ✅ | ✅ | ❌ |
| 管理者ロール付与 | ✅ | ❌ | ❌ |
| カリキュラム管理 | ✅ | ❌ | ❌ |
| 属性定義管理 | ✅ | ❌ | ❌ |
| 全レポート閲覧 | ✅ | ❌ | ❌ |
| カリキュラム閲覧 | ✅（全て） | ✅（割当分） | ✅（割当分のみ） |
| チャット利用 | ✅ | ✅ | ✅（割当枠内） |
| 進捗確認 | ✅（全体） | ✅（自グループ） | ✅（自分のみ） |

---

## 4. 機能詳細

### 4.1 認証・ユーザー管理（実装済み）

#### 登録フロー
1. 管理者がCSV（アクション、グループ名、ユーザー名、メールアドレス）をアップロード
2. システムが自動で初期パスワード（ランダム生成）を発行
3. 招待メールを各研修生に送信（Resend使用）
4. 研修生がログイン後、パスワードを強制変更

#### CSV機能（実装済み）
- **テンプレートダウンロード機能**
- **追加（add）・削除（delete）アクション対応**
- フォーマット: `アクション,グループ名,ユーザー名,メールアドレス`

#### パスワードポリシー（NIST SP 800-63B準拠）
- 最小12文字以上
- 漏洩パスワードリストとの照合
- 連続した文字・数字の禁止
- ユーザー情報との類似禁止
- **初回ログイン時のパスワード強制変更**

#### 将来実装予定
- 二要素認証（MFA）
- IPアドレス制限

### 4.2 アクセス制御（実装済み）

#### 契約期間ベースのアクセス制御
- **企業単位**: `contract_start_date` 〜 `contract_end_date`
- **グループ単位**: `start_date` 〜 `end_date`
- **個人ユーザー**: `start_date` 〜 `end_date`（プロファイルに直接設定）

#### 研修日ベースのアクセス制御
- **グループ研修日**: `group_training_dates` テーブルで複数日設定可能
- **個人研修日**: `individual_training_dates` テーブル
- **復習期間**: 研修実施日から `review_period_days`（デフォルト14日）はアクセス許可

#### アクセス判定ロジック
```
アクセス許可 = 以下のいずれかを満たす場合
1. 管理者ロール（super_admin / group_admin）
2. 契約期間内（start_date <= 今日 <= end_date）
3. 研修日 + 復習期間内（研修日 <= 今日 <= 研修日 + review_period_days）
```

#### 自動削除機能（実装済み）
- **契約終了後30日経過で自動削除**
- Netlify Scheduled Functions で毎日 3:00 AM JST に実行
- 削除対象: traineeユーザーのみ（管理者は対象外）

### 4.3 カリキュラム管理（実装済み）

#### 自動生成フロー（2段階AI生成 + 承認フロー）
1. 管理者が基本情報を入力
   - 研修ゴール（例：自分専用のAIエージェントを作る）
   - 対象者（例：営業部門の中堅社員）
   - 難易度（初級/中級/上級）
   - 想定時間（分）
   - 前提知識
2. **Step 1: 構成生成（Claude Opus 4.5）**
   - チャプター構成、概要、学習目標、目安時間を自動生成
   - 高精度なプランニングにOpusを使用
3. **Step 2: 管理者による構成承認**
   - 生成された構成をプレビュー確認
   - 承認ボタンで次のステップへ進む
4. **Step 3: コンテンツ生成（Claude Sonnet 4.5）**
   - 承認された構成に基づき、各チャプターの詳細コンテンツを生成
   - 学習コンテンツ（Markdown形式）
   - ハンズオン課題
   - コスト効率の良いSonnetを使用
5. **Step 4: 保存・公開**
   - データベースに保存
   - 必要に応じて手動編集（追加/削除/並び替え/内容修正）
   - 公開

#### カリキュラム構造
```
カリキュラム
├── チャプター1（約5分）
│   ├── 学習コンテンツ（テキスト）
│   └── ハンズオン課題（自由チャット形式）
├── チャプター2（約5分）
│   └── ...
└── チャプターN
```

#### 割当単位（実装済みDB構造）
- **企業単位**: 企業全体に一括割当
- **部署単位**: 特定部署に割当
- **グループ単位**: 特定グループに割当
- **個人単位**: 個別ユーザーに直接割当

### 4.4 チャット機能

#### 実装方式
- フルスクラッチ（Netlify Functions + 各AI API直接連携）
- 会話履歴はSupabaseに保存

#### 機能要件
- 複数AIモデルの切り替え（研修生が選択可能）
- 会話履歴の保存・振り返り
- 日次トークン制限の表示
- ストリーミング応答対応

#### 制限管理
- 研修生ごとの日次トークン数制限
- 企業/グループごとの日次トークン数制限
- 制限到達時のユーザーへの表示メッセージ

### 4.5 ユーザー属性管理（実装済みDB構造）

#### 柔軟な属性システム
- **属性定義マスタ**: `attribute_definitions` テーブル
- **ユーザー属性**: `user_attributes` テーブル（Key-Value形式）

#### デフォルト属性
| キー | ラベル | タイプ | 選択肢 |
|------|--------|--------|--------|
| position | 役職 | select | 部長, 課長, 係長, 主任, 一般 |
| department_role | 部署内役割 | text | - |
| skill_level | AIスキルレベル | select | 初級, 中級, 上級 |
| tags | タグ | text | - |

### 4.6 進捗管理・分析ダッシュボード

#### 研修生向け
- 自分の進捗状況表示
- チャプター完了率
- API利用量（自分のみ）

#### 管理者向け（MVP必須）
- 企業別進捗サマリー
- 研修生別詳細進捗
- API利用量レポート（日次/月次）
- チャット利用統計（質問傾向等）
- 研修完了率・離脱率分析

### 4.7 通知機能

#### リマインド通知（メール）
- 日次で未完了チャプターをリマインド
- 研修生側でON/OFF設定可能
- 管理者側で強制ON/OFF（ユーザー側変更不可）設定可能

#### 障害通知（管理者向け）
- メール
- Microsoft Teams

### 4.8 PDF出力

#### 出力対象
- カリキュラム内容（テキスト部分のみ）
- チャット画面は出力対象外

#### 用途
- 集合研修での印刷配布用

### 4.9 決済連携（Square）

#### 実装範囲（半自動連携）
- 管理画面からSquare請求書を発行
- 入金確認後、手動でアカウント有効化

---

## 5. データベース設計（Supabase）- 実装済み

### 5.1 組織階層テーブル

#### companies（企業）
```sql
- id: uuid (PK)
- name: text
- contract_start_date: date (nullable)
- contract_end_date: date (nullable)
- is_active: boolean (default: true)
- daily_token_limit: integer (default: 100000)
- notes: text (nullable)
- created_at: timestamptz
- updated_at: timestamptz
```

#### departments（部署）
```sql
- id: uuid (PK)
- company_id: uuid (FK -> companies.id)
- parent_department_id: uuid (FK -> departments.id, nullable) -- 階層構造
- name: text
- sort_order: integer (default: 0)
- is_active: boolean (default: true)
- created_at: timestamptz
- updated_at: timestamptz
```

#### groups（研修グループ）
```sql
- id: uuid (PK)
- name: text
- company_id: uuid (FK -> companies.id, nullable)
- department_id: uuid (FK -> departments.id, nullable)
- daily_token_limit: integer (default: 100000)
- start_date: date (nullable)
- end_date: date (nullable)
- review_period_days: integer (default: 14)
- is_active: boolean (default: true)
- created_at: timestamptz
- updated_at: timestamptz
```

### 5.2 ユーザーテーブル

#### profiles（ユーザープロファイル）
```sql
- id: uuid (PK, FK -> auth.users.id)
- email: text
- name: text
- role: enum ('super_admin', 'group_admin', 'trainee')
- company_id: uuid (FK -> companies.id, nullable)
- department_id: uuid (FK -> departments.id, nullable)
- group_id: uuid (FK -> groups.id, nullable)
- is_individual: boolean (default: false) -- 個人ユーザーフラグ
- start_date: date (nullable) -- 個人の契約開始日
- end_date: date (nullable) -- 個人の契約終了日
- review_period_days: integer (default: 14)
- notification_enabled: boolean (default: true)
- notification_forced: boolean (default: false)
- must_change_password: boolean (default: true)
- access_expires_at: timestamptz (nullable)
- created_at: timestamptz
- updated_at: timestamptz
```

#### user_attributes（ユーザー属性）
```sql
- id: uuid (PK)
- profile_id: uuid (FK -> profiles.id)
- attribute_key: text
- attribute_value: text
- created_at: timestamptz
- UNIQUE(profile_id, attribute_key)
```

#### attribute_definitions（属性定義マスタ）
```sql
- id: uuid (PK)
- key: text (UNIQUE)
- label: text
- attribute_type: text ('text', 'select', 'number', 'date')
- options: jsonb (nullable) -- selectの場合の選択肢
- sort_order: integer (default: 0)
- is_active: boolean (default: true)
- created_at: timestamptz
```

### 5.3 研修日テーブル

#### group_training_dates（グループ研修日）
```sql
- id: uuid (PK)
- group_id: uuid (FK -> groups.id)
- training_date: date
- description: text (nullable)
- created_at: timestamptz
```

#### individual_training_dates（個人研修日）
```sql
- id: uuid (PK)
- profile_id: uuid (FK -> profiles.id)
- training_date: date
- description: text (nullable)
- created_at: timestamptz
```

### 5.4 カリキュラムテーブル

#### curricula（カリキュラム）
```sql
- id: uuid (PK)
- name: text
- description: text (nullable)
- content_type: enum ('document', 'video', 'quiz', 'external')
- content_url: text (nullable)
- duration_minutes: integer (nullable)
- difficulty_level: enum ('beginner', 'intermediate', 'advanced')
- tags: text[] (nullable)
- sort_order: integer (default: 0)
- is_active: boolean (default: true)
- created_at: timestamptz
- updated_at: timestamptz
```

#### curriculum_assignments（カリキュラム割当）
```sql
- id: uuid (PK)
- curriculum_id: uuid (FK -> curricula.id)
- target_type: enum ('company', 'department', 'group', 'individual')
- target_id: uuid -- 対象のID
- due_date: date (nullable)
- is_required: boolean (default: true)
- assigned_by: uuid (FK -> profiles.id, nullable)
- assigned_at: timestamptz
- UNIQUE(curriculum_id, target_type, target_id)
```

#### curriculum_progress（カリキュラム進捗）
```sql
- id: uuid (PK)
- profile_id: uuid (FK -> profiles.id)
- curriculum_id: uuid (FK -> curricula.id)
- status: enum ('not_started', 'in_progress', 'completed')
- progress_percent: integer (default: 0)
- started_at: timestamptz (nullable)
- completed_at: timestamptz (nullable)
- score: integer (nullable)
- notes: text (nullable)
- updated_at: timestamptz
- UNIQUE(profile_id, curriculum_id)
```

### 5.5 チャット関連テーブル（未実装）

#### chat_sessions（チャットセッション）
```sql
- id: uuid (PK)
- user_id: uuid (FK -> profiles.id)
- chapter_id: uuid (FK -> chapters.id, nullable)
- model: text
- created_at: timestamptz
```

#### chat_messages（チャットメッセージ）
```sql
- id: uuid (PK)
- session_id: uuid (FK -> chat_sessions.id)
- role: enum ('user', 'assistant')
- content: text
- token_count: integer
- created_at: timestamptz
```

#### token_usage（トークン使用量）
```sql
- id: uuid (PK)
- user_id: uuid (FK -> profiles.id)
- group_id: uuid (FK -> groups.id)
- date: date
- input_tokens: integer
- output_tokens: integer
- model: text
- created_at: timestamptz
```

---

## 6. Netlify Functions（実装済み）

### 6.1 ユーザー管理Functions

| Function | メソッド | 用途 |
|----------|----------|------|
| `create-user` | POST | ユーザー作成（管理者のみ） |
| `delete-user` | DELETE | ユーザー削除（管理者のみ） |
| `reset-user-password` | POST | パスワードリセット（管理者のみ） |
| `send-invitation` | POST | 招待メール送信 |

### 6.2 スケジュールFunctions

| Function | スケジュール | 用途 |
|----------|-------------|------|
| `cleanup-expired` | 毎日 18:00 UTC (3:00 JST) | 期限切れユーザー・グループの自動削除 |

### 6.3 カリキュラムFunctions

| Function | メソッド | 用途 |
|----------|----------|------|
| `generate-curriculum-structure` | POST | 構成生成（Claude Opus 4.5使用）- 管理者のみ |
| `generate-curriculum-content` | POST | コンテンツ生成（Claude Sonnet 4.5使用）- 管理者のみ |
| `generate-curriculum` | POST | 一括生成（レガシー）- 管理者のみ |

---

## 7. 実装フェーズ計画

### Phase 1: 基盤構築（MVP）✅ 完了
- [x] Netlifyプロジェクトセットアップ
- [x] Supabase環境構築（DB、Auth）
- [x] 認証機能（ログイン、パスワード変更）
- [x] 管理画面基本UI
- [x] ユーザー管理（CSV一括登録・削除対応）
- [x] グループ管理（契約期間、研修日、復習期間）
- [x] ロール制御（super_admin / group_admin / trainee）
- [x] アクセス制御（期間ベース）
- [x] 自動削除機能（30日後）

### Phase 1.5: 組織階層拡張 ✅ 完了
- [x] 企業テーブル追加
- [x] 部署テーブル追加（階層構造対応）
- [x] ユーザー属性テーブル追加
- [x] 個人ユーザー対応
- [x] カリキュラムテーブル追加
- [x] 企業管理UI
- [x] 部署管理UI
- [x] ユーザー属性管理UI

### Phase 2: カリキュラム機能 ✅ 完了
- [x] カリキュラム自動生成（2段階AI生成）
  - 構成生成: Claude Opus 4.5（高精度プランニング）
  - コンテンツ生成: Claude Sonnet 4.5（コスト効率）
  - 管理者承認フロー（構成プレビュー → 承認 → コンテンツ生成）
- [x] カリキュラム編集UI（作成・編集・削除・検索・フィルター）
- [x] カリキュラム割当機能（企業/部署/グループ/個人）
- [x] チャプター管理UI（作成・編集・削除・並べ替え）
- [x] カリキュラム詳細ページ
- [ ] バージョン管理

### Phase 3: 受講者向け機能 ✅ 完了
- [x] 受講者ダッシュボード（統計・割当カリキュラム表示）
- [x] カリキュラム一覧ページ（フィルター・検索機能付き）
- [x] カリキュラム学習ページ（チャプター別学習）
- [x] 進捗管理機能（自動保存・完了ステータス管理）

### Phase 4: AIチャット機能
- [ ] チャットUI実装
- [ ] AI API連携（OpenAI, Anthropic, Google）
- [ ] 会話履歴保存
- [ ] トークン使用量計測・制限

### Phase 5: レポート・分析機能
- [ ] 管理者ダッシュボード強化
- [ ] 分析レポート
- [ ] 進捗レポートエクスポート

### Phase 6: 通知・連携機能
- [ ] メール通知（Resend）
- [ ] リマインド機能
- [ ] Teams通知
- [ ] Square連携
- [ ] PDF出力

### Phase 7: 最適化・拡張
- [ ] パフォーマンス最適化
- [ ] MFA実装準備
- [ ] IPアドレス制限準備
- [ ] スケーラビリティ対応

---

## 8. エラーハンドリング

### 8.1 API呼び出し
- 失敗時のリトライ処理（指数バックオフ）
- タイムアウト設定

### 8.2 トークン制限
- 制限到達時のユーザーへのわかりやすいメッセージ表示
- 残量表示

### 8.3 システム障害
- 管理者通知（メール & Teams）

---

## 9. セキュリティ要件

### 9.1 実装済み
- Supabase Auth による認証
- Row Level Security (RLS) による権限制御
- HTTPS通信
- APIキーの環境変数管理
- 最新のパスワードポリシー
- 初回ログイン時パスワード強制変更
- ロールベースアクセス制御

### 9.2 将来実装予定
- 二要素認証（MFA）
- IPアドレス制限

---

## 10. デザインシステム

### 10.1 基本方針
- DESIGN_SYSTEM.md（Assist Frontier標準）をベースに使用
- 研修用途に最適化したUI/UXを適用

### 10.2 カラーパレット
```css
--color-primary: #0088CC;       /* メインカラー（青） */
--color-primary-dark: #005A8C;  /* ホバー時 */
--color-primary-light: #E6F4FA; /* 背景用薄い青 */
--color-secondary: #00C4D4;     /* サブカラー（シアン） */
--color-accent: #FFB800;        /* 強調色（黄色/オレンジ） */
--color-text: #2C3E50;          /* 本文 */
--color-text-light: #64748B;    /* 補助テキスト */
```

### 10.3 フォント
```css
--font-sans: "M PLUS 1p", "Hiragino Sans", sans-serif;
```

---

## 11. 非機能要件

### 11.1 パフォーマンス
- ページロード: 3秒以内
- チャット応答開始: 2秒以内（ストリーミング）

### 11.2 可用性
- 99.5%以上の稼働率目標

### 11.3 スケーラビリティ
- 将来的に1,000名以上対応可能な設計

### 11.4 保守性
- TypeScript使用
- コンポーネント分割
- テストコード整備

---

## 12. 補足事項

### 12.1 制約条件
- ローカルへのデータ保存は一切不可
- Netlify上で完結できる構成を優先（Supabaseは例外として許容）

### 12.2 将来の拡張性
- SaaS化を見据えた設計
- Square課金連携の完全自動化
- 複数企業向けマルチテナント対応
- **個人向けサービス展開**

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026/01/07 | 初版作成 |
| 2026/01/08 | ロール制御（super_admin/group_admin/trainee）実装反映 |
| 2026/01/08 | グループ管理（契約期間、研修日、復習期間）実装反映 |
| 2026/01/08 | アクセス制御（期間ベース）実装反映 |
| 2026/01/08 | CSV機能強化（テンプレートDL、削除対応）実装反映 |
| 2026/01/08 | 自動削除機能（30日後）実装反映 |
| 2026/01/08 | 企業・部署・ユーザー属性・カリキュラムDB構造追加 |
| 2026/01/08 | 個人ユーザー対応追加 |
| 2026/01/08 | 企業管理UI・部署管理UI実装完了 |
| 2026/01/08 | カリキュラム管理UI実装（一覧・作成・編集・削除・検索・フィルター） |
| 2026/01/08 | カリキュラム自動生成機能実装（Claude Sonnet 4.5 API連携） |
| 2026/01/08 | カリキュラム割当機能実装（企業/部署/グループ/個人単位） |
| 2026/01/09 | ユーザー属性管理UI実装完了 |
| 2026/01/09 | チャプター管理UI実装（作成・編集・削除・並べ替え） |
| 2026/01/09 | カリキュラム詳細ページ実装 |
| 2026/01/09 | 受講者向け機能実装（ダッシュボード、カリキュラム一覧、学習ページ、進捗管理） |
| 2026/01/09 | カリキュラム自動生成を2段階AI生成に改修（Opus 4.5で構成→承認→Sonnet 4.5でコンテンツ） |
| 2026/01/09 | Netlify Functions追加（generate-curriculum-structure, generate-curriculum-content） |
| 2026/01/09 | セキュリティ改善（環境変数チェック強化、エラー詳細の非公開化） |
