-- Script para corrigir last_message_at e last_message_preview nas conversas existentes
-- Atualiza com base na última mensagem real de cada conversa

UPDATE chat_conversations c
SET
  last_message_at = subquery.max_sent_at,
  last_message_preview = subquery.last_body,
  updated_at = now()
FROM (
  SELECT 
    conversation_id,
    MAX(sent_at) as max_sent_at,
    (SELECT body 
     FROM chat_messages m2 
     WHERE m2.conversation_id = m.conversation_id 
       AND m2.sent_at = MAX(m.sent_at)
     ORDER BY m2.created_at DESC
     LIMIT 1) as last_body
  FROM chat_messages m
  WHERE m.sent_at IS NOT NULL
  GROUP BY conversation_id
) AS subquery
WHERE c.id = subquery.conversation_id
  AND (
    -- Atualizar apenas se a última mensagem real for mais recente que o last_message_at atual
    c.last_message_at IS NULL 
    OR subquery.max_sent_at > c.last_message_at
    -- Ou se o preview estiver desatualizado
    OR (c.last_message_preview IS NULL AND subquery.last_body IS NOT NULL)
  );

-- Criar índice para melhorar performance na busca da última mensagem
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_sent_at 
  ON chat_messages(conversation_id, sent_at DESC NULLS LAST);

-- Log de quantas conversas foram atualizadas
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Conversas atualizadas: %', updated_count;
END $$;

