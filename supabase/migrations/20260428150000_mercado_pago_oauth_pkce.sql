-- PKCE (Mercado Pago OAuth) — espelho de database/init/181_mercado_pago_oauth_pkce.sql

CREATE TABLE IF NOT EXISTS public.mercado_pago_oauth_pkce_challenges (
  nonce text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  code_verifier_ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mercado_pago_pkce_expires
  ON public.mercado_pago_oauth_pkce_challenges (expires_at);
