-- Benefícios personalizados do plano: ícone + texto (ex.: "10 usuários", "WhatsApp integrado")
-- Formato: [{"icon": "Users", "label": "10 usuários"}, ...]

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS benefits JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.plans.benefits IS 'Lista de benefícios exibíveis do plano: array de { icon: string (nome Lucide), label: string }';
CREATE INDEX IF NOT EXISTS idx_plans_benefits ON public.plans USING GIN (benefits);
