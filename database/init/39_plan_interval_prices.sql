-- Preços por intervalo para planos personalizados (custom)
-- Permite valor por usuário diferente para mensal, trimestral, semestral e anual
CREATE TABLE IF NOT EXISTS public.plan_interval_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'quarterly', 'semi_annual', 'yearly')),
  price_per_user_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, billing_interval)
);

CREATE INDEX IF NOT EXISTS idx_plan_interval_prices_plan_id ON public.plan_interval_prices(plan_id);

CREATE TRIGGER update_plan_interval_prices_updated_at
  BEFORE UPDATE ON public.plan_interval_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.plan_interval_prices IS 'Preço por usuário por intervalo de cobrança; usado em planos do tipo custom';
