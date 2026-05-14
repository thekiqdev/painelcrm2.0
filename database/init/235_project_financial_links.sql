-- Fase: vínculo financeiro real do projeto
-- Liga faturas oficiais (customer_invoices) e despesas do módulo financeiro
-- profissional (finance_expense_entries) ao projeto sem alterar fluxos globais.

ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS project_id UUID NULL REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_invoices_project_id
  ON public.customer_invoices(project_id);

ALTER TABLE public.finance_expense_entries
  ADD COLUMN IF NOT EXISTS project_id UUID NULL REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_expense_entries_project_id
  ON public.finance_expense_entries(project_id);
