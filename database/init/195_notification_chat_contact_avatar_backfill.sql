-- Backfill: `notifications.data.contact_avatar_url` a partir de `chat_conversations` e vínculos
-- (conversas carregam o mesmo critério que o inbox: conversa → contato multicanal → client/lead → metadata).
-- Não altera linhas em que `contact_avatar_url` já veio preenchido.
UPDATE public.notifications n
SET
  data = jsonb_set(
    COALESCE(n.data, '{}'::jsonb),
    '{contact_avatar_url}',
    to_jsonb(btrim(sub.resolved::text)),
    true
  ),
  updated_at = now()
FROM (
  SELECT
    n0.id,
    NULLIF(
      btrim(
        COALESCE(
          c.avatar_url,
          cc.profile_avatar_url,
          cl.whatsapp_avatar_url,
          l.whatsapp_avatar_url,
          c.metadata->>'whatsapp_profile_photo',
          c.metadata->>'imagePreview',
          c.metadata->>'image'
        )::text
      ),
      ''
    ) AS resolved
  FROM public.notifications n0
  INNER JOIN public.chat_conversations c
    ON c.id::text = coalesce(
      nullif(btrim(n0.data->>'conversationId'), ''),
      nullif(btrim(n0.data->> 'conversation_id'), '')
    )
  LEFT JOIN public.communication_contacts cc ON cc.id = c.communication_contact_id
  LEFT JOIN public.clients cl ON cl.id = c.client_id
  LEFT JOIN public.leads l ON l.id = c.lead_id
  WHERE
    n0.type = any (
      array[
        'new_message'::character varying,
        'new_conversation'::character varying,
        'message_delivered'::character varying,
        'message_read'::character varying,
        'chat_assigned'::character varying,
        'chat_transferred'::character varying,
        'chat_sla_breach'::character varying
      ]
    )
    AND coalesce(
      nullif(btrim(n0.data->>'conversationId'), ''),
      nullif(btrim(n0.data->> 'conversation_id'), '')
    ) is not null
    AND (n0.data->>'contact_avatar_url') is null
) sub
WHERE n.id = sub.id
  AND sub.resolved is not null;
