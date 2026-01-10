-- ============================================
-- Phase 4 Chat Tables: RLS有効化とポリシー設定
-- ============================================
-- 対象テーブル:
--   - ai_models
--   - chat_sessions
--   - chat_messages
--   - token_usage
--   - escalation_configs
--   - escalation_logs

-- ============================================
-- RLSを有効化
-- ============================================
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ai_models ポリシー
-- ============================================
-- 認証済みユーザーはアクティブなモデルを参照可能
CREATE POLICY "Authenticated users can view active ai models"
  ON ai_models FOR SELECT
  TO authenticated
  USING (is_active = true);

-- super_adminは全モデルを管理可能
CREATE POLICY "Super admin can manage all ai models"
  ON ai_models FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ============================================
-- chat_sessions ポリシー
-- ============================================
-- ユーザーは自分のセッションを参照可能
CREATE POLICY "Users can view own chat sessions"
  ON chat_sessions FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- super_adminは全セッションを参照可能
CREATE POLICY "Super admin can view all chat sessions"
  ON chat_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- group_adminは自グループのセッションを参照可能
CREATE POLICY "Group admin can view group chat sessions"
  ON chat_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles admin_profile
      JOIN profiles session_profile ON session_profile.id = chat_sessions.profile_id
      WHERE admin_profile.id = auth.uid()
        AND admin_profile.role = 'group_admin'
        AND admin_profile.group_id = session_profile.group_id
    )
  );

-- 認証済みユーザーは自分のセッションを作成可能
CREATE POLICY "Users can create own chat sessions"
  ON chat_sessions FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- ユーザーは自分のセッションを更新可能
CREATE POLICY "Users can update own chat sessions"
  ON chat_sessions FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- super_adminは全セッションを更新可能
CREATE POLICY "Super admin can update all chat sessions"
  ON chat_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- super_adminは全セッションを削除可能
CREATE POLICY "Super admin can delete chat sessions"
  ON chat_sessions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ============================================
-- chat_messages ポリシー
-- ============================================
-- ユーザーは自分のセッションのメッセージを参照可能
CREATE POLICY "Users can view own session messages"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions cs
      WHERE cs.id = chat_messages.session_id
        AND cs.profile_id = auth.uid()
    )
  );

-- super_adminは全メッセージを参照可能
CREATE POLICY "Super admin can view all chat messages"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- group_adminは自グループのメッセージを参照可能
CREATE POLICY "Group admin can view group chat messages"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles admin_profile
      JOIN chat_sessions cs ON cs.id = chat_messages.session_id
      JOIN profiles session_profile ON session_profile.id = cs.profile_id
      WHERE admin_profile.id = auth.uid()
        AND admin_profile.role = 'group_admin'
        AND admin_profile.group_id = session_profile.group_id
    )
  );

-- 認証済みユーザーは自分のセッションにメッセージを追加可能
CREATE POLICY "Users can insert messages to own sessions"
  ON chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions cs
      WHERE cs.id = chat_messages.session_id
        AND cs.profile_id = auth.uid()
    )
  );

-- super_adminは全メッセージを削除可能
CREATE POLICY "Super admin can delete chat messages"
  ON chat_messages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ============================================
-- token_usage ポリシー
-- ============================================
-- ユーザーは自分の使用量を参照可能
CREATE POLICY "Users can view own token usage"
  ON token_usage FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- super_adminは全使用量を参照可能
CREATE POLICY "Super admin can view all token usage"
  ON token_usage FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- group_adminは自グループの使用量を参照可能
CREATE POLICY "Group admin can view group token usage"
  ON token_usage FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles admin_profile
      WHERE admin_profile.id = auth.uid()
        AND admin_profile.role = 'group_admin'
        AND admin_profile.group_id = token_usage.group_id
    )
  );

-- token_usageへの挿入はservice_role経由（Netlify Functions）で行う
-- 認証済みユーザーは自分の使用量レコードのみ挿入可能（バックアップ用）
CREATE POLICY "Users can insert own token usage"
  ON token_usage FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- super_adminは全使用量を管理可能
CREATE POLICY "Super admin can manage all token usage"
  ON token_usage FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ============================================
-- escalation_configs ポリシー
-- ============================================
-- super_adminは全設定を管理可能
CREATE POLICY "Super admin can manage escalation configs"
  ON escalation_configs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- group_adminは自グループの設定を参照可能
CREATE POLICY "Group admin can view group escalation configs"
  ON escalation_configs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'group_admin'
        AND (
          escalation_configs.group_id = p.group_id
          OR (escalation_configs.company_id = p.company_id AND escalation_configs.group_id IS NULL)
        )
    )
  );

-- ============================================
-- escalation_logs ポリシー
-- ============================================
-- super_adminは全ログを管理可能
CREATE POLICY "Super admin can manage escalation logs"
  ON escalation_logs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ユーザーは自分のエスカレーションログを参照可能
CREATE POLICY "Users can view own escalation logs"
  ON escalation_logs FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- group_adminは自グループのエスカレーションログを参照可能
CREATE POLICY "Group admin can view group escalation logs"
  ON escalation_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles admin_profile
      JOIN profiles log_profile ON log_profile.id = escalation_logs.profile_id
      WHERE admin_profile.id = auth.uid()
        AND admin_profile.role = 'group_admin'
        AND admin_profile.group_id = log_profile.group_id
    )
  );

-- escalation_logsへの挿入はservice_role経由（Netlify Functions）で行う
-- 認証済みユーザーは自分のログのみ挿入可能（バックアップ用）
CREATE POLICY "Users can insert own escalation logs"
  ON escalation_logs FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());
