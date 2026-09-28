-- Sprint 6.5 — Cartões operacionais vinculados a acquisition_leads (sem conversa obrigatória)
-- Reutiliza chat_kanban_cards; tenant virtual Super Admin Ops.

ALTER TABLE public.chat_kanban_cards
  ADD COLUMN IF NOT EXISTS acquisition_lead_id UUID REFERENCES public.acquisition_leads (id) ON DELETE CASCADE;

ALTER TABLE public.chat_kanban_cards
  ALTER COLUMN conversation_id DROP NOT NULL;

ALTER TABLE public.chat_kanban_cards
  DROP CONSTRAINT IF EXISTS chat_kanban_cards_board_id_conversation_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_kanban_cards_board_conversation_active
  ON public.chat_kanban_cards (board_id, conversation_id)
  WHERE conversation_id IS NOT NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_kanban_cards_board_acquisition_lead_active
  ON public.chat_kanban_cards (board_id, acquisition_lead_id)
  WHERE acquisition_lead_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_kanban_cards_acquisition_lead
  ON public.chat_kanban_cards (acquisition_lead_id)
  WHERE acquisition_lead_id IS NOT NULL;

ALTER TABLE public.chat_kanban_cards
  DROP CONSTRAINT IF EXISTS chk_chat_kanban_cards_entity_ref;

ALTER TABLE public.chat_kanban_cards
  ADD CONSTRAINT chk_chat_kanban_cards_entity_ref CHECK (
    (conversation_id IS NOT NULL AND acquisition_lead_id IS NULL)
    OR (conversation_id IS NULL AND acquisition_lead_id IS NOT NULL)
  );

COMMENT ON COLUMN public.chat_kanban_cards.acquisition_lead_id IS
  'Cartão operacional (ex.: Super Admin Ops) vinculado a acquisition_leads — sem conversa WhatsApp ainda.';
