-- Fase 3 — Compra no cartão: modo de valor (total vs valor da parcela).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'financial_credit_card_purchases'
      AND column_name = 'amount_mode'
  ) THEN
    ALTER TABLE public.financial_credit_card_purchases
      ADD COLUMN amount_mode TEXT NOT NULL DEFAULT 'total'
      CHECK (amount_mode IN ('total', 'installment'));
  END IF;
END $$;
