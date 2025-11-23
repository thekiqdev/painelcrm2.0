-- Create evolution_api_configs table
CREATE TABLE IF NOT EXISTS public.evolution_api_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  global_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create evolution_servers table
CREATE TABLE IF NOT EXISTS public.evolution_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  server_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create whatsapp_connections table
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT,
  instance_name TEXT,
  phone_number TEXT,
  type TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  qr_code TEXT,
  webhook_url TEXT,
  config_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create conversation_attendances table
CREATE TABLE IF NOT EXISTS public.conversation_attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  remote_jid TEXT NOT NULL,
  status TEXT NOT NULL,
  attendant_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  attended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(connection_id, remote_jid)
);

-- Create whatsapp_webhook_events table
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  connection_name TEXT NOT NULL,
  event_data JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_evolution_api_configs_user_id ON public.evolution_api_configs(user_id);
CREATE INDEX idx_evolution_servers_user_id ON public.evolution_servers(user_id);
CREATE INDEX idx_whatsapp_connections_user_id ON public.whatsapp_connections(user_id);
CREATE INDEX idx_conversation_attendances_connection_id ON public.conversation_attendances(connection_id);
CREATE INDEX idx_conversation_attendances_user_id ON public.conversation_attendances(user_id);
CREATE INDEX idx_whatsapp_webhook_events_user_id ON public.whatsapp_webhook_events(user_id);
CREATE INDEX idx_whatsapp_webhook_events_connection_name ON public.whatsapp_webhook_events(connection_name);

-- Create triggers for updated_at
CREATE TRIGGER update_evolution_api_configs_updated_at
  BEFORE UPDATE ON public.evolution_api_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_evolution_servers_updated_at
  BEFORE UPDATE ON public.evolution_servers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_connections_updated_at
  BEFORE UPDATE ON public.whatsapp_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversation_attendances_updated_at
  BEFORE UPDATE ON public.conversation_attendances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create helper functions for conversation status
CREATE OR REPLACE FUNCTION public.get_conversation_status(
  p_connection_id UUID,
  p_remote_jid TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  connection_id UUID,
  remote_jid TEXT,
  status TEXT,
  attendant_id UUID,
  attended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ca.id,
    ca.connection_id,
    ca.remote_jid,
    ca.status,
    ca.attendant_id,
    ca.attended_at,
    ca.created_at,
    ca.updated_at,
    ca.user_id
  FROM public.conversation_attendances ca
  WHERE ca.connection_id = p_connection_id
    AND ca.remote_jid = p_remote_jid
    AND ca.user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_all_conversation_statuses(
  p_connection_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  connection_id UUID,
  remote_jid TEXT,
  status TEXT,
  attendant_id UUID,
  attended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ca.id,
    ca.connection_id,
    ca.remote_jid,
    ca.status,
    ca.attendant_id,
    ca.attended_at,
    ca.created_at,
    ca.updated_at,
    ca.user_id
  FROM public.conversation_attendances ca
  WHERE ca.connection_id = p_connection_id
    AND ca.user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.upsert_conversation_status(
  p_connection_id UUID,
  p_remote_jid TEXT,
  p_status TEXT,
  p_user_id UUID,
  p_attendant_id UUID DEFAULT NULL,
  p_attended_at TIMESTAMPTZ DEFAULT NULL,
  p_updated_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  id UUID,
  connection_id UUID,
  remote_jid TEXT,
  status TEXT,
  attendant_id UUID,
  attended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_record RECORD;
BEGIN
  INSERT INTO public.conversation_attendances (
    connection_id,
    remote_jid,
    status,
    user_id,
    attendant_id,
    attended_at,
    updated_at
  )
  VALUES (
    p_connection_id,
    p_remote_jid,
    p_status,
    p_user_id,
    p_attendant_id,
    p_attended_at,
    p_updated_at
  )
  ON CONFLICT (connection_id, remote_jid)
  DO UPDATE SET
    status = EXCLUDED.status,
    attendant_id = COALESCE(EXCLUDED.attendant_id, conversation_attendances.attendant_id),
    attended_at = COALESCE(EXCLUDED.attended_at, conversation_attendances.attended_at),
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO result_record;

  RETURN QUERY SELECT * FROM public.conversation_attendances WHERE id = result_record.id;
END;
$$;


