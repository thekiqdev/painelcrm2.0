-- Alinha trial_days com a vitrine legada (is_free + free_access_days) quando trial_days ainda está 0.
-- Objetivo: planos “X dias grátis” passam a ter trial de checkout explícito sem depender só do flag is_free.
-- Revisar em produção se existir plano is_free verdadeiramente permanente (sem conversão paga): ajustar manualmente trial_days = 0 nesses casos.

UPDATE public.plans
SET trial_days = free_access_days
WHERE is_active = true
  AND is_free = true
  AND free_access_days IS NOT NULL
  AND free_access_days >= 1
  AND trial_days = 0;
