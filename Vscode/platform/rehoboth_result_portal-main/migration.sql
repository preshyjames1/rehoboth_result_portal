-- ============================================================
-- REHOBOTH COLLEGE RESULT PORTAL — Security Migration
-- ============================================================
-- Run this entire file in Supabase SQL Editor ONCE before
-- deploying the security-fixed version of the app.
--
-- What this migration does:
--   1. Adds `role` column to admins table          (M-03)
--   2. Adds `authorization_url` column to transactions (existing fix9)
--   3. Fixes FK constraint on transactions.pin_id  (existing fix11)
--   4. Creates broadsheets table if not present    (existing fix10)
--   5. Clears master_pins.pin_code values so they  (M-01)
--      can be re-created as bcrypt hashes
--      ⚠ READ SECTION 5 CAREFULLY BEFORE RUNNING
-- ============================================================


-- ============================================================
-- 1. admins — add role column (M-03 FIX)
--    Existing rows without a role default to 'super'.
--    New school admins must be inserted with role = 'school'.
-- ============================================================
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS role TEXT
    NOT NULL DEFAULT 'super'
    CHECK (role IN ('super', 'school'));

-- Verify:
-- SELECT id, email, role FROM admins;


-- ============================================================
-- 2. transactions — add authorization_url column
--    (Required by the admin bulk PIN purchase flow in fix9.
--     Safe to run again — IF NOT EXISTS guards it.)
-- ============================================================
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS authorization_url TEXT;

-- Also drop the NOT NULL on admission_no if still set
-- (The fix9 migration may have already done this)
ALTER TABLE transactions
  ALTER COLUMN admission_no DROP NOT NULL;


-- ============================================================
-- 3. transactions.pin_id FK — change to ON DELETE SET NULL
--    (Required so PINs can be deleted without FK violations.)
--    fix11 migration — safe to run again.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'transactions_pin_id_fkey'
      AND table_name = 'transactions'
  ) THEN
    ALTER TABLE transactions DROP CONSTRAINT transactions_pin_id_fkey;
  END IF;
END $$;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_pin_id_fkey
    FOREIGN KEY (pin_id) REFERENCES pins(id) ON DELETE SET NULL;


-- ============================================================
-- 4. broadsheets table (fix10 — safe to run again)
-- ============================================================
CREATE TABLE IF NOT EXISTS broadsheets (
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

ALTER TABLE broadsheets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'broadsheets' AND policyname = 'service_only'
  ) THEN
    CREATE POLICY "service_only" ON broadsheets USING (false);
  END IF;
END $$;


-- ============================================================
-- 5. master_pins — migrate to bcrypt hashed pin_code (M-01 FIX)
--
--    ⚠ IMPORTANT: Read this section carefully.
--
--    The old app stored master PIN codes as PLAINTEXT.
--    The new app stores them as BCRYPT HASHES.
--    These two formats are incompatible — old plaintext values
--    cannot be verified by bcrypt.compare().
--
--    This migration DELETES all existing master_pins rows so
--    that you start fresh with hashed PINs.
--
--    What you need to do AFTER running this migration:
--      a) Log in to the super admin panel
--      b) Go to Master PINs → Create new master PINs
--      c) The system will generate new PINs and store them hashed
--      d) Save the displayed plaintext PINs — they are shown ONCE
--
--    If you have master PINs that are currently in active use,
--    note them down BEFORE running this migration, then
--    re-create them afterwards with the same master_number.
--    (You can choose your own master_number when creating.)
--
--    To skip this step (keep old plaintext PINs, accept the risk):
--      Comment out the DELETE statement below.
--      Note: the old PINs will FAIL to verify until you recreate
--      them, because the new /api/master route uses bcrypt.compare.
-- ============================================================

-- Also delete usage logs first (FK cascade)
DELETE FROM master_pin_usage;
DELETE FROM master_pins;

-- Verify the table is empty:
-- SELECT COUNT(*) FROM master_pins;   -- should return 0


-- ============================================================
-- 6. pin_usage table — ensure it exists
--    (In case it was missed in the initial schema deployment)
-- ============================================================
CREATE TABLE IF NOT EXISTS pin_usage (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id     UUID         REFERENCES pins(id) ON DELETE CASCADE,
  student_id UUID         REFERENCES students(id),
  used_at    TIMESTAMPTZ  DEFAULT NOW(),
  ip_address TEXT
);

ALTER TABLE pin_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pin_usage' AND policyname = 'service_only'
  ) THEN
    CREATE POLICY "service_only" ON pin_usage USING (false);
  END IF;
END $$;


-- ============================================================
-- 7. Indexes — ensure performance indexes exist
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_students_admission_no   ON students(admission_no);
CREATE INDEX IF NOT EXISTS idx_results_student_id      ON results(student_id);
CREATE INDEX IF NOT EXISTS idx_results_publish_at      ON results(publish_at)
  WHERE publish_at IS NOT NULL AND is_published = false;
CREATE INDEX IF NOT EXISTS idx_pins_pin_code           ON pins(pin_code);
CREATE INDEX IF NOT EXISTS idx_pins_claimed_by         ON pins(claimed_by_student_id);
CREATE INDEX IF NOT EXISTS idx_master_pins_master_num  ON master_pins(master_number);
CREATE INDEX IF NOT EXISTS idx_transactions_reference  ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_transactions_status     ON transactions(status);


-- ============================================================
-- Done. Verify by running:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'admins';
--   -- should include: role TEXT
--
--   SELECT COUNT(*) FROM master_pins;
--   -- should be 0 (unless you commented out the DELETE above)
-- ============================================================
