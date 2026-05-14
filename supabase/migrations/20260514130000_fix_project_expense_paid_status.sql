-- Despesas de projeto marcadas como pagas no formulário (metadata) mas gravadas como pending no movimento unificado.

UPDATE public.financial_transactions t
SET status = 'completed', updated_at = now()
WHERE t.type = 'expense'
  AND COALESCE(t.transaction_kind, 'regular') = 'regular'
  AND t.status = 'pending'
  AND (t.metadata->>'project_expense') = 'true'
  AND (t.metadata->>'expense_ui_status') = 'paid';
