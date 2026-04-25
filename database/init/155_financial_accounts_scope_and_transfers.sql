-- Contas pessoais/empresariais + transferências internas entre contas.

ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS account_scope TEXT NOT NULL DEFAULT 'business'
  CHECK (account_scope IN ('business', 'personal'));

CREATE INDEX IF NOT EXISTS idx_financial_accounts_tenant_scope
  ON public.financial_accounts (tenant_id, account_scope);

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS transaction_kind TEXT NOT NULL DEFAULT 'regular'
  CHECK (transaction_kind IN ('regular', 'transfer'));

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS transfer_direction TEXT NULL
  CHECK (transfer_direction IS NULL OR transfer_direction IN ('in', 'out'));

CREATE TABLE IF NOT EXISTS public.financial_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  to_account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  transfer_date DATE NOT NULL,
  description TEXT NULL,
  out_transaction_id UUID NULL REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  in_transaction_id UUID NULL REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_account_id <> to_account_id)
);

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS transfer_id UUID NULL REFERENCES public.financial_transfers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_transfer_id
  ON public.financial_transactions (transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_kind
  ON public.financial_transactions (tenant_id, transaction_kind, transaction_date);

CREATE INDEX IF NOT EXISTS idx_financial_transfers_tenant_date
  ON public.financial_transfers (tenant_id, transfer_date DESC);

CREATE INDEX IF NOT EXISTS idx_financial_transfers_from_account
  ON public.financial_transfers (from_account_id, transfer_date DESC);

CREATE INDEX IF NOT EXISTS idx_financial_transfers_to_account
  ON public.financial_transfers (to_account_id, transfer_date DESC);

DROP TRIGGER IF EXISTS financial_transfers_updated_at ON public.financial_transfers;
CREATE TRIGGER financial_transfers_updated_at
  BEFORE UPDATE ON public.financial_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.financial_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_transfers_tenant_policy ON public.financial_transfers;
CREATE POLICY financial_transfers_tenant_policy ON public.financial_transfers
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

