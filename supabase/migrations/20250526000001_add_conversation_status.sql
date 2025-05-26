
-- Adicionar campos para status de atendimento nas conversas
ALTER TABLE whatsapp_connections 
ADD COLUMN IF NOT EXISTS conversation_status jsonb DEFAULT '{}';

-- Criar tabela para controle de conversas atendidas
CREATE TABLE IF NOT EXISTS conversation_attendances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    connection_id uuid NOT NULL REFERENCES whatsapp_connections(id),
    remote_jid text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attendant_id uuid REFERENCES auth.users(id),
    attended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(user_id, connection_id, remote_jid)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_conversation_attendances_user_id ON conversation_attendances(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_attendances_status ON conversation_attendances(status);
CREATE INDEX IF NOT EXISTS idx_conversation_attendances_remote_jid ON conversation_attendances(remote_jid);
