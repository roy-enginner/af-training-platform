-- カリキュラム生成ジョブテーブル
-- Background Functionsで非同期処理するためのジョブ管理テーブル

-- ジョブステータスのenum型
CREATE TYPE curriculum_job_status AS ENUM (
  'queued',           -- キューに追加された
  'connecting',       -- AIに接続中
  'generating',       -- 生成中
  'parsing',          -- 結果解析中
  'completed',        -- 完了
  'failed'            -- 失敗
);

-- ジョブタイプのenum型
CREATE TYPE curriculum_job_type AS ENUM (
  'structure',        -- 構成生成
  'content'           -- コンテンツ生成
);

-- カリキュラム生成ジョブテーブル
CREATE TABLE curriculum_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ジョブ情報
  job_type curriculum_job_type NOT NULL,
  status curriculum_job_status NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step TEXT,

  -- 入力パラメータ（JSON）
  input_params JSONB NOT NULL,

  -- 結果（完了時）
  result JSONB,

  -- エラー情報（失敗時）
  error_message TEXT,

  -- トークン使用量
  tokens_used INTEGER,
  model_used TEXT,

  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- インデックス
CREATE INDEX idx_curriculum_jobs_user_id ON curriculum_generation_jobs(user_id);
CREATE INDEX idx_curriculum_jobs_status ON curriculum_generation_jobs(status);
CREATE INDEX idx_curriculum_jobs_created_at ON curriculum_generation_jobs(created_at DESC);

-- RLS有効化
ALTER TABLE curriculum_generation_jobs ENABLE ROW LEVEL SECURITY;

-- ポリシー: ユーザーは自分のジョブのみ参照可能
CREATE POLICY "Users can view own jobs"
  ON curriculum_generation_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- ポリシー: ユーザーは自分のジョブを作成可能
CREATE POLICY "Users can create own jobs"
  ON curriculum_generation_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ポリシー: service_roleのみ更新可能（Background Functionから更新）
-- 注: service_roleはRLSをバイパスするため明示的なポリシーは不要

-- updated_atを自動更新するトリガー
CREATE OR REPLACE FUNCTION update_curriculum_job_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_curriculum_job_updated_at
  BEFORE UPDATE ON curriculum_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_curriculum_job_updated_at();

-- Realtime用にテーブルをpublicationに追加
ALTER PUBLICATION supabase_realtime ADD TABLE curriculum_generation_jobs;

-- コメント
COMMENT ON TABLE curriculum_generation_jobs IS 'カリキュラム生成の非同期ジョブ管理テーブル';
COMMENT ON COLUMN curriculum_generation_jobs.job_type IS 'structure: 構成生成, content: コンテンツ生成';
COMMENT ON COLUMN curriculum_generation_jobs.progress IS '進捗率（0-100）';
COMMENT ON COLUMN curriculum_generation_jobs.current_step IS '現在のステップの説明テキスト';
COMMENT ON COLUMN curriculum_generation_jobs.input_params IS '生成に使用するパラメータ（goal, targetAudience等）';
COMMENT ON COLUMN curriculum_generation_jobs.result IS '生成結果のJSON';
