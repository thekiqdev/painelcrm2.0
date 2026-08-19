-- M5 — vínculo do customer_tenant ao plano de venda do Partner (upgrade/downgrade)

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS partner_sell_plan_id UUID
    REFERENCES public.partner_sell_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_partner_sell_plan_id
  ON public.tenants (partner_sell_plan_id)
  WHERE partner_sell_plan_id IS NOT NULL;

COMMENT ON COLUMN public.tenants.partner_sell_plan_id IS
  'Plano de venda do Partner associado ao customer_tenant (upgrade/downgrade no painel)';
