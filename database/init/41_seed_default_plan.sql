-- Fase 4: Garantir que exista exatamente um plano padrão (para novos cadastros no site).
-- Se nenhum plano tiver is_default = true, marca o primeiro plano ativo por sort_order como padrão.

UPDATE public.plans
SET is_default = true
WHERE id = (
  SELECT id FROM public.plans
  WHERE is_active = true
  ORDER BY sort_order ASC, name ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.plans WHERE is_default = true
);

COMMENT ON COLUMN public.plans.is_default IS 'Se true, este plano é atribuído a novos cadastros no site (apenas um plano deve ser padrão)';
