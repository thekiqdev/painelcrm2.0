-- IX4 — Stripe da plataforma (USD/EUR). Asaas/BRL inalterado.
-- Catálogo stripe permanece is_enabled como o ops deixou (302 não força ON).

ALTER TABLE public.plan_currency_prices
  ADD COLUMN IF NOT EXISTS stripe_product_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

ALTER TABLE public.plan_interval_prices
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_stripe_subscription_id
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stripe_platform_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.plan_currency_prices.stripe_price_id IS
  'IX4: Price Stripe do preço de lista USD/EUR. BRL não usa.';
COMMENT ON COLUMN public.subscriptions.stripe_subscription_id IS
  'IX4: Subscription Stripe da assinatura SaaS em USD/EUR. Não mistura com Asaas.';

UPDATE public.payment_gateways
SET
  name = 'Stripe',
  description = 'IX4 — Stripe da plataforma para assinatura SaaS em USD/EUR. Exige billing2.multi_gateway e credencial global. BRL continua no Asaas.',
  credentials_schema = '{"secret_key":"required","webhook_secret":"required","env":"sandbox|production"}'::jsonb,
  updated_at = now()
WHERE key = 'stripe';
