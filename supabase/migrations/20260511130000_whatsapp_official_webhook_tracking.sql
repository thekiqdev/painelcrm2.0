-- Rastreio opcional da configuração do webhook Meta (Cloud API) na conta Super Admin
ALTER TABLE public.whatsapp_official_accounts
  ADD COLUMN IF NOT EXISTS webhook_status TEXT,
  ADD COLUMN IF NOT EXISTS webhook_last_configured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_last_error TEXT;

COMMENT ON COLUMN public.whatsapp_official_accounts.webhook_status IS 'Último estado conhecido da tentativa de webhook (ex.: manual_required, graph_ok, graph_error).';
COMMENT ON COLUMN public.whatsapp_official_accounts.webhook_last_configured_at IS 'Última tentativa automática de registo do callback na Graph API.';
COMMENT ON COLUMN public.whatsapp_official_accounts.webhook_last_error IS 'Última mensagem de erro da Graph API ou de validação local.';
