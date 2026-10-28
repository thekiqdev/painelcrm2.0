-- Lead visto no CRM. NULL = ainda não aberto. Leads já existentes ficam como vistos
-- para o badge do menu contar só os que entrarem depois.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.seen_at IS 'Quando o lead foi aberto no CRM. NULL = ainda não visto.';

UPDATE public.leads
SET seen_at = COALESCE(created_at, now())
WHERE seen_at IS NULL;
