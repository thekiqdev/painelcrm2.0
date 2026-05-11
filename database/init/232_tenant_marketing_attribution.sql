-- Atribuição de marketing no cadastro (UTM / fbclid).

CREATE TABLE IF NOT EXISTS public.tenant_marketing_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  utm_content text NULL,
  utm_term text NULL,
  fbclid text NULL,
  landing_path text NULL,
  first_seen_at timestamptz NULL,
  converted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_marketing_attribution_tenant_id_uidx
  ON public.tenant_marketing_attribution (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_marketing_attribution_user_id_idx
  ON public.tenant_marketing_attribution (user_id);
