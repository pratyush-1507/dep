-- HealthScan Database Schema
-- No RLS policies — will be added separately

-- =============================================
-- 1. Profiles (extends Supabase auth.users)
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  age INTEGER,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  height_cm NUMERIC(5,1),
  weight_kg NUMERIC(5,1),
  bmi NUMERIC(4,1),
  bmi_category TEXT CHECK (bmi_category IN ('underweight', 'normal', 'overweight', 'obese')),
  activity_level TEXT CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 2. Health Conditions
-- =============================================
CREATE TABLE IF NOT EXISTS health_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  condition_name TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe')) DEFAULT 'moderate',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_health_conditions_user ON health_conditions(user_id);

-- =============================================
-- 3. Allergies & Intolerances
-- =============================================
CREATE TABLE IF NOT EXISTS allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  allergen TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe')) DEFAULT 'moderate',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_allergies_user ON allergies(user_id);

-- =============================================
-- 4. Dietary Preferences
-- =============================================
CREATE TABLE IF NOT EXISTS dietary_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  preference TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dietary_prefs_user ON dietary_preferences(user_id);

-- =============================================
-- 5. Personalized Nutrient Limits
-- =============================================
CREATE TABLE IF NOT EXISTS nutrient_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nutrient TEXT NOT NULL,
  max_daily_value NUMERIC(10,2),
  unit TEXT DEFAULT 'g',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, nutrient)
);

CREATE INDEX idx_nutrient_limits_user ON nutrient_limits(user_id);

-- =============================================
-- 6. Products (verified / promoted)
-- =============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  ingredients TEXT[], -- array of ingredient strings
  -- Nutrition per 100g
  calories NUMERIC(8,2),
  total_fat NUMERIC(8,2),
  saturated_fat NUMERIC(8,2),
  trans_fat NUMERIC(8,2),
  cholesterol NUMERIC(8,2),
  sodium NUMERIC(8,2),
  total_carbs NUMERIC(8,2),
  dietary_fiber NUMERIC(8,2),
  sugars NUMERIC(8,2),
  protein NUMERIC(8,2),
  -- Metadata
  is_verified BOOLEAN DEFAULT FALSE,
  source TEXT CHECK (source IN ('barcode_db', 'ocr', 'manual')) DEFAULT 'barcode_db',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_barcode ON products(barcode);

-- =============================================
-- 7. Candidate Products (unverified / OCR-based)
-- =============================================
CREATE TABLE IF NOT EXISTS candidate_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT NOT NULL,
  raw_ocr_text TEXT,
  parsed_name TEXT,
  parsed_ingredients TEXT[],
  parsed_calories NUMERIC(8,2),
  parsed_total_fat NUMERIC(8,2),
  parsed_sugars NUMERIC(8,2),
  parsed_sodium NUMERIC(8,2),
  parsed_protein NUMERIC(8,2),
  ocr_confidence NUMERIC(4,2),
  scan_count INTEGER DEFAULT 1,
  is_promoted BOOLEAN DEFAULT FALSE,
  submitted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_candidate_barcode ON candidate_products(barcode);

-- =============================================
-- 8. Candidate Product Scans (anti-abuse tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS candidate_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidate_products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scanned_at DATE DEFAULT CURRENT_DATE,
  UNIQUE(candidate_id, user_id, scanned_at) -- one scan per user per product per day
);

-- =============================================
-- 9. Scan History
-- =============================================
CREATE TABLE IF NOT EXISTS scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  candidate_id UUID REFERENCES candidate_products(id),
  verdict TEXT CHECK (verdict IN ('safe', 'caution', 'avoid')) NOT NULL,
  confidence NUMERIC(4,2),
  reasoning TEXT,
  triggered_rules TEXT[],
  ai_explanation TEXT,
  data_source TEXT CHECK (data_source IN ('barcode', 'ocr')),
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scan_history_user ON scan_history(user_id);
CREATE INDEX idx_scan_history_date ON scan_history(scanned_at DESC);

-- =============================================
-- 10. Health Rules (deterministic)
-- =============================================
CREATE TABLE IF NOT EXISTS health_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL,
  description TEXT,
  condition_target TEXT, -- e.g. 'diabetes', 'hypertension', 'allergy:nuts'
  nutrient TEXT, -- e.g. 'sugars', 'sodium', 'calories'
  operator TEXT CHECK (operator IN ('>', '<', '>=', '<=', '=', 'contains')),
  threshold NUMERIC(10,2),
  verdict TEXT CHECK (verdict IN ('caution', 'avoid')) NOT NULL,
  priority INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed some default health rules
INSERT INTO health_rules (rule_name, description, condition_target, nutrient, operator, threshold, verdict, priority) VALUES
  ('High Sugar - Diabetes', 'Flag high sugar products for diabetic users', 'diabetes', 'sugars', '>', 10, 'avoid', 10),
  ('Moderate Sugar - Diabetes', 'Warn moderate sugar for diabetic users', 'diabetes', 'sugars', '>', 5, 'caution', 5),
  ('High Sodium - Hypertension', 'Flag high sodium for hypertension users', 'hypertension', 'sodium', '>', 600, 'avoid', 10),
  ('Moderate Sodium - Hypertension', 'Warn moderate sodium for hypertension', 'hypertension', 'sodium', '>', 300, 'caution', 5),
  ('High Fat - Heart Disease', 'Flag high fat for heart disease users', 'heart_disease', 'total_fat', '>', 20, 'avoid', 10),
  ('High Cholesterol - Heart Disease', 'Flag high cholesterol for heart disease', 'heart_disease', 'cholesterol', '>', 100, 'avoid', 10),
  ('High Sodium - Kidney Disease', 'Flag high sodium for kidney disease', 'kidney_disease', 'sodium', '>', 400, 'avoid', 10),
  ('High Protein - Kidney Disease', 'Warn high protein for kidney disease', 'kidney_disease', 'protein', '>', 20, 'caution', 7),
  ('High Calories - Obese BMI', 'Warn high calorie items for obese users', 'obese', 'calories', '>', 400, 'caution', 5),
  ('Very High Calories - Obese BMI', 'Flag very high calorie items for obese', 'obese', 'calories', '>', 600, 'avoid', 8);

-- =============================================
-- 11. System Settings
-- =============================================
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_settings (key, value, description) VALUES
  ('promotion_threshold', '5', 'Number of scans before candidate product is promoted'),
  ('ocr_confidence_min', '0.7', 'Minimum OCR confidence to accept parsed data');

-- =============================================
-- Helper function: Auto-update updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_candidate_products_updated_at
  BEFORE UPDATE ON candidate_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
