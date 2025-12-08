-- Migration 18: Migrar chat para modelo baseado em número de telefone
-- Chave única: (user_id, instance_phone_normalizado, contact_phone_normalizado)

-- 1. Adicionar coluna connected_phone_number na tabela chat_instances
ALTER TABLE chat_instances 
  ADD COLUMN IF NOT EXISTS connected_phone_number TEXT;

-- 2. Extrair número conectado do metadata existente (se houver)
UPDATE chat_instances 
SET connected_phone_number = 
  CASE 
    WHEN metadata->>'phone' IS NOT NULL AND metadata->>'phone' <> '' THEN regexp_replace(metadata->>'phone', '\D', '', 'g')
    WHEN metadata->>'connectedPhone' IS NOT NULL AND metadata->>'connectedPhone' <> '' THEN regexp_replace(metadata->>'connectedPhone', '\D', '', 'g')
    WHEN metadata->>'number' IS NOT NULL AND metadata->>'number' <> '' THEN regexp_replace(metadata->>'number', '\D', '', 'g')
    WHEN metadata->'lastConnect'->>'phone' IS NOT NULL AND metadata->'lastConnect'->>'phone' <> '' THEN regexp_replace(metadata->'lastConnect'->>'phone', '\D', '', 'g')
    ELSE NULL
  END
WHERE connected_phone_number IS NULL;

-- 3. Adicionar colunas na tabela chat_conversations
ALTER TABLE chat_conversations 
  ADD COLUMN IF NOT EXISTS instance_phone_normalizado TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone_normalizado TEXT;

-- 4. Popular colunas normalizadas com valores existentes
UPDATE chat_conversations c
SET 
  instance_phone_normalizado = regexp_replace(COALESCE(i.connected_phone_number, ''), '\D', '', 'g'),
  contact_phone_normalizado = regexp_replace(COALESCE(c.phone_number, ''), '\D', '', 'g')
FROM chat_instances i
WHERE c.instance_id = i.id
  AND (c.instance_phone_normalizado IS NULL OR c.contact_phone_normalizado IS NULL);

-- 5. Remover constraint antiga (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chat_conversations_instance_id_external_chat_id_key'
  ) THEN
    ALTER TABLE chat_conversations 
      DROP CONSTRAINT chat_conversations_instance_id_external_chat_id_key;
  END IF;
END $$;

-- 6. Criar nova constraint única baseada em user_id + instance_phone + contact_phone
-- Usando índice único parcial para permitir NULLs temporariamente
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conversations_user_instance_contact_phone 
  ON chat_conversations(user_id, instance_phone_normalizado, contact_phone_normalizado) 
  WHERE instance_phone_normalizado IS NOT NULL 
    AND instance_phone_normalizado <> ''
    AND contact_phone_normalizado IS NOT NULL 
    AND contact_phone_normalizado <> '';

-- 7. Criar índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_chat_conversations_instance_phone 
  ON chat_conversations(instance_phone_normalizado) 
  WHERE instance_phone_normalizado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_contact_phone 
  ON chat_conversations(contact_phone_normalizado) 
  WHERE contact_phone_normalizado IS NOT NULL;

-- 8. Consolidar conversas duplicadas (mesmo user_id + instance_phone + contact_phone, diferentes instance_id)
-- Manter a conversa mais antiga e migrar mensagens
DO $$
DECLARE
  dup_record RECORD;
  target_conv_id UUID;
  source_conv_ids UUID[];
BEGIN
  FOR dup_record IN 
    SELECT 
      user_id,
      instance_phone_normalizado,
      contact_phone_normalizado,
      array_agg(id ORDER BY created_at) as conversation_ids,
      min(created_at) as oldest_created_at
    FROM chat_conversations
    WHERE instance_phone_normalizado IS NOT NULL 
      AND instance_phone_normalizado <> ''
      AND contact_phone_normalizado IS NOT NULL 
      AND contact_phone_normalizado <> ''
    GROUP BY user_id, instance_phone_normalizado, contact_phone_normalizado
    HAVING count(*) > 1
  LOOP
    -- Pegar a primeira conversa (mais antiga) como target
    SELECT id INTO target_conv_id 
    FROM chat_conversations 
    WHERE user_id = dup_record.user_id 
      AND instance_phone_normalizado = dup_record.instance_phone_normalizado
      AND contact_phone_normalizado = dup_record.contact_phone_normalizado
    ORDER BY created_at ASC 
    LIMIT 1;
    
    -- Pegar IDs das outras conversas para migrar
    SELECT array_agg(id) INTO source_conv_ids
    FROM chat_conversations
    WHERE user_id = dup_record.user_id 
      AND instance_phone_normalizado = dup_record.instance_phone_normalizado
      AND contact_phone_normalizado = dup_record.contact_phone_normalizado
      AND id != target_conv_id;
    
    -- Migrar mensagens das conversas duplicadas para a conversa principal
    UPDATE chat_messages
    SET conversation_id = target_conv_id
    WHERE conversation_id = ANY(source_conv_ids);
    
    -- Atualizar a conversa principal com dados mais recentes
    UPDATE chat_conversations c
    SET 
      instance_id = COALESCE(
        (SELECT instance_id 
         FROM chat_conversations 
         WHERE id = ANY(source_conv_ids)
         ORDER BY last_message_at DESC NULLS LAST, updated_at DESC
         LIMIT 1),
        c.instance_id
      ),
      external_fast_id = COALESCE(
        (SELECT external_fast_id FROM chat_conversations WHERE id = ANY(source_conv_ids) AND external_fast_id IS NOT NULL LIMIT 1),
        c.external_fast_id
      ),
      contact_name = COALESCE(
        (SELECT contact_name FROM chat_conversations WHERE id = ANY(source_conv_ids) AND contact_name IS NOT NULL LIMIT 1),
        c.contact_name
      ),
      profile_name = COALESCE(
        (SELECT profile_name FROM chat_conversations WHERE id = ANY(source_conv_ids) AND profile_name IS NOT NULL LIMIT 1),
        c.profile_name
      ),
      last_message_preview = COALESCE(
        (SELECT last_message_preview FROM chat_conversations WHERE id = ANY(source_conv_ids) AND last_message_preview IS NOT NULL ORDER BY last_message_at DESC LIMIT 1),
        c.last_message_preview
      ),
      last_message_at = GREATEST(
        c.last_message_at,
        (SELECT MAX(last_message_at) FROM chat_conversations WHERE id = ANY(source_conv_ids))
      ),
      unread_count = (
        SELECT COALESCE(SUM(unread_count), 0) FROM chat_conversations WHERE id = ANY(source_conv_ids) OR id = target_conv_id
      ),
      updated_at = now()
    WHERE id = target_conv_id;
    
    -- Deletar conversas duplicadas
    DELETE FROM chat_conversations WHERE id = ANY(source_conv_ids);
  END LOOP;
END $$;

-- 9. Criar índice composto para melhorar performance nas buscas
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_instance_contact 
  ON chat_conversations(user_id, instance_phone_normalizado, contact_phone_normalizado);

