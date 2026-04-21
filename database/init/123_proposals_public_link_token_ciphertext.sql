-- Token público atual cifrado para o CRM reconstruir a URL (sem expor hash-only).
-- Criptografia no app com a mesma chave usada para secrets de webhook (PROPOSAL_WEBHOOK_SECRET_KEY).
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS public_link_token_ciphertext TEXT;

COMMENT ON COLUMN public.proposals.public_link_token_ciphertext IS
  'Token cru do link público cifrado (AES-256-GCM). Apenas API autenticada reconstrói /proposal-view/...';
