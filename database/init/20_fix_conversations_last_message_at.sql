-- Script para corrigir last_message_at e last_message_preview nas conversas existentes
-- Atualiza com base na última mensagem real de cada conversa

-- Primeiro, criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_sent_at 
  ON chat_messages(conversation_id, sent_at DESC NULLS LAST);

-- Atualizar last_message_at e last_message_preview com base na última mensagem real
UPDATE chat_conversations c
SET
  last_message_at = latest_msg.max_sent_at,
  last_message_preview = latest_msg.last_body,
  updated_at = now()
FROM (
  SELECT 
    m.conversation_id,
    MAX(m.sent_at) as max_sent_at,
    (
      SELECT m2.body 
      FROM chat_messages m2 
      WHERE m2.conversation_id = m.conversation_id 
        AND m2.sent_at = MAX(m.sent_at)
        AND m2.body IS NOT NULL
        AND m2.body <> ''
      ORDER BY m2.created_at DESC
      LIMIT 1
    ) as last_body
  FROM chat_messages m
  WHERE m.sent_at IS NOT NULL
  GROUP BY m.conversation_id
) AS latest_msg
WHERE c.id = latest_msg.conversation_id
  AND latest_msg.max_sent_at IS NOT NULL
  AND (
    -- Atualizar apenas se a última mensagem real for mais recente que o last_message_at atual
    c.last_message_at IS NULL 
    OR latest_msg.max_sent_at > c.last_message_at
    -- Ou se o preview estiver desatualizado
    OR (c.last_message_preview IS NULL AND latest_msg.last_body IS NOT NULL)
  );

