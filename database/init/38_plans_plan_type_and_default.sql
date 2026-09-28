-- Planos personalizados e plano padrão (Fase 1 - Modelo de dados)
-- plan_type: 'standard' = preço fixo e limites fixos; 'custom' = preço por usuário, quantidade definida por tenant
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (plan_type IN ('standard', 'custom'));

-- is_default: plano atribuído em novos cadastros no site (apenas um por vez; lógica na aplicação)
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_plans_is_default_true
  ON public.plans(is_default)
  WHERE is_default = true;

COMMENT ON COLUMN public.plans.plan_type IS 'standard = preço fixo e limites fixos; custom = preço por usuário, quantidade por tenant';
COMMENT ON COLUMN public.plans.is_default IS 'Se true, este plano é atribuído a novos cadastros no site (apenas um plano deve ser padrão)';
