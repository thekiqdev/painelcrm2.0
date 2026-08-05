-- Chatbot Flows S4 — delay (resume_at) + status waiting_delay.

ALTER TABLE public.chatbot_flow_sessions
  ADD COLUMN IF NOT EXISTS resume_at TIMESTAMPTZ;

ALTER TABLE public.chatbot_flow_sessions
  DROP CONSTRAINT IF EXISTS chk_chatbot_flow_sessions_status;

ALTER TABLE public.chatbot_flow_sessions
  ADD CONSTRAINT chk_chatbot_flow_sessions_status CHECK (
    status IN ('active', 'waiting_input', 'waiting_delay', 'paused', 'ended', 'transferred', 'error')
  );

DROP INDEX IF EXISTS uq_chatbot_flow_sessions_live_conversation;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_flow_sessions_live_conversation
  ON public.chatbot_flow_sessions(conversation_id)
  WHERE status IN ('active', 'waiting_input', 'waiting_delay');

CREATE INDEX IF NOT EXISTS idx_chatbot_flow_sessions_resume_due
  ON public.chatbot_flow_sessions(resume_at)
  WHERE status = 'waiting_delay' AND resume_at IS NOT NULL;

COMMENT ON COLUMN public.chatbot_flow_sessions.resume_at IS
  'Quando status=waiting_delay, instante em que o worker deve retomar (S4).';
