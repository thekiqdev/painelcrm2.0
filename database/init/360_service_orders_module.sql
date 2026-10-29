-- OS-S1 — Ordem de Serviço: schema base + feature de plano + permissões de módulo
-- ADR: docs/service-orders/ADR_OS_S0_DECISOES.md

-- Sequência de numeração por tenant (race-safe)
CREATE TABLE IF NOT EXISTS public.service_order_number_sequences (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_order_number_sequences_next_positive CHECK (next_number >= 1)
);

CREATE TABLE IF NOT EXISTS public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  responsible_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  service_order_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  client_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  execution_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  period_start_at TIMESTAMPTZ NULL,
  period_end_at TIMESTAMPTZ NULL,
  equipment JSONB NULL,
  observations TEXT NULL,
  billing_mode TEXT NOT NULL DEFAULT 'manual',
  appointment_id UUID NULL,
  converted_invoice_id UUID NULL,
  content_html TEXT NULL,
  content_snapshot_html TEXT NULL,
  document_frozen_at TIMESTAMPTZ NULL,
  total_services_cents BIGINT NOT NULL DEFAULT 0,
  total_products_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  signed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_orders_number_unique UNIQUE (tenant_id, service_order_number),
  CONSTRAINT service_orders_status_check CHECK (
    status IN (
      'draft',
      'scheduled',
      'in_progress',
      'awaiting_signature',
      'signed',
      'invoiced',
      'completed',
      'cancelled'
    )
  ),
  CONSTRAINT service_orders_billing_mode_check CHECK (
    billing_mode IN ('none', 'manual', 'auto_on_sign')
  ),
  CONSTRAINT service_orders_totals_nonneg CHECK (
    total_services_cents >= 0
    AND total_products_cents >= 0
    AND total_cents >= 0
  ),
  CONSTRAINT service_orders_period_order CHECK (
    period_end_at IS NULL
    OR period_start_at IS NULL
    OR period_end_at >= period_start_at
  )
);

CREATE INDEX IF NOT EXISTS idx_service_orders_tenant_created
  ON public.service_orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_orders_tenant_status
  ON public.service_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_service_orders_tenant_client
  ON public.service_orders (tenant_id, client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_orders_tenant_responsible
  ON public.service_orders (tenant_id, responsible_user_id)
  WHERE responsible_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_orders_created_by
  ON public.service_orders (tenant_id, created_by);

COMMENT ON TABLE public.service_orders IS 'Ordens de serviço do tenant (OS-S1).';
COMMENT ON COLUMN public.service_orders.client_snapshot IS 'Cópia dos dados do cliente exibidos no documento.';
COMMENT ON COLUMN public.service_orders.execution_address IS 'Endereço de atendimento (pode diferir do cadastro).';
COMMENT ON COLUMN public.service_orders.equipment IS 'Opcional: { name, brand, model, serial, defects }.';
COMMENT ON COLUMN public.service_orders.appointment_id IS 'Visita principal — FK appointments em OS-S6.';
COMMENT ON COLUMN public.service_orders.converted_invoice_id IS 'Fatura gerada — FK customer_invoices em OS-S5.';

CREATE TABLE IF NOT EXISTS public.service_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  product_id UUID NULL REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  unit TEXT NOT NULL DEFAULT 'UN',
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_price_cents BIGINT NOT NULL DEFAULT 0,
  discount_cents BIGINT NOT NULL DEFAULT 0,
  subtotal_cents BIGINT NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_order_items_kind_check CHECK (kind IN ('service', 'product')),
  CONSTRAINT service_order_items_qty_positive CHECK (quantity > 0),
  CONSTRAINT service_order_items_money_nonneg CHECK (
    unit_price_cents >= 0
    AND discount_cents >= 0
    AND subtotal_cents >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_service_order_items_order
  ON public.service_order_items (service_order_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_service_order_items_tenant
  ON public.service_order_items (tenant_id);

COMMENT ON TABLE public.service_order_items IS 'Linhas de serviço/produto da OS (snapshot + product_id opcional).';

CREATE TABLE IF NOT EXISTS public.service_order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_order_events_order_created
  ON public.service_order_events (service_order_id, created_at DESC);

COMMENT ON TABLE public.service_order_events IS 'Timeline / auditoria leve da OS.';

-- RLS (mesmo padrão appointments)
ALTER TABLE public.service_order_number_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_order_number_sequences_tenant_policy ON public.service_order_number_sequences;
CREATE POLICY service_order_number_sequences_tenant_policy ON public.service_order_number_sequences
  FOR ALL
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_orders_tenant_policy ON public.service_orders;
CREATE POLICY service_orders_tenant_policy ON public.service_orders
  FOR ALL
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_order_items_tenant_policy ON public.service_order_items;
CREATE POLICY service_order_items_tenant_policy ON public.service_order_items
  FOR ALL
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.service_order_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_order_events_tenant_policy ON public.service_order_events;
CREATE POLICY service_order_events_tenant_policy ON public.service_order_events
  FOR ALL
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- Feature de plano (habilitada para API S1; menu FE só em S2)
INSERT INTO public.system_features (key, name, description, sort_order) VALUES
  ('service_orders', 'Ordens de Serviço', 'Ordens de serviço, visita técnica, assinatura e faturamento', 126)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.plan_features (plan_id, feature_key, enabled, created_at, updated_at)
SELECT id, 'service_orders', true, now(), now() FROM public.plans
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = true, updated_at = now();

-- Permissões por papel (módulo service_orders)
INSERT INTO public.role_module_permissions (
  role, module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only
) VALUES
  ('admin', 'service_orders', true, true, true, true, false, false),
  ('manager', 'service_orders', true, true, true, true, false, false),
  ('member', 'service_orders', true, true, true, true, true, true),
  ('viewer', 'service_orders', true, false, false, false, false, false)
ON CONFLICT (role, module) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  edit_own_only = EXCLUDED.edit_own_only,
  delete_own_only = EXCLUDED.delete_own_only,
  updated_at = now();
