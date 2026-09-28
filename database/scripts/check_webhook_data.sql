-- Script para verificar se os webhooks estão salvando dados no banco
-- Execute este script para verificar conversas e mensagens recentes

-- 1. Verificar conversas criadas/atualizadas nas últimas 24 horas
SELECT 
    id,
    external_chat_id,
    contact_name,
    phone_number,
    last_message_preview,
    last_message_at,
    unread_count,
    created_at,
    updated_at,
    instance_id
FROM chat_conversations
WHERE updated_at >= NOW() - INTERVAL '24 hours'
ORDER BY updated_at DESC
LIMIT 20;

-- 2. Verificar mensagens criadas nas últimas 24 horas
SELECT 
    id,
    conversation_id,
    direction,
    external_message_id,
    body,
    status,
    sent_at,
    created_at,
    updated_at
FROM chat_messages
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 3. Verificar instâncias e seus webhooks configurados
SELECT 
    ci.id,
    ci.name,
    ci.external_instance_name,
    ci.status,
    ci.metadata->'webhook'->>'url' as webhook_url,
    ci.metadata->'webhook'->>'configuredAt' as webhook_configured_at,
    ci.updated_at
FROM chat_instances ci
ORDER BY ci.updated_at DESC;

-- 4. Contar conversas por instância
SELECT 
    ci.name as instance_name,
    COUNT(cc.id) as total_conversations,
    COUNT(CASE WHEN cc.updated_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as conversations_updated_24h,
    COUNT(CASE WHEN cc.updated_at >= NOW() - INTERVAL '1 hour' THEN 1 END) as conversations_updated_1h
FROM chat_instances ci
LEFT JOIN chat_conversations cc ON cc.instance_id = ci.id
GROUP BY ci.id, ci.name
ORDER BY ci.name;

-- 5. Contar mensagens por conversa (últimas 24 horas)
SELECT 
    cc.external_chat_id,
    cc.contact_name,
    COUNT(cm.id) as message_count,
    MAX(cm.created_at) as last_message_created
FROM chat_conversations cc
LEFT JOIN chat_messages cm ON cm.conversation_id = cc.id 
    AND cm.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY cc.id, cc.external_chat_id, cc.contact_name
HAVING COUNT(cm.id) > 0
ORDER BY last_message_created DESC
LIMIT 20;

