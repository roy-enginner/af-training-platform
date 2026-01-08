# AI研修プラットフォーム要件定義書

**プロジェクト名**: af-training-platform  
**ドメイン**: assist-frontier.site  
**作成日**: 2026/01/07  
**ステータス**: 要件確定

---

## 1. プロジェクト概要

### 1.1 目的
Assist FrontierのAI研修サービス用プラットフォーム。企業向けにAI活用研修を提供し、研修生がハンズオン形式で主要GAI（ChatGPT, Gemini, Claude）を体験できる環境を構築する。

### 1.2 主要機能
- 管理者によるカリキュラム自動生成（Claude API使用）
- 研修生向けチャットUI（複数AIモデル対応）
- 進捗管理・分析ダッシュボード
- API利用量制限（日次トークン数ベース）
- カリキュラムPDF出力

### 1.3 想定規模（ローンチ時）
| 項目 | 数値 |
|------|------|
| 企業グループ数 | 約5社 |
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
| ホスティング | Netlify | Functions対応 |
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

---

## 3. ユーザー権限・階層構造

### 3.1 ユーザー階層
```
管理者（Assist Frontier）
├── 企業グループA
│   ├── 研修生1
│   ├── 研修生2
│   └── 研修生3
├── 企業グループB
│   └── ...
└── 企業グループC
    └── ...
```

### 3.2 権限マトリクス
| 機能 | 管理者 | 研修生 |
|------|--------|--------|
| ユーザー管理（CRUD） | ✅ | ❌ |
| 企業グループ管理 | ✅ | ❌ |
| カリキュラム作成・編集 | ✅ | ❌ |
| カリキュラム閲覧 | ✅（全て） | ✅（割当分のみ） |
| チャット利用 | ✅ | ✅（割当枠内） |
| API利用状況確認 | ✅（全体） | ✅（自分のみ） |
| 進捗管理 | ✅（全体） | ✅（自分のみ） |
| PDF出力 | ✅ | ✅（割当カリキュラム） |

---

## 4. 機能詳細

### 4.1 認証・ユーザー管理

#### 登録フロー
1. 管理者がCSV（グループ名、ユーザー名、メールアドレス）をアップロード
2. システムが自動で初期パスワード（ランダム生成）を発行
3. 招待メールを各研修生に送信
4. 研修生がログイン後、パスワードを変更

#### パスワードポリシー（NIST SP 800-63B準拠）
- 最小12文字以上
- 漏洩パスワードリストとの照合
- 連続した文字・数字の禁止
- ユーザー情報との類似禁止

#### 将来実装予定（現段階では不要）
- 二要素認証（MFA）
- IPアドレス制限

### 4.2 カリキュラム管理

#### 自動生成フロー
1. 管理者が「研修ゴール」を入力（例：自分専用のAIエージェントを作る）
2. Claude APIでチャプター構成・学習コンテンツを自動生成
3. 管理者がプレビュー確認
4. 必要に応じて手動編集（追加/削除/並び替え/内容修正）
5. 公開

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

#### チャプター完了条件
- コンテンツ閲覧完了
- 課題終了チェックボックスにチェック
- ※実際の成果は問わない（自己申告制）

#### バージョン管理
- 受講開始時点のバージョンで固定
- 新規受講者は最新バージョンを使用

#### 割当単位
- 企業グループ単位での一括割当
- 研修生個別での割当
- 両方に対応

### 4.3 チャット機能

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
- 企業グループごとの日次トークン数制限
- 制限到達時のユーザーへの表示メッセージ

### 4.4 進捗管理・分析ダッシュボード

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

### 4.5 通知機能

#### リマインド通知（メール）
- 日次で未完了チャプターをリマインド
- 研修生側でON/OFF設定可能
- 管理者側で強制ON/OFF（ユーザー側変更不可）設定可能

#### 障害通知（管理者向け）
- メール
- Microsoft Teams

### 4.6 PDF出力

#### 出力対象
- カリキュラム内容（テキスト部分のみ）
- チャット画面は出力対象外

#### 用途
- 集合研修での印刷配布用

### 4.7 決済連携（Square）

#### 実装範囲（半自動連携）
- 管理画面からSquare請求書を発行
- 入金確認後、手動でアカウント有効化

---

## 5. アクセス期限・データ管理

### 5.1 研修期間設定
- 管理者が企業/研修生ごとに設定可能

### 5.2 アクセス期限
- 研修終了後14日間アクセス可能（日数はカスタマイズ可能）
- 期限切れ後はデータ削除

---

## 6. エラーハンドリング

### 6.1 API呼び出し
- 失敗時のリトライ処理（指数バックオフ）
- タイムアウト設定

### 6.2 トークン制限
- 制限到達時のユーザーへのわかりやすいメッセージ表示
- 残量表示

### 6.3 システム障害
- 管理者通知（メール & Teams）

---

## 7. セキュリティ要件

### 7.1 現段階で実装
- Supabase Auth による認証
- Row Level Security (RLS) による権限制御
- HTTPS通信
- APIキーの環境変数管理
- 最新のパスワードポリシー

