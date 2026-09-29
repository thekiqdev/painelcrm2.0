-- TD Sprint 1 — tenant_hosts (domínio personalizado: loja | abertura de chamados)

CREATE TABLE IF NOT EXISTS public.tenant_hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  role TEXT NOT NULL
    CHECK (role IN ('store', 'support')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('none', 'pending', 'verified', 'active', 'error')),
  verification_token TEXT NULL,
  verified_at TIMESTAMPTZ NULL,
  activated_at TIMESTAMPTZ NULL,
  last_check_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_hosts_hostname_nonempty CHECK (length(trim(hostname)) > 0)
);

-- Hostname único global (lowercase)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_hosts_hostname_lower
  ON public.tenant_hosts (lower(hostname));

-- No máximo um host "em uso" por papel por tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_hosts_tenant_role_active
  ON public.tenant_hosts (tenant_id, role)
  WHERE status IN ('pending', 'verified', 'active');

CREATE INDEX IF NOT EXISTS idx_tenant_hosts_tenant
  ON public.tenant_hosts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_hosts_status_active
  ON public.tenant_hosts (lower(hostname))
  WHERE status IN ('verified', 'active');

COMMENT ON TABLE public.tenant_hosts IS
  'TD: hosts públicos do tenant SaaS — role store (loja) ou support (portal de chamados).';
COMMENT ON COLUMN public.tenant_hosts.role IS
  'store = vitrine; support = abertura de chamados. Papel app (CRM) fora do MVP.';
