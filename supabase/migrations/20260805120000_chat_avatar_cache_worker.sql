-- Mirror: database/init/206_chat_avatar_cache_worker.sql

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS avatar_cache_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avatar_cache_last_error text,
  ADD COLUMN IF NOT EXISTS avatar_cache_next_retry_at timestamptz;

COMMENT ON COLUMN public.chat_conversations.avatar_cache_attempts IS
  'Número de falhas consecutivas no cache automático (worker); resetado em sucesso.';
COMMENT ON COLUMN public.chat_conversations.avatar_cache_last_error IS
  'Última mensagem de erro do worker ao tentar cache (sanitizada no app).';
COMMENT ON COLUMN public.chat_conversations.avatar_cache_next_retry_at IS
  'Não selecionar para worker automático antes deste instante (backoff).';

CREATE TABLE IF NOT EXISTS public.whatsapp_avatar_cache_worker_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_cycle_started_at timestamptz,
  last_cycle_finished_at timestamptz,
  last_cycle_processed integer NOT NULL DEFAULT 0,
  last_cycle_success integer NOT NULL DEFAULT 0,
  last_cycle_failed integer NOT NULL DEFAULT 0,
  last_cycle_skipped integer NOT NULL DEFAULT 0,
  total_processed bigint NOT NULL DEFAULT 0,
  total_success bigint NOT NULL DEFAULT 0,
  total_failed bigint NOT NULL DEFAULT 0,
  total_skipped bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.whatsapp_avatar_cache_worker_state (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
