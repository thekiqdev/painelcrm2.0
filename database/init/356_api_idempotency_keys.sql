-- API etapa 2 — replay de POST /api/v1/leads (janela de 24 h; limpeza na etapa 4).

CREATE TABLE IF NOT EXISTS public.api_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  idem_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_idempotency_keys_idem_len CHECK (char_length(idem_key) BETWEEN 1 AND 128),
  CONSTRAINT api_idempotency_keys_hash_len CHECK (char_length(request_hash) = 64),
  CONSTRAINT api_idempotency_keys_pair UNIQUE (api_key_id, idem_key)
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_keys_tenant ON public.api_idempotency_keys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_idempotency_keys_created ON public.api_idempotency_keys (created_at);

COMMENT ON TABLE public.api_idempotency_keys IS
  'Resposta guardada por chave + Idempotency-Key. Não armazena o segredo da API.';

ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_idempotency_keys_tenant_policy ON public.api_idempotency_keys;
CREATE POLICY api_idempotency_keys_tenant_policy ON public.api_idempotency_keys FOR ALL
  USING (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id())
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());
