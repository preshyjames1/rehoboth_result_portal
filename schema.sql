-- ============================================================
-- REHOBOTH COLLEGE RESULT PORTAL — Full Database Schema
-- ============================================================
-- Use this file for a FRESH database setup.
-- For an existing database, run migration.sql instead.
-- ============================================================

-- ADMINS
-- M-03 FIX: role column is now part of the schema
CREATE TABLE admins (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT         UNIQUE NOT NULL,
  password_hash TEXT         NOT NULL,
  role          TEXT         NOT NULL DEFAULT 'super'
                               CHECK (role IN ('super', 'school')),
  created_at    TIMESTAMPTZ  DEFAULT now()
);

-- STUDENTS
CREATE TABLE students (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_no TEXT         UNIQUE NOT NULL,
  full_name    TEXT         NOT NULL,
  class        TEXT         NOT NULL,
  email        TEXT,
  phone        TEXT,
  created_at   TIMESTAMPTZ  DEFAULT now()
);

-- RESULTS
CREATE TABLE results (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID         REFERENCES students(id) ON DELETE CASCADE,
  term         TEXT         NOT NULL,
  session      TEXT         NOT NULL,
  pdf_path     TEXT         NOT NULL,
  is_published BOOLEAN      DEFAULT false,
  publish_at   TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  DEFAULT now(),
  UNIQUE (student_id, term, session)
);

-- STANDARD PINS (purchased by students / bulk-purchased by school admins)
CREATE TABLE pins (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_code              TEXT         UNIQUE NOT NULL,
  usage_limit           INTEGER      DEFAULT 5,
  usage_count           INTEGER      DEFAULT 0,
  is_active             BOOLEAN      DEFAULT true,
  claimed_by_student_id UUID         REFERENCES students(id),
  term                  TEXT         NOT NULL,
  session               TEXT         NOT NULL,
  created_at            TIMESTAMPTZ  DEFAULT now()
);

-- MASTER CREDENTIALS (super admin only — never purchasable)
-- M-01 FIX: pin_code stores a BCRYPT HASH, not plaintext.
--           Verification uses bcrypt.compare() in /api/master.
CREATE TABLE master_pins (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  master_number       TEXT         UNIQUE NOT NULL,
  pin_code            TEXT         NOT NULL,  -- bcrypt hash
  label               TEXT,
  usage_limit         INTEGER      DEFAULT 5,
  usage_count         INTEGER      DEFAULT 0,
  is_active           BOOLEAN      DEFAULT true,
  scope               TEXT         DEFAULT 'all' CHECK (scope IN ('all', 'student')),
  scoped_student_id   UUID         REFERENCES students(id),
  term                TEXT,
  session             TEXT,
  created_by_admin_id UUID         REFERENCES admins(id),
  created_at          TIMESTAMPTZ  DEFAULT now()
);

-- MASTER PIN USAGE LOG
CREATE TABLE master_pin_usage (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  master_pin_id       UUID         REFERENCES master_pins(id) ON DELETE CASCADE,
  accessed_student_id UUID         REFERENCES students(id),
  term                TEXT         NOT NULL,
  session             TEXT         NOT NULL,
  used_at             TIMESTAMPTZ  DEFAULT now(),
  ip_address          TEXT
);

-- PIN USAGE LOG (standard pins)
CREATE TABLE pin_usage (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id     UUID         REFERENCES pins(id) ON DELETE CASCADE,
  student_id UUID         REFERENCES students(id),
  used_at    TIMESTAMPTZ  DEFAULT now(),
  ip_address TEXT
);

-- TRANSACTIONS
-- fix9: admission_no is nullable (ADMIN-BULK purchases use a placeholder)
-- fix11: pin_id FK uses ON DELETE SET NULL so PINs can be deleted freely
CREATE TABLE transactions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         TEXT         UNIQUE NOT NULL,
  email             TEXT         NOT NULL,
  phone             TEXT,
  admission_no      TEXT,  -- nullable for admin bulk purchases
  amount            INTEGER      NOT NULL,
  status            TEXT         DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'success', 'failed')),
  pin_id            UUID         REFERENCES pins(id) ON DELETE SET NULL,
  authorization_url TEXT,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  DEFAULT now()
);

-- BROADSHEETS (class-wide result PDFs, fix10)
CREATE TABLE broadsheets (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  term       TEXT         NOT NULL,
  session    TEXT         NOT NULL,
  class      TEXT         NOT NULL,
  type       TEXT         NOT NULL
               CHECK (type IN ('1st_ca', '2nd_ca', 'exam', 'combined')),
  title      TEXT         NOT NULL,
  pdf_path   TEXT         NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (term, session, class, type)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- All access goes through the service role key only.
-- The anon key is blocked from every table.
-- ============================================================
ALTER TABLE admins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE students        ENABLE ROW LEVEL SECURITY;
ALTER TABLE results         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_pins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_pin_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_usage       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadsheets     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_only" ON admins           USING (false);
CREATE POLICY "service_only" ON students         USING (false);
CREATE POLICY "service_only" ON results          USING (false);
CREATE POLICY "service_only" ON pins             USING (false);
CREATE POLICY "service_only" ON master_pins      USING (false);
CREATE POLICY "service_only" ON master_pin_usage USING (false);
CREATE POLICY "service_only" ON pin_usage        USING (false);
CREATE POLICY "service_only" ON transactions     USING (false);
CREATE POLICY "service_only" ON broadsheets      USING (false);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_students_admission_no   ON students(admission_no);
CREATE INDEX idx_results_student_id      ON results(student_id);
CREATE INDEX idx_results_publish_at      ON results(publish_at)
  WHERE publish_at IS NOT NULL AND is_published = false;
CREATE INDEX idx_pins_pin_code           ON pins(pin_code);
CREATE INDEX idx_pins_claimed_by         ON pins(claimed_by_student_id);
CREATE INDEX idx_master_pins_master_num  ON master_pins(master_number);
CREATE INDEX idx_transactions_reference  ON transactions(reference);
CREATE INDEX idx_transactions_status     ON transactions(status);
CREATE INDEX idx_master_pin_usage_pin_id ON master_pin_usage(master_pin_id);

-- ============================================================
-- SUPABASE STORAGE
-- Run in Supabase Dashboard: Storage → New bucket → "results"
-- Make sure "Public bucket" is OFF (private)
-- Or via SQL:
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('results', 'results', false)
--   ON CONFLICT (id) DO NOTHING;
-- ============================================================
