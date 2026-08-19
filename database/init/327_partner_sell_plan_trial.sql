-- M5 — teste grátis nos planos de venda do Partner

ALTER TABLE public.partner_sell_plans
  ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 0
    CHECK (trial_days >= 0 AND trial_days <= 365);

COMMENT ON COLUMN public.partner_sell_plans.trial_days IS
  'Dias de teste grátis oferecidos pelo Partner ao cliente (0 = sem trial). Licença bancada pelo Partner (D13).';
