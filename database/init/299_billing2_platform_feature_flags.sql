-- Billing 2.0 — Feature Flags no registry Super Admin (platform_feature_flags).
-- Precedência de resolução (facade billingFeatureFlags): DB → env → default catálogo.
-- Seeds usam os MESMOS defaults do PRD §18 / Implementation Plan (sem ativar engine/automações destrutivas).

INSERT INTO public.platform_feature_flags
  (key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode)
VALUES
  ('billing2.card_auto_renew', 'billing2', 'Billing 2.0 — Renovação automática por cartão', false, NULL, 'off', 0, false),
  ('billing2.pix_automatic', 'billing2', 'Billing 2.0 — PIX Automático (BACEN)', false, NULL, 'off', 0, false),
  ('billing2.pix_auto_generate', 'billing2', 'Billing 2.0 — Gerar PIX automaticamente (avulso)', true, NULL, 'global', 100, false),
  ('billing2.whatsapp_charge_notify', 'billing2', 'Billing 2.0 — WhatsApp cobrança', true, NULL, 'global', 100, false),
  ('billing2.email_charge_notify', 'billing2', 'Billing 2.0 — Email cobrança', true, NULL, 'global', 100, false),
  ('billing2.auto_suspend', 'billing2', 'Billing 2.0 — Suspensão automática', false, NULL, 'off', 0, false),
  ('billing2.auto_cancel', 'billing2', 'Billing 2.0 — Cancelamento automático', false, NULL, 'off', 0, false),
  ('billing2.auto_reactivate', 'billing2', 'Billing 2.0 — Reativação automática', true, NULL, 'global', 100, false),
  ('billing2.reconciliation_auto', 'billing2', 'Billing 2.0 — Reconciliação automática', true, NULL, 'global', 100, false),
  ('billing2.detailed_logs', 'billing2', 'Billing 2.0 — Logs detalhados', true, NULL, 'global', 100, false),
  ('billing2.collection_policy_engine_enabled', 'billing2', 'Billing 2.0 — Collection Policy Engine', false, NULL, 'off', 0, false),
  ('billing2.past_due_writer_enabled', 'billing2', 'Billing 2.0 — Writer past_due', false, NULL, 'off', 0, false),
  ('billing2.dashboard_mrr_contracted', 'billing2', 'Billing 2.0 — Dashboard MRR contratado', false, NULL, 'off', 0, false),
  ('billing2.reconciliation_l2_enabled', 'billing2', 'Billing 2.0 — Reconciliação L2 getPayment', false, NULL, 'off', 0, false),
  ('billing2.dunning_enabled', 'billing2', 'Billing 2.0 — Dunning / Recovery', false, NULL, 'off', 0, false),
  ('billing2.collection_policy_db_read', 'billing2', 'Billing 2.0 — Ler Collection Policy do banco', true, NULL, 'global', 100, false)
ON CONFLICT (key) DO NOTHING;
