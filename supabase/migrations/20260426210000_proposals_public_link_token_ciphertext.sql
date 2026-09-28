-- Sincroniza com database/init/123_proposals_public_link_token_ciphertext.sql
-- Necessário para publicar proposta (PATCH draft→sent) e persistir token do link público.
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS public_link_token_ciphertext TEXT;

COMMENT ON COLUMN public.proposals.public_link_token_ciphertext IS
  'Token cru do link público cifrado (AES-256-GCM). Apenas API autenticada reconstrói /proposal-view/...';
