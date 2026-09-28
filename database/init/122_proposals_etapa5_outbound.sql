-- Etapa 5 Propostas: webhooks outbound, entregas, retries, extras de permissão.

-- Permissões finas (JSON por módulo; hoje só propostas usa chaves proposals_*)
ALTER TABLE public.role_module_permissions
  ADD COLUMN IF NOT EXISTS module_extras JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.custom_role_module_permissions
  ADD COLUMN IF NOT EXISTS module_extras JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.role_module_permissions.module_extras IS
  'Extensões por módulo. Propostas Etapa 5: proposals_send, proposals_convert_invoice, proposals_manage_integrations (boolean).';

UPDATE public.role_module_permissions
SET module_extras = jsonb_build_object(
  'proposals_send', true,
  'proposals_convert_invoice', true,
  'proposals_manage_integrations', true
)
WHERE module = 'proposals' AND role = 'admin';

UPDATE public.role_module_permissions
SET module_extras = jsonb_build_object(
  'proposals_send', true,
  'proposals_convert_invoice', true,
  'proposals_manage_integrations', false
)
WHERE module = 'proposals' AND role = 'member';

UPDATE public.role_module_permissions
SET module_extras = jsonb_build_object(
  'proposals_send', true,
  'proposals_convert_invoice', true,
  'proposals_manage_integrations', true
)
WHERE module = 'proposals' AND role = 'manager';

UPDATE public.role_module_permissions
SET module_extras = jsonb_build_object(
  'proposals_send', false,
  'proposals_convert_invoice', false,
  'proposals_manage_integrations', false
)
WHERE module = 'proposals' AND role = 'viewer';

-- Configuração de webhook por tenant (secret em ciphertext — ver backend)
CREATE TABLE IF NOT EXISTS public.tenant_proposal_webhook_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  webhook_url TEXT,
  /** Subconjunto de eventos; vazio = nenhum */
  event_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  secret_ciphertext TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id)
);

COMMENT ON TABLE public.tenant_proposal_webhook_settings IS
  'Webhook outbound de propostas (Etapa 5). secret_ciphertext: AES-256-GCM + base64 quando PROPOSAL_WEBHOOK_SECRET_KEY está definido.';

CREATE INDEX IF NOT EXISTS idx_tenant_proposal_webhook_enabled
  ON public.tenant_proposal_webhook_settings(tenant_id) WHERE enabled = true;

-- Uma fila de entrega por evento de integração (retries no mesmo registro + attempt_log)
CREATE TABLE IF NOT EXISTS public.proposal_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_event_id UUID NOT NULL REFERENCES public.proposal_integration_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivering', 'success', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_http_status INT,
  last_error TEXT,
  response_snippet TEXT,
  attempt_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integration_event_id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_webhook_deliveries_retry
  ON public.proposal_webhook_deliveries(tenant_id, status, next_retry_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_proposal_webhook_deliveries_event
  ON public.proposal_webhook_deliveries(integration_event_id);

COMMENT ON TABLE public.proposal_webhook_deliveries IS
  'Entrega outbound HMAC para webhooks de propostas. Backoff: ver documentação Etapa 5.';
