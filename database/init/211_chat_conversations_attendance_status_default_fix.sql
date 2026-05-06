-- Corrige DEFAULT de attendance_status após Fase 5 profissional.
-- A coluna foi criada em 96 com DEFAULT 'unassigned' + CHECK legado;
-- 185 atualizou o CHECK para open|pending|in_progress|... mas não alterou o DEFAULT.
-- INSERTs sem attendance_status recebiam 'unassigned' e violavam chat_conversations_attendance_status_check (23514).

ALTER TABLE public.chat_conversations
  ALTER COLUMN attendance_status SET DEFAULT 'pending';
