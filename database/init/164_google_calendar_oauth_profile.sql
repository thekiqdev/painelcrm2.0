-- Perfil Google (nome / foto) na conexão Calendar OAuth (opcional; userinfo / id_token)

ALTER TABLE public.google_calendar_connections
  ADD COLUMN IF NOT EXISTS google_name TEXT,
  ADD COLUMN IF NOT EXISTS google_picture TEXT;

COMMENT ON COLUMN public.google_calendar_connections.google_name IS 'Nome do perfil Google (OAuth userinfo / id_token)';
COMMENT ON COLUMN public.google_calendar_connections.google_picture IS 'URL da foto de perfil Google (OAuth userinfo / id_token)';