### 7.2 将来実装可能な設計
- 二要素認証（MFA）
- IPアドレス制限

---

## 8. デザインシステム

### 8.1 基本方針
- DESIGN_SYSTEM.md（Assist Frontier標準）をベースに使用
- 研修用途に最適化したUI/UXを適用

### 8.2 カラーパレット
```css
--color-primary: #0088CC;       /* メインカラー（青） */
--color-primary-dark: #005A8C;  /* ホバー時 */
--color-primary-light: #E6F4FA; /* 背景用薄い青 */
--color-secondary: #00C4D4;     /* サブカラー（シアン） */
--color-accent: #FFB800;        /* 強調色（黄色/オレンジ） */
--color-text: #2C3E50;          /* 本文 */
--color-text-light: #64748B;    /* 補助テキスト */
```

### 8.3 フォント
```css
--font-sans: "M PLUS 1p", "Hiragino Sans", sans-serif;
```

---

## 9. データベース設計（Supabase）

### 9.1 主要テーブル

#### users
```sql
- id: uuid (PK)
- email: text (UNIQUE)
- name: text
- role: enum ('admin', 'trainee')
- group_id: uuid (FK -> groups.id, nullable)
- created_at: timestamp
- updated_at: timestamp
- access_expires_at: timestamp (nullable)
- notification_enabled: boolean
- notification_forced: boolean
```

#### groups（企業グループ）
```sql
- id: uuid (PK)
- name: text
- daily_token_limit: integer
- created_at: timestamp
- updated_at: timestamp
```

#### curricula（カリキュラム）
```sql
- id: uuid (PK)
- title: text
- goal: text
- version: integer
- status: enum ('draft', 'published', 'archived')
- created_by: uuid (FK -> users.id)
- created_at: timestamp
- updated_at: timestamp
```

#### chapters（チャプター）
```sql
- id: uuid (PK)
- curriculum_id: uuid (FK -> curricula.id)
- order_index: integer
- title: text
- content: text (学習コンテンツ)
- task_description: text (ハンズオン課題)
- estimated_minutes: integer (default: 5)
- created_at: timestamp
- updated_at: timestamp
```

#### curriculum_assignments（カリキュラム割当）
```sql
- id: uuid (PK)
- curriculum_id: uuid (FK -> curricula.id)
- curriculum_version: integer
- assignee_type: enum ('group', 'user')
- assignee_id: uuid
- assigned_at: timestamp
- expires_at: timestamp
```

#### progress（進捗）
```sql
- id: uuid (PK)
- user_id: uuid (FK -> users.id)
- chapter_id: uuid (FK -> chapters.id)
- completed: boolean
- completed_at: timestamp (nullable)
- created_at: timestamp
```

#### chat_sessions（チャットセッション）
```sql
- id: uuid (PK)
- user_id: uuid (FK -> users.id)
- chapter_id: uuid (FK -> chapters.id, nullable)
- model: text
- created_at: timestamp
```

#### chat_messages（チャットメッセージ）
```sql
- id: uuid (PK)
- session_id: uuid (FK -> chat_sessions.id)
- role: enum ('user', 'assistant')
- content: text
- token_count: integer
- created_at: timestamp
```

#### token_usage（トークン使用量）
```sql
- id: uuid (PK)
- user_id: uuid (FK -> users.id)
- group_id: uuid (FK -> groups.id)
- date: date
- input_tokens: integer
- output_tokens: integer
- model: text
- created_at: timestamp
```

#### api_settings（API設定）
```sql
- id: uuid (PK)
- provider: enum ('openai', 'anthropic', 'google')
- api_key_encrypted: text
- enabled: boolean
- created_at: timestamp
- updated_at: timestamp
```

---

## 10. 実装フェーズ計画

### Phase 1: 基盤構築（MVP）
- [ ] Netlifyプロジェクトセットアップ
- [ ] Supabase環境構築（DB、Auth）
- [ ] 認証機能（ログイン、パスワード変更）
- [ ] 管理画面基本UI
- [ ] ユーザー管理（CSV一括登録）

### Phase 2: カリキュラム機能
- [ ] カリキュラム自動生成（Claude API連携）
- [ ] カリキュラム編集UI
- [ ] チャプター管理
- [ ] カリキュラム割当機能
- [ ] バージョン管理

### Phase 3: チャット機能
- [ ] チャットUI実装
- [ ] AI API連携（OpenAI, Anthropic, Google）
- [ ] 会話履歴保存
- [ ] トークン使用量計測・制限

### Phase 4: 進捗管理・分析
- [ ] 進捗トラッキング
- [ ] 管理者ダッシュボード
- [ ] 分析レポート

### Phase 5: 通知・連携機能
- [ ] メール通知（Resend）
- [ ] リマインド機能
- [ ] Teams通知
- [ ] Square連携
- [ ] PDF出力

### Phase 6: 最適化・拡張
- [ ] パフォーマンス最適化
- [ ] MFA実装準備
- [ ] IPアドレス制限準備
- [ ] スケーラビリティ対応

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

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026/01/07 | 初版作成 |
