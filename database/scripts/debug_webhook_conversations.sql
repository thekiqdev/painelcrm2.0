-- Script para debugar conversas criadas via webhook
-- Execute este script para verificar se as conversas estão sendo salvas corretamente

-- 1. Verificar todas as conversas criadas/atualizadas nas últimas 2 horas
SELECT 
    c.id,
    c.external_chat_id,
    c.contact_name,
    c.phone_number,
    c.user_id,
    c.instance_id,
    i.name as instance_name,
    i.external_instance_name,
    c.last_message_preview,
    c.last_message_at,
    c.unread_count,
    c.created_at,
    c.updated_at
FROM chat_conversations c
LEFT JOIN chat_instances i ON i.id = c.instance_id
WHERE c.updated_at >= NOW() - INTERVAL '2 hours'
ORDER BY c.updated_at DESC;

-- 2. Verificar se há conversas sem user_id (problema!)
SELECT 
    c.id,
    c.external_chat_id,
    c.contact_name,
    c.user_id,
    c.instance_id,
    i.name as instance_name
FROM chat_conversations c
LEFT JOIN chat_instances i ON i.id = c.instance_id
WHERE c.user_id IS NULL
ORDER BY c.created_at DESC;

-- 3. Verificar conversas por instância específica (substitua o instance_id)
-- SELECT 
--     c.id,
--     c.external_chat_id,
--     c.contact_name,
--     c.user_id,
--     c.instance_id,
--     i.name as instance_name,
--     i.external_instance_name
-- FROM chat_conversations c
-- LEFT JOIN chat_instances i ON i.id = c.instance_id
-- WHERE c.instance_id = 'SEU_INSTANCE_ID_AQUI'
-- ORDER BY c.updated_at DESC;

-- 4. Verificar mensagens das últimas conversas
SELECT 
    cm.id,
    cm.conversation_id,
    cm.direction,
    cm.external_message_id,
    cm.body,
    cm.sent_at,
    cm.created_at,
    c.external_chat_id,
    c.contact_name
FROM chat_messages cm
INNER JOIN chat_conversations c ON c.id = cm.conversation_id
WHERE cm.created_at >= NOW() - INTERVAL '2 hours'
ORDER BY cm.created_at DESC
LIMIT 20;

-- 5. Contar conversas por user_id (para verificar se está salvando o user_id correto)
SELECT 
    c.user_id,
    COUNT(*) as total_conversations,
    COUNT(CASE WHEN c.updated_at >= NOW() - INTERVAL '2 hours' THEN 1 END) as updated_last_2h
FROM chat_conversations c
GROUP BY c.user_id
ORDER BY total_conversations DESC;

-- 6. Verificar última conversa criada com todos os detalhes
SELECT 
    c.*,
    i.name as instance_name,
    i.external_instance_name,
    i.status as instance_status,
    (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id) as message_count
FROM chat_conversations c
LEFT JOIN chat_instances i ON i.id = c.instance_id
ORDER BY c.created_at DESC
LIMIT 5;

