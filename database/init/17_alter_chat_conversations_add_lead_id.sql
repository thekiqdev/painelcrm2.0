-- Adicionar coluna lead_id na tabela chat_conversations para vincular conversas a leads
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- Criar índice para melhorar performance nas buscas por lead_id
CREATE INDEX IF NOT EXISTS idx_chat_conversations_lead_id ON public.chat_conversations(lead_id);

-- Criar índice para melhorar performance nas buscas por client_id (se ainda não existir)
CREATE INDEX IF NOT EXISTS idx_chat_conversations_client_id ON public.chat_conversations(client_id);

-- Criar índice para melhorar performance nas buscas por telefone normalizado
CREATE INDEX IF NOT EXISTS idx_chat_conversations_phone_number ON public.chat_conversations(phone_number);

