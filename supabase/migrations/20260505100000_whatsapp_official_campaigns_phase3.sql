-- Mirror de database/init/200_whatsapp_official_campaigns_phase3.sql (Fase 3 campanhas)

ALTER TABLE public.whatsapp_official_campaigns DROP CONSTRAINT IF EXISTS whatsapp_official_campaigns_status_check;
UPDATE public.whatsapp_official_campaigns SET status = 'running' WHERE status = 'sending';
ALTER TABLE public.whatsapp_official_campaigns
  ADD CONSTRAINT whatsapp_official_campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed', 'cancelled'));

ALTER TABLE public.whatsapp_official_campaigns ADD COLUMN IF NOT EXISTS audience_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.whatsapp_official_campaigns ADD COLUMN IF NOT EXISTS template_variables JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.whatsapp_official_campaigns ADD COLUMN IF NOT EXISTS send_mode TEXT DEFAULT 'immediate'
  CHECK (send_mode IN ('immediate', 'scheduled'));
ALTER TABLE public.whatsapp_official_campaigns ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.whatsapp_official_campaigns ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE public.whatsapp_official_campaigns ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE public.whatsapp_official_campaigns ADD COLUMN IF NOT EXISTS total_recipients INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.whatsapp_official_campaigns ADD COLUMN IF NOT EXISTS queued_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.whatsapp_official_campaigns ADD COLUMN IF NOT EXISTS delivered_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.whatsapp_official_campaigns ADD COLUMN IF NOT EXISTS read_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.whatsapp_official_campaigns ADD COLUMN IF NOT EXISTS cancelled_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.whatsapp_official_campaigns.audience_config IS 'Segmentação: tipo CSV/tenants/grupo, filtros, CSV parseado';
COMMENT ON COLUMN public.whatsapp_official_campaigns.template_variables IS 'Mapeamento slots {{n}} → fontes (CSV, tenant, manual)';

ALTER TABLE public.whatsapp_official_campaign_recipients DROP CONSTRAINT IF EXISTS whatsapp_official_campaign_recipients_status_check;
ALTER TABLE public.whatsapp_official_campaign_recipients
  ADD CONSTRAINT whatsapp_official_campaign_recipients_status_check
  CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled'));

ALTER TABLE public.whatsapp_official_campaign_recipients ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE public.whatsapp_official_campaign_recipients ADD COLUMN IF NOT EXISTS recipient_email TEXT;
ALTER TABLE public.whatsapp_official_campaign_recipients ADD COLUMN IF NOT EXISTS tenant_ref_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.whatsapp_official_campaign_recipients ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.whatsapp_official_campaign_recipients ADD COLUMN IF NOT EXISTS template_params JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.whatsapp_official_campaign_recipients ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.whatsapp_official_campaign_recipients ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE public.whatsapp_official_campaign_recipients ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
ALTER TABLE public.whatsapp_official_campaign_recipients ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE public.whatsapp_official_campaign_recipients ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_wa_campaign_recipients_next_retry
  ON public.whatsapp_official_campaign_recipients (next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_campaign_recipients_tenant
  ON public.whatsapp_official_campaign_recipients (tenant_ref_id)
  WHERE tenant_ref_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_official_campaign_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.whatsapp_official_campaigns(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_campaign_audit_campaign ON public.whatsapp_official_campaign_audit_events (campaign_id);
CREATE INDEX IF NOT EXISTS idx_wa_campaign_audit_type ON public.whatsapp_official_campaign_audit_events (event_type);
