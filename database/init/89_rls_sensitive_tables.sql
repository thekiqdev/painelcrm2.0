-- Etapa 2 — RLS em tabelas sensíveis (multi-tenant).
-- Requer app.current_tenant_id e/ou app.bypass_rls (funções em 57_rls_tenant_isolation.sql).

-- ---------------------------------------------------------------------------
-- client_timeline_events (tenant_id direto)
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_timeline_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_timeline_events_tenant_policy ON public.client_timeline_events;
CREATE POLICY client_timeline_events_tenant_policy ON public.client_timeline_events
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_tenant_policy ON public.subscriptions;
CREATE POLICY subscriptions_tenant_policy ON public.subscriptions
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- ---------------------------------------------------------------------------
-- payment_customers
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_customers_tenant_policy ON public.payment_customers;
CREATE POLICY payment_customers_tenant_policy ON public.payment_customers
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- ---------------------------------------------------------------------------
-- billing_recurring_jobs
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_recurring_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_recurring_jobs_tenant_policy ON public.billing_recurring_jobs;
CREATE POLICY billing_recurring_jobs_tenant_policy ON public.billing_recurring_jobs
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- ---------------------------------------------------------------------------
-- customer_invoice_items (escopo via customer_invoices.tenant_id)
-- ---------------------------------------------------------------------------
ALTER TABLE public.customer_invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_invoice_items_tenant_policy ON public.customer_invoice_items;
CREATE POLICY customer_invoice_items_tenant_policy ON public.customer_invoice_items
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1
      FROM public.customer_invoices ci
      WHERE ci.id = customer_invoice_items.invoice_id
        AND public.app_tenant_visible(ci.tenant_id)
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1
      FROM public.customer_invoices ci
      WHERE ci.id = customer_invoice_items.invoice_id
        AND ci.tenant_id IS NOT NULL
        AND ci.tenant_id = public.app_current_tenant_id()
    )
  );

COMMENT ON POLICY client_timeline_events_tenant_policy ON public.client_timeline_events IS 'Etapa 2 RLS: isolamento por tenant_id.';
COMMENT ON POLICY subscriptions_tenant_policy ON public.subscriptions IS 'Etapa 2 RLS: isolamento por tenant_id.';
COMMENT ON POLICY payment_customers_tenant_policy ON public.payment_customers IS 'Etapa 2 RLS: isolamento por tenant_id.';
COMMENT ON POLICY billing_recurring_jobs_tenant_policy ON public.billing_recurring_jobs IS 'Etapa 2 RLS: isolamento por tenant_id.';
COMMENT ON POLICY customer_invoice_items_tenant_policy ON public.customer_invoice_items IS 'Etapa 2 RLS: visível se fatura pai pertence ao tenant da sessão.';
