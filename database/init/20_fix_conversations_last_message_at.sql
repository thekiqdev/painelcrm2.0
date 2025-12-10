-- Script para corrigir last_message_at e last_message_preview nas conversas existentes
-- Atualiza com base na última mensagem real de cada conversa

-- Primeiro, atualizar last_message_at com a data da última mensagem
UPDATE chat_conversations c
SET 
  last_message_at = (
    SELECT MAX(sent_at)
    FROM chat_messages m
    WHERE m.conversation_id = c.id
      AND m.sent_at IS NOT NULL
  ),
  last_message_preview = (
    SELECT body
    FROM chat_messages m
    WHERE m.conversation_id = c.id
      AND m.sent_at IS NOT NULL
      AND m.body IS NOT NULL
      AND m.body <> ''
    ORDER BY m.sent_at DESC, m.created_at DESC
    LIMIT 1
  ),
  updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM chat_messages m
  WHERE m.conversation_id = c.id
    AND m.sent_at IS NOT NULL
)
AND (
  -- Atualizar apenas se last_message_at estiver NULL ou mais antigo que a última mensagem
  c.last_message_at IS NULL
  OR c.last_message_at < (
    SELECT MAX(sent_at)
    FROM chat_messages m
    WHERE m.conversation_id = c.id
      AND m.sent_at IS NOT NULL
  )
);

-- Log de quantas conversas foram atualizadas
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Conversas atualizadas: %', updated_count;
END $$;
