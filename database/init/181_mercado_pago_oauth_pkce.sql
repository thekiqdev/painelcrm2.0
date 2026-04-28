-- PKCE (Mercado Pago OAuth): armazena code_verifier cifrado por nonce do state até o callback.
-- Expira em poucos minutos; não substitui tokens OAuth do tenant.

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

COMMENT ON TABLE public.mercado_pago_oauth_pkce_challenges IS 'PKCE OAuth MP: code_verifier (AES-GCM) keyed por nonce do signed state; TTL curto.';
