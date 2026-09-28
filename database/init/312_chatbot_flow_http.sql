-- Chatbot Flows S5 — status waiting_http (HTTP/webhook).
ALTER TABLE public.chatbot_flow_sessions
  DROP CONSTRAINT IF EXISTS chk_chatbot_flow_sessions_status;

ALTER TABLE public.chatbot_flow_sessions
  ADD CONSTRAINT chk_chatbot_flow_sessions_status CHECK (
    status IN (
      'active',
      'waiting_input',
      'waiting_delay',
      'waiting_http',
      'paused',
      'ended',
      'transferred',
      'error'
    )
  );

COMMENT ON COLUMN public.chatbot_flow_sessions.status IS
  'Runtime: active|waiting_input|waiting_delay|waiting_http|paused|ended|transferred|error';
