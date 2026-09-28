-- Avatar de perfil em users: fallback quando profiles.avatar_url (migração 157) ainda não existe.
-- Permite POST /api/me/profile/avatar gravar a URL sem alterar a tabela profiles.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.users.avatar_url IS 'URL da foto do utilizador; usado se profiles.avatar_url não existir. Após 157, preferir COALESCE(profiles, users).';
