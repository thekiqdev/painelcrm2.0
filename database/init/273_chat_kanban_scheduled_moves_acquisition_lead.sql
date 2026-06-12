-- Sprint K8 — auto_move_by_time para cartões acquisition_lead (Ops).
-- conversation_id OU acquisition_lead_id (exatamente um); registros legados mantêm conversation_id.

ALTER TABLE public.chat_kanban_scheduled_moves
  ADD COLUMN IF NOT EXISTS acquisition_lead_id UUID REFERENCES public.acquisition_leads (id) ON DELETE CASCADE;

ALTER TABLE public.chat_kanban_scheduled_moves
  ALTER COLUMN conversation_id DROP NOT NULL;

ALTER TABLE public.chat_kanban_scheduled_moves
  DROP CONSTRAINT IF EXISTS chk_chat_kanban_scheduled_moves_subject_ref;

ALTER TABLE public.chat_kanban_scheduled_moves
  ADD CONSTRAINT chk_chat_kanban_scheduled_moves_subject_ref CHECK (
    (conversation_id IS NOT NULL AND acquisition_lead_id IS NULL)
    OR (conversation_id IS NULL AND acquisition_lead_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_chat_kanban_scheduled_moves_acquisition_lead
  ON public.chat_kanban_scheduled_moves (acquisition_lead_id)
  WHERE acquisition_lead_id IS NOT NULL;

COMMENT ON COLUMN public.chat_kanban_scheduled_moves.acquisition_lead_id IS
  'Cartão Ops (acquisition_lead) sem conversa — alternativa a conversation_id para agendamentos auto_move_by_time.';
