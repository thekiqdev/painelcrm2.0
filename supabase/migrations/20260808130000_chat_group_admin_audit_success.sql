-- QA: coluna explícita `success` para relatórios (Fase 3 grupos).
ALTER TABLE public.chat_group_admin_audit
  ADD COLUMN IF NOT EXISTS success boolean;

UPDATE public.chat_group_admin_audit
SET success = (error_message IS NULL)
WHERE success IS NULL;

ALTER TABLE public.chat_group_admin_audit
  ALTER COLUMN success SET DEFAULT true;

ALTER TABLE public.chat_group_admin_audit
  ALTER COLUMN success SET NOT NULL;
