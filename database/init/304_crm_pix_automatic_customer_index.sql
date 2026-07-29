-- CRM1 — índice Pix Automático para subscriptions type=customer (colunas já em 301).

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_pix_auto_auth
  ON public.subscriptions (tenant_id, customer_id)
  WHERE type = 'customer'
    AND pix_automatic_authorization_id IS NOT NULL
    AND pix_automatic_auth_status = 'active';

COMMENT ON INDEX public.idx_subscriptions_customer_pix_auto_auth IS
  'CRM1 — lookup auth Pix Automático ativa em assinaturas de clientes do tenant.';
