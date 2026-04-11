-- Conversa na fila de uma equipe (transferência para equipe) + auditoria

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS assigned_team_id UUID NULL REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_assigned_team_id
  ON public.chat_conversations(assigned_team_id)
  WHERE assigned_team_id IS NOT NULL;

COMMENT ON COLUMN public.chat_conversations.assigned_team_id IS 'Etapa 5+: equipe que deve atender (fila da equipe); sem operador até alguém assumir';

ALTER TABLE public.chat_conversation_assignment_history
  ADD COLUMN IF NOT EXISTS to_team_id UUID NULL REFERENCES public.teams(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.chat_conversation_assignment_history.to_team_id IS 'Destino em transferência para equipe (operation transfer_team)';
