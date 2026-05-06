-- Corrige DEFAULT de attendance_status (legado 'unassigned' incompatível com CHECK Fase 5).
ALTER TABLE public.chat_conversations
  ALTER COLUMN attendance_status SET DEFAULT 'pending';
