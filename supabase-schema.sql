-- ============================================================
-- CHURCH ATTENDANCE SYSTEM - SUPABASE SCHEMA
-- Run this entire file in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- STUDENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
  class TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ATTENDANCE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL CHECK (session_type IN ('Mass', 'Rosary', 'Sunday School')),
  attendance_date DATE NOT NULL,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  is_present BOOLEAN DEFAULT true,
  marked_by TEXT DEFAULT 'admin',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, session_type, week_number, year)
);

-- ============================================================
-- ADMIN ACTIVITY LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  performed_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MONTHLY TARGETS TABLE (fresh start each month)
-- ============================================================
CREATE TABLE IF NOT EXISTS monthly_targets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  target_sessions INTEGER DEFAULT 4,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, year)
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_week_year ON attendance(week_number, year);
CREATE INDEX IF NOT EXISTS idx_attendance_month_year ON attendance(month, year);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

-- ============================================================
-- UPDATED_AT TRIGGER FOR STUDENTS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SAMPLE DATA - Students
-- ============================================================
INSERT INTO students (full_name, gender, class) VALUES
  ('James Mensah', 'Male', 'Class A'),
  ('Abena Asante', 'Female', 'Class A'),
  ('Kofi Boateng', 'Male', 'Class A'),
  ('Akosua Owusu', 'Female', 'Class A'),
  ('Kwame Darko', 'Male', 'Class B'),
  ('Adwoa Amponsah', 'Female', 'Class B'),
  ('Yaw Osei', 'Male', 'Class B'),
  ('Ama Acheampong', 'Female', 'Class B'),
  ('Kweku Frimpong', 'Male', 'Class C'),
  ('Efua Mensah', 'Female', 'Class C'),
  ('Nana Agyei', 'Male', 'Class C'),
  ('Abena Kusi', 'Female', 'Class C')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY (optional - enable for production)
-- ============================================================
-- ALTER TABLE students ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE monthly_targets ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VIEWS FOR ANALYTICS
-- ============================================================

-- Student attendance summary view
CREATE OR REPLACE VIEW student_attendance_summary AS
SELECT 
  s.id,
  s.full_name,
  s.gender,
  s.class,
  s.is_active,
  COUNT(a.id) FILTER (WHERE a.is_present = true) as total_present,
  COUNT(a.id) as total_sessions,
  ROUND(
    COUNT(a.id) FILTER (WHERE a.is_present = true)::NUMERIC / 
    NULLIF(COUNT(a.id), 0) * 100, 1
  ) as attendance_percentage,
  MAX(a.attendance_date) as last_attendance
FROM students s
LEFT JOIN attendance a ON s.id = a.student_id
GROUP BY s.id, s.full_name, s.gender, s.class, s.is_active;

-- Weekly attendance view
CREATE OR REPLACE VIEW weekly_attendance_overview AS
SELECT 
  a.week_number,
  a.year,
  a.month,
  a.session_type,
  s.class,
  COUNT(*) FILTER (WHERE a.is_present = true) as present_count,
  COUNT(*) as total_count,
  MIN(a.attendance_date) as week_start_date
FROM attendance a
JOIN students s ON a.student_id = s.id
WHERE s.is_active = true
GROUP BY a.week_number, a.year, a.month, a.session_type, s.class
ORDER BY a.year DESC, a.week_number DESC;
