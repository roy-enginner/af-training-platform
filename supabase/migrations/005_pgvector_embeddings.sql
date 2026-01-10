-- ============================================
-- Migration: 005_pgvector_embeddings.sql
-- RAG (Retrieval-Augmented Generation) 用ベクトル検索
-- ============================================

-- pgvector拡張を有効化
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- ナレッジベース（FAQ・ドキュメント）
-- ============================================
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ナレッジカテゴリ
COMMENT ON COLUMN knowledge_base.category IS 'general, faq, platform_usage, ai_basics, troubleshooting';

-- ============================================
-- 埋め込みベクトルテーブル
-- ============================================
CREATE TABLE content_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- 参照元を柔軟に（ナレッジベース、チャプター、カリキュラム等）
  source_type TEXT NOT NULL, -- 'knowledge_base', 'chapter', 'curriculum'
  source_id UUID NOT NULL,
  content_chunk TEXT NOT NULL, -- チャンク分割されたテキスト
  chunk_index INTEGER NOT NULL DEFAULT 0,
  -- OpenAI text-embedding-3-small は 1536次元
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ベクトル検索用インデックス（IVFFlat - 中規模データ向け）
CREATE INDEX idx_content_embeddings_vector ON content_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 参照元検索用インデックス
CREATE INDEX idx_content_embeddings_source ON content_embeddings(source_type, source_id);

-- ============================================
-- ベクトル類似検索関数
-- ============================================
CREATE OR REPLACE FUNCTION search_similar_content(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  filter_source_type TEXT DEFAULT NULL,
  filter_company_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_id UUID,
  content_chunk TEXT,
  chunk_index INTEGER,
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.source_type,
    ce.source_id,
    ce.content_chunk,
    ce.chunk_index,
    1 - (ce.embedding <=> query_embedding) as similarity,
    ce.metadata
  FROM content_embeddings ce
  LEFT JOIN knowledge_base kb ON ce.source_type = 'knowledge_base' AND ce.source_id = kb.id
  WHERE
    1 - (ce.embedding <=> query_embedding) > match_threshold
    AND (filter_source_type IS NULL OR ce.source_type = filter_source_type)
    AND (filter_company_id IS NULL OR kb.company_id = filter_company_id OR kb.company_id IS NULL)
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- RLS (Row Level Security)
-- ============================================
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_embeddings ENABLE ROW LEVEL SECURITY;

-- ナレッジベース: 全員が参照可能、super_adminのみ編集
CREATE POLICY knowledge_base_select ON knowledge_base
  FOR SELECT USING (is_active = true);

CREATE POLICY knowledge_base_all_super_admin ON knowledge_base
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- 埋め込みベクトル: 全員が参照可能（検索用）
CREATE POLICY content_embeddings_select ON content_embeddings
  FOR SELECT USING (true);

CREATE POLICY content_embeddings_all_super_admin ON content_embeddings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- ============================================
-- 初期FAQデータ
-- ============================================
INSERT INTO knowledge_base (category, title, content) VALUES
('platform_usage', 'ログイン方法', 'メールアドレスとパスワードを入力してログインしてください。パスワードを忘れた場合は「パスワードを忘れた方」リンクからリセットできます。'),
('platform_usage', 'カリキュラムの進め方', 'ダッシュボードから割り当てられたカリキュラムを選択し、チャプターを順番に学習してください。各チャプターには学習内容と課題があります。'),
('platform_usage', '進捗の確認方法', 'ダッシュボードで全体の進捗率を確認できます。カリキュラム詳細画面では各チャプターの完了状況も確認できます。'),
('ai_basics', 'ChatGPTとは', 'ChatGPTはOpenAIが開発した大規模言語モデルです。自然な会話形式で質問に回答したり、文章作成を支援したりできます。'),
('ai_basics', 'Claudeとは', 'ClaudeはAnthropic社が開発したAIアシスタントです。安全性と有用性のバランスを重視して設計されています。'),
('ai_basics', 'Geminiとは', 'GeminiはGoogleが開発したマルチモーダルAIです。テキスト、画像、コードなど複数の形式のデータを理解できます。'),
('ai_basics', 'プロンプトとは', 'プロンプトとはAIに与える指示や質問のことです。具体的で明確なプロンプトを書くことで、より適切な回答を得られます。'),
('troubleshooting', '画面が表示されない場合', 'ブラウザのキャッシュをクリアし、ページを再読み込みしてください。それでも解決しない場合は管理者にお問い合わせください。'),
('troubleshooting', 'チャットが動かない場合', 'インターネット接続を確認し、ページを再読み込みしてください。問題が続く場合は管理者にご連絡ください。'),
('faq', 'AIチャットの使い方', '学習画面右側のチャットパネルから質問できます。カリキュラムの内容に関する質問や、AIの使い方について相談できます。'),
('faq', '研修期間について', '研修期間はグループごとに設定されています。管理者から案内された期間内に学習を完了してください。'),
('faq', '複数デバイスでの利用', '同じアカウントで複数のデバイスからログインできます。学習の進捗は自動的に同期されます。');

-- updated_at自動更新トリガー
CREATE TRIGGER update_knowledge_base_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
