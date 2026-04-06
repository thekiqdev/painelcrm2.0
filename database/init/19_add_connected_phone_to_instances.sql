-- Adicionar colunas connected_phone e phone_key na tabela chat_instances
-- phone_key é uma chave única baseada em user_id + normalized_phone
ALTER TABLE public.chat_instances
  ADD COLUMN IF NOT EXISTS connected_phone TEXT;

ALTER TABLE public.chat_instances
  ADD COLUMN IF NOT EXISTS phone_key TEXT;

-- Criar índice para melhorar performance nas buscas por número conectado
CREATE INDEX IF NOT EXISTS idx_chat_instances_connected_phone 
  ON public.chat_instances(connected_phone) 
  WHERE connected_phone IS NOT NULL;

-- Criar índice único para phone_key (garante uma instância ativa por número por usuário)
-- NOTA: Usamos índice parcial para permitir NULL (instâncias não conectadas ainda)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_instances_phone_key_unique 
  ON public.chat_instances(user_id, phone_key) 
  WHERE phone_key IS NOT NULL;

-- Criar índice composto para buscar instâncias ativas por número
CREATE INDEX IF NOT EXISTS idx_chat_instances_user_phone_status 
  ON public.chat_instances(user_id, connected_phone, status) 
  WHERE connected_phone IS NOT NULL;

-- Adicionar coluna phone_key na tabela chat_conversations
-- Vincula conversas à chave única do número conectado
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS phone_key TEXT;

-- Criar índice para melhorar performance nas buscas por phone_key
CREATE INDEX IF NOT EXISTS idx_chat_conversations_phone_key 
  ON public.chat_conversations(phone_key) 
  WHERE phone_key IS NOT NULL;

-- Criar índice composto para buscar conversas por user_id e phone_key
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_phone_key 
  ON public.chat_conversations(user_id, phone_key) 
  WHERE phone_key IS NOT NULL;

