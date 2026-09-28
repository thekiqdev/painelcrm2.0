-- M5-W Block Sprint 3 — override de dias de bloqueio por Partner
ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS wholesale_block_after_days INTEGER NULL;

ALTER TABLE public.partner_profiles
  DROP CONSTRAINT IF EXISTS partner_profiles_wholesale_block_after_days_chk;

ALTER TABLE public.partner_profiles
  ADD CONSTRAINT partner_profiles_wholesale_block_after_days_chk
  CHECK (
    wholesale_block_after_days IS NULL
    OR (wholesale_block_after_days >= 0 AND wholesale_block_after_days <= 90)
  );

COMMENT ON COLUMN public.partner_profiles.wholesale_block_after_days IS
  'Override Block S3: dias após due_date para past_due. NULL = usa setting global partner_wholesale_block_after_days.';
