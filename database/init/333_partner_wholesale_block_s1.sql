-- M5-W Block Sprint 1 — dias após vencimento para freeze Partner wholesale
-- Config em superadmin_settings (sem coluna nova).

INSERT INTO public.superadmin_settings (key, value, updated_at)
VALUES ('partner_wholesale_block_after_days', '3', now())
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.superadmin_settings IS
  'Inclui partner_wholesale_block_after_days: dias após due_date para past_due/freeze do canal Partner.';
