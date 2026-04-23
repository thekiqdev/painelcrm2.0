-- Toggles globais do Motor de Notificações (Super Admin → superadmin_settings).
-- Defaults true para facilitar testes; controlo operacional via painel (não depende de .env).

INSERT INTO public.superadmin_settings (key, value, updated_at)
VALUES
  ('notifications_engine_enabled', 'true', now()),
  ('notifications_engine_business_events_enabled', 'true', now()),
  ('notifications_engine_whatsapp_send_enabled', 'true', now())
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.superadmin_settings.value IS
  'Valor textual da chave. Para flags do motor de notificações: ''true'' / ''false''.';
