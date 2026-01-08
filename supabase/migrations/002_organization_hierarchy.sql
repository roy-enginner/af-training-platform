-- ============================================
-- Phase 1.5: Organization Hierarchy Extension
-- ============================================

-- Create companies table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  contract_start_date DATE,
  contract_end_date DATE,
  is_active BOOLEAN DEFAULT true,
  daily_token_limit INTEGER NOT NULL DEFAULT 100000,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create departments table
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

-- Update groups table to add new columns
ALTER TABLE groups
  ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN start_date DATE,
  ADD COLUMN end_date DATE,
  ADD COLUMN review_period_days INTEGER DEFAULT 7,
  ADD COLUMN is_active BOOLEAN DEFAULT true;

-- Drop unique constraint on name (allow same name in different companies)
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_name_key;
ALTER TABLE groups ADD CONSTRAINT groups_company_name_unique UNIQUE(company_id, name);

-- Update profiles table to add new columns
ALTER TABLE profiles
  ADD COLUMN email TEXT,
  ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN is_individual BOOLEAN DEFAULT false,
  ADD COLUMN start_date DATE,
  ADD COLUMN end_date DATE,
  ADD COLUMN review_period_days INTEGER DEFAULT 7,
  ADD COLUMN must_change_password BOOLEAN DEFAULT true;

-- Update role check constraint for new role types
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'group_admin', 'trainee'));

-- Migrate existing 'admin' role to 'super_admin'
UPDATE profiles SET role = 'super_admin' WHERE role = 'admin';

-- Create group_training_dates table
CREATE TABLE group_training_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  training_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, training_date)
);

-- Create individual_training_dates table
CREATE TABLE individual_training_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  training_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, training_date)
);

-- Create attribute_definitions table
CREATE TABLE attribute_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  attribute_type TEXT NOT NULL CHECK (attribute_type IN ('text', 'select', 'number', 'date')),
  options JSONB,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_attributes table
CREATE TABLE user_attributes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attribute_key TEXT NOT NULL REFERENCES attribute_definitions(key) ON DELETE CASCADE,
  attribute_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, attribute_key)
);

-- Create indexes
CREATE INDEX idx_departments_company_id ON departments(company_id);
CREATE INDEX idx_departments_parent_id ON departments(parent_department_id);
CREATE INDEX idx_groups_company_id ON groups(company_id);
CREATE INDEX idx_groups_department_id ON groups(department_id);
CREATE INDEX idx_profiles_company_id ON profiles(company_id);
CREATE INDEX idx_profiles_department_id ON profiles(department_id);
CREATE INDEX idx_group_training_dates_group_id ON group_training_dates(group_id);
CREATE INDEX idx_individual_training_dates_profile_id ON individual_training_dates(profile_id);
CREATE INDEX idx_user_attributes_profile_id ON user_attributes(profile_id);

-- Apply updated_at triggers
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on new tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_training_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE individual_training_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_attributes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for Companies
-- ============================================
CREATE POLICY "Super admin can manage companies"
  ON companies FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

CREATE POLICY "Users can view their own company"
  ON companies FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================
-- RLS Policies for Departments
-- ============================================
CREATE POLICY "Super admin can manage departments"
  ON departments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

CREATE POLICY "Users can view their own company departments"
  ON departments FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================
-- RLS Policies for Group Training Dates
-- ============================================
CREATE POLICY "Super admin can manage group training dates"
  ON group_training_dates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

CREATE POLICY "Group admin can manage own group training dates"
  ON group_training_dates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'group_admin' AND p.group_id = group_id
    )
  );

CREATE POLICY "Trainees can view their group training dates"
  ON group_training_dates FOR SELECT
  TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================
-- RLS Policies for Individual Training Dates
-- ============================================
CREATE POLICY "Super admin can manage individual training dates"
  ON individual_training_dates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

CREATE POLICY "Users can manage their own training dates"
  ON individual_training_dates FOR ALL
  TO authenticated
  USING (profile_id = auth.uid());

-- ============================================
-- RLS Policies for Attribute Definitions
-- ============================================
CREATE POLICY "Super admin can manage attribute definitions"
  ON attribute_definitions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

CREATE POLICY "All authenticated users can view active attribute definitions"
  ON attribute_definitions FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ============================================
-- RLS Policies for User Attributes
-- ============================================
CREATE POLICY "Super admin can manage all user attributes"
  ON user_attributes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

CREATE POLICY "Users can view their own attributes"
  ON user_attributes FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- ============================================
-- Update handle_new_user function
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'trainee')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
