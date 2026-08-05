-- Chatbot Flows S18 — timeout em waiting_input (pergunta / menu).
-- Reusa resume_at; estende índice parcial para waiting_input.

CREATE INDEX IF NOT EXISTS idx_chatbot_flow_sessions_input_timeout_due
  ON public.chatbot_flow_sessions(resume_at)
  WHERE status = 'waiting_input' AND resume_at IS NOT NULL;

COMMENT ON COLUMN public.chatbot_flow_sessions.resume_at IS
  'waiting_delay: retoma após delay (S4). waiting_input: timeout de inatividade (S18).';
