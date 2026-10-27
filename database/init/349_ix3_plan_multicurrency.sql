-- IX Sprint 3 — planos por moeda (BRL, USD, EUR) + traduções de catálogo.
-- plans.price_cents permanece o preço de lista BRL do plano standard.
-- USD/EUR standard: plan_currency_prices. Custom: plan_interval_prices.currency.

ALTER TABLE public.plan_interval_prices
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL';

UPDATE public.plan_interval_prices
SET currency = 'BRL'
WHERE currency IS NULL OR btrim(currency) = '';

ALTER TABLE public.plan_interval_prices
  DROP CONSTRAINT IF EXISTS plan_interval_prices_plan_id_billing_interval_key;

ALTER TABLE public.plan_interval_prices
  DROP CONSTRAINT IF EXISTS plan_interval_prices_currency_check;

ALTER TABLE public.plan_interval_prices
  ADD CONSTRAINT plan_interval_prices_currency_check
  CHECK (currency IN ('BRL', 'USD', 'EUR'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plan_interval_prices_plan_interval_currency_key'
  ) THEN
    ALTER TABLE public.plan_interval_prices
      ADD CONSTRAINT plan_interval_prices_plan_interval_currency_key
      UNIQUE (plan_id, billing_interval, currency);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_plan_interval_prices_plan_currency
  ON public.plan_interval_prices (plan_id, currency);

COMMENT ON COLUMN public.plan_interval_prices.currency IS
  'IX3: moeda do preço por intervalo (BRL|USD|EUR). Linhas legadas = BRL.';

CREATE TABLE IF NOT EXISTS public.plan_currency_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('BRL', 'USD', 'EUR')),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_currency_prices_plan_currency_key UNIQUE (plan_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_plan_currency_prices_plan_id
  ON public.plan_currency_prices (plan_id);

CREATE TRIGGER update_plan_currency_prices_updated_at
  BEFORE UPDATE ON public.plan_currency_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.plan_currency_prices IS
  'IX3: preço de lista por moeda para planos standard (USD/EUR). BRL usa plans.price_cents.';

CREATE TABLE IF NOT EXISTS public.plan_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('pt-BR', 'en', 'es')),
  name TEXT,
  description TEXT,
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_translations_plan_locale_key UNIQUE (plan_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_plan_translations_plan_id
  ON public.plan_translations (plan_id);

CREATE TRIGGER update_plan_translations_updated_at
  BEFORE UPDATE ON public.plan_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.plan_translations IS
  'IX3: nome/descrição/benefícios por locale. Sem linha = fallback para plans.* (pt-BR).';
