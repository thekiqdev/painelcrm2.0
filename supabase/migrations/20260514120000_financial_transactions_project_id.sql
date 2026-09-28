-- Liga movimentos unificados a projetos (despesas do projeto → contas a pagar / entradas e saídas).

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS project_id UUID NULL REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_project_id
  ON public.financial_transactions (tenant_id, project_id)
  WHERE project_id IS NOT NULL;
