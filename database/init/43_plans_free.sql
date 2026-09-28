-- Plano grátis: limite de dias de acesso. Ao fim do período o usuário é direcionado para contratação.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_access_days INTEGER NULL;

COMMENT ON COLUMN public.plans.is_free IS 'Se true, o plano é grátis e tem acesso limitado por free_access_days';
COMMENT ON COLUMN public.plans.free_access_days IS 'Dias de acesso ao sistema quando is_free = true; ao fim, o usuário é direcionado para contratação';
