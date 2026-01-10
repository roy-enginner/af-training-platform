-- ============================================
-- Migration: 004_chat_feedback_tables.sql
-- Phase 4: AIチャット・フィードバック・エスカレーション機能
-- ============================================

-- ============================================
-- AIモデル管理テーブル
-- ============================================
CREATE TABLE IF NOT EXISTS ai_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google')),
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  input_token_cost DECIMAL(10, 6),  -- コスト（USD per 1K tokens）
  output_token_cost DECIMAL(10, 6),
  max_context_tokens INTEGER NOT NULL DEFAULT 128000,
  supports_streaming BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, model_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider);
CREATE INDEX IF NOT EXISTS idx_ai_models_active ON ai_models(is_active);

-- ============================================
-- チャットセッションテーブル
-- ============================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL DEFAULT 'learning' CHECK (session_type IN ('learning', 'qa', 'general')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'escalated')),
  curriculum_id UUID REFERENCES curricula(id) ON DELETE SET NULL,
  chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  ai_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  system_prompt TEXT,
  title TEXT,
  metadata JSONB DEFAULT '{}',
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_chat_sessions_profile_id ON chat_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_curriculum_id ON chat_sessions(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_started_at ON chat_sessions(started_at);

-- ============================================
-- チャットメッセージテーブル
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- ============================================
-- トークン使用量テーブル
-- ============================================
CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  ai_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost DECIMAL(10, 6),
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_token_usage_profile_id ON token_usage(profile_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_group_id ON token_usage(group_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_company_id ON token_usage(company_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_usage_date ON token_usage(usage_date);
CREATE INDEX IF NOT EXISTS idx_token_usage_session_id ON token_usage(session_id);

-- ============================================
-- エスカレーション設定テーブル
-- ============================================
CREATE TABLE IF NOT EXISTS escalation_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  channels TEXT[] NOT NULL DEFAULT '{}', -- 'email', 'teams', 'slack'
  email_recipients TEXT[],
  email_cc TEXT[],
  teams_webhook_url TEXT,
  teams_channel_name TEXT,
  slack_webhook_url TEXT,
  slack_channel TEXT,
  triggers TEXT[] NOT NULL DEFAULT '{}', -- 'system_error', 'bug_report', 'urgent', 'manual', 'sentiment'
  trigger_keywords JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_escalation_configs_company_id ON escalation_configs(company_id);
CREATE INDEX IF NOT EXISTS idx_escalation_configs_group_id ON escalation_configs(group_id);
CREATE INDEX IF NOT EXISTS idx_escalation_configs_active ON escalation_configs(is_active);

-- ============================================
-- エスカレーション履歴テーブル
-- ============================================
CREATE TABLE IF NOT EXISTS escalation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_id UUID REFERENCES escalation_configs(id) ON DELETE SET NULL,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('system_error', 'bug_report', 'urgent', 'manual', 'sentiment')),
  trigger_details JSONB DEFAULT '{}',
  channels_notified TEXT[],
  notification_results JSONB DEFAULT '{}',
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_escalation_logs_config_id ON escalation_logs(config_id);
CREATE INDEX IF NOT EXISTS idx_escalation_logs_session_id ON escalation_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_escalation_logs_profile_id ON escalation_logs(profile_id);
CREATE INDEX IF NOT EXISTS idx_escalation_logs_is_resolved ON escalation_logs(is_resolved);
CREATE INDEX IF NOT EXISTS idx_escalation_logs_created_at ON escalation_logs(created_at);

-- ============================================
-- カリキュラムフィードバックテーブル
-- ============================================
CREATE TABLE IF NOT EXISTS curriculum_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  curriculum_id UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('helpful', 'unclear', 'too_easy', 'too_hard', 'error', 'suggestion')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- AI改善サジェスト（Phase 4追加）
  ai_suggestion TEXT,
  ai_suggestion_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_curriculum_feedback_curriculum_id ON curriculum_feedback(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_feedback_chapter_id ON curriculum_feedback(chapter_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_feedback_profile_id ON curriculum_feedback(profile_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_feedback_is_resolved ON curriculum_feedback(is_resolved);
CREATE INDEX IF NOT EXISTS idx_curriculum_feedback_feedback_type ON curriculum_feedback(feedback_type);

-- ============================================
-- updated_at トリガー
-- ============================================
DROP TRIGGER IF EXISTS update_ai_models_updated_at ON ai_models;
CREATE TRIGGER update_ai_models_updated_at
  BEFORE UPDATE ON ai_models
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_escalation_configs_updated_at ON escalation_configs;
CREATE TRIGGER update_escalation_configs_updated_at
  BEFORE UPDATE ON escalation_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- UNIQUE制約を追加（既存テーブル対応）
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_models_provider_model_id_key'
  ) THEN
    ALTER TABLE ai_models ADD CONSTRAINT ai_models_provider_model_id_key UNIQUE (provider, model_id);
  END IF;
END $$;

-- ============================================
-- 初期AIモデルデータ
-- ============================================
INSERT INTO ai_models (provider, model_id, display_name, input_token_cost, output_token_cost, max_context_tokens, supports_streaming) VALUES
  ('anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 0.003, 0.015, 200000, true),
  ('anthropic', 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 0.0008, 0.004, 200000, true),
  ('openai', 'gpt-4o', 'GPT-4o', 0.0025, 0.01, 128000, true),
  ('openai', 'gpt-4o-mini', 'GPT-4o mini', 0.00015, 0.0006, 128000, true),
  ('google', 'gemini-2.0-flash', 'Gemini 2.0 Flash', 0.0001, 0.0004, 1000000, true)
ON CONFLICT (provider, model_id) DO NOTHING;

-- ============================================
-- カリキュラムフィードバック RLSポリシー
-- ============================================
ALTER TABLE curriculum_feedback ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを削除してから作成
DROP POLICY IF EXISTS "Super admin can manage all curriculum feedback" ON curriculum_feedback;
CREATE POLICY "Super admin can manage all curriculum feedback"
  ON curriculum_feedback FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Users can view own curriculum feedback" ON curriculum_feedback;
CREATE POLICY "Users can view own curriculum feedback"
  ON curriculum_feedback FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own curriculum feedback" ON curriculum_feedback;
CREATE POLICY "Users can create own curriculum feedback"
  ON curriculum_feedback FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Group admin can view group curriculum feedback" ON curriculum_feedback;
CREATE POLICY "Group admin can view group curriculum feedback"
  ON curriculum_feedback FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles admin_profile
      JOIN profiles feedback_profile ON feedback_profile.id = curriculum_feedback.profile_id
      WHERE admin_profile.id = auth.uid()
        AND admin_profile.role = 'group_admin'
        AND admin_profile.group_id = feedback_profile.group_id
    )
  );
