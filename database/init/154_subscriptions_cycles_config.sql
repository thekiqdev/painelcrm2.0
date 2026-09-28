-- Assinaturas CRM: ciclos ilimitados vs quantidade máxima (relatórios / projeção; não altera motor de geração).

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cycles_unlimited BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS max_cycles INT NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_cycles_max_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_cycles_max_check CHECK (
    (cycles_unlimited = true AND max_cycles IS NULL)
    OR (cycles_unlimited = false AND max_cycles IS NOT NULL AND max_cycles > 0)
  );

UPDATE public.subscriptions
SET max_cycles = NULL
WHERE cycles_unlimited = true AND max_cycles IS NOT NULL;

COMMENT ON COLUMN public.subscriptions.cycles_unlimited IS
  'Se true, assinatura sem limite de ciclos de cobrança; max_cycles deve ser NULL.';
COMMENT ON COLUMN public.subscriptions.max_cycles IS
  'Quando cycles_unlimited=false: número total de cobranças/ciclos previstos (inclui faturas já emitidas).';
