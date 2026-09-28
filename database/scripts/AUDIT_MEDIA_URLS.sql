-- =============================================================================
-- AUDIT_MEDIA_URLS.sql — Validação pós-Fase 1 (mídia / avatar / URLs)
-- =============================================================================
-- Execução: só LEITURA. Preferir utilizador read-only e cópia da BD em staging.
-- Objetivo: localizar localhost, CDN WhatsApp em campos "finais", e avatar-proxy
-- persistido por engano (alinhado a docs/MEDIA_CONTRACT_V1.md §12).
--
-- Não altera dados. Revisar cada secção; contagens > 0 exigem análise manual.
--
-- ⚠️ BASE CORRETA: este script assume as tabelas da app (chat_conversations, …).
--    Conecte-se à base da aplicação (ex.: painelcrm), NÃO à base template `postgres`.
--    psql: \c painelcrm   ou   psql -U postgres -d painelcrm -h … -p …
--    Docker exemplo: docker exec -it painelcrm_postgres psql -U postgres -d painelcrm
-- =============================================================================

\pset pager off

-- ---------------------------------------------------------------------------
-- Resumo rápido (contagens por família de problema)
-- ---------------------------------------------------------------------------
SELECT 'localhost_em_colunas_texto' AS familia,
       COUNT(*)::bigint AS linhas
FROM (
  SELECT 1 FROM public.chat_conversations
   WHERE (avatar_url ILIKE '%localhost%' OR avatar_cached_url ILIKE '%localhost%')
  UNION ALL
  SELECT 1 FROM public.clients
   WHERE (whatsapp_avatar_url ILIKE '%localhost%' OR whatsapp_avatar_cached_url ILIKE '%localhost%')
  UNION ALL
  SELECT 1 FROM public.leads
   WHERE (whatsapp_avatar_url ILIKE '%localhost%' OR whatsapp_avatar_cached_url ILIKE '%localhost%')
  UNION ALL
  SELECT 1 FROM public.communication_contacts
   WHERE profile_avatar_url ILIKE '%localhost%'
  UNION ALL
  SELECT 1 FROM public.profiles WHERE avatar_url ILIKE '%localhost%'
  UNION ALL
  SELECT 1 FROM public.users WHERE avatar_url ILIKE '%localhost%'
  UNION ALL
  SELECT 1 FROM public.tenants
   WHERE (COALESCE(logo_url,'') ILIKE '%localhost%' OR COALESCE(logo_light_url,'') ILIKE '%localhost%' OR COALESCE(logo_dark_url,'') ILIKE '%localhost%')
  UNION ALL
  SELECT 1 FROM public.store_profiles WHERE store_logo ILIKE '%localhost%'
) x;

SELECT 'whatsapp_net_em_campos_finais' AS familia,
       COUNT(*)::bigint AS linhas
FROM (
  SELECT 1 FROM public.chat_conversations
   WHERE (avatar_url ILIKE '%whatsapp.net%' OR avatar_cached_url ILIKE '%whatsapp.net%'
          OR avatar_url ILIKE '%whatsapp.com%' OR avatar_cached_url ILIKE '%whatsapp.com%')
  UNION ALL
  SELECT 1 FROM public.profiles
   WHERE avatar_url ILIKE '%whatsapp.net%' OR avatar_url ILIKE '%whatsapp.com%'
  UNION ALL
  SELECT 1 FROM public.users
   WHERE avatar_url ILIKE '%whatsapp.net%' OR avatar_url ILIKE '%whatsapp.com%'
  UNION ALL
  SELECT 1 FROM public.clients
   WHERE whatsapp_avatar_url ILIKE '%whatsapp.net%' OR whatsapp_avatar_url ILIKE '%whatsapp.com%'
  UNION ALL
  SELECT 1 FROM public.leads
   WHERE whatsapp_avatar_url ILIKE '%whatsapp.net%' OR whatsapp_avatar_url ILIKE '%whatsapp.com%'
  UNION ALL
  SELECT 1 FROM public.communication_contacts
   WHERE profile_avatar_url ILIKE '%whatsapp.net%' OR profile_avatar_url ILIKE '%whatsapp.com%'
  UNION ALL
  SELECT 1 FROM public.tenants
   WHERE COALESCE(logo_url,'') ILIKE '%whatsapp.net%' OR COALESCE(logo_light_url,'') ILIKE '%whatsapp.net%' OR COALESCE(logo_dark_url,'') ILIKE '%whatsapp.net%'
) y;

SELECT 'avatar_proxy_persistido' AS familia,
       COUNT(*)::bigint AS linhas
FROM (
  SELECT 1 FROM public.chat_conversations
   WHERE avatar_url ILIKE '%avatar-proxy%' OR avatar_cached_url ILIKE '%avatar-proxy%'
  UNION ALL
  SELECT 1 FROM public.clients
   WHERE whatsapp_avatar_url ILIKE '%avatar-proxy%' OR whatsapp_avatar_cached_url ILIKE '%avatar-proxy%'
  UNION ALL
  SELECT 1 FROM public.leads
   WHERE whatsapp_avatar_url ILIKE '%avatar-proxy%' OR whatsapp_avatar_cached_url ILIKE '%avatar-proxy%'
  UNION ALL
  SELECT 1 FROM public.notifications
   WHERE data::text ILIKE '%avatar-proxy%'
) z;


-- ---------------------------------------------------------------------------
-- 1) Localhost em colunas de mídia / avatar (detalhe)
-- ---------------------------------------------------------------------------
SELECT 'chat_conversations' AS tabela, id::text AS row_id, user_id::text AS user_id,
       NULL::text AS extra,
       avatar_url, avatar_cached_url
FROM public.chat_conversations
WHERE avatar_url ILIKE '%localhost%'
   OR avatar_cached_url ILIKE '%localhost%';

SELECT 'clients' AS tabela, id::text, user_id::text, NULL::text,
       whatsapp_avatar_url, whatsapp_avatar_cached_url
FROM public.clients
WHERE whatsapp_avatar_url ILIKE '%localhost%'
   OR whatsapp_avatar_cached_url ILIKE '%localhost%';

SELECT 'leads' AS tabela, id::text, user_id::text, NULL::text,
       whatsapp_avatar_url, whatsapp_avatar_cached_url
FROM public.leads
WHERE whatsapp_avatar_url ILIKE '%localhost%'
   OR whatsapp_avatar_cached_url ILIKE '%localhost%';

SELECT 'profiles' AS tabela, id::text, NULL::text, NULL::text,
       avatar_url, NULL::text
FROM public.profiles
WHERE avatar_url ILIKE '%localhost%';

SELECT 'users' AS tabela, id::text, tenant_id::text, NULL::text,
       avatar_url, NULL::text
FROM public.users
WHERE avatar_url ILIKE '%localhost%';

SELECT 'tenants' AS tabela, id::text, NULL::text, NULL::text,
       logo_light_url, logo_dark_url
FROM public.tenants
WHERE COALESCE(logo_url,'') ILIKE '%localhost%'
   OR COALESCE(logo_light_url,'') ILIKE '%localhost%'
   OR COALESCE(logo_dark_url,'') ILIKE '%localhost%';

SELECT 'store_profiles' AS tabela, id::text, user_id::text, NULL::text,
       store_logo, NULL::text
FROM public.store_profiles
WHERE store_logo ILIKE '%localhost%';

SELECT 'products' AS tabela, id::text, user_id::text, 'images/secondary JSON'::text,
       images::text AS images_snippet, NULL::text
FROM public.products
WHERE images::text ILIKE '%localhost%' OR secondary_images::text ILIKE '%localhost%';

SELECT 'communication_contacts' AS tabela, id::text, tenant_id::text, NULL::text,
       profile_avatar_url, NULL::text
FROM public.communication_contacts
WHERE profile_avatar_url ILIKE '%localhost%';


-- ---------------------------------------------------------------------------
-- 2) whatsapp.net / whatsapp.com em campos típicos de "URL final" de exibição
--    Nota: whatsapp_avatar_source_url (quando existir) pode legitimamente conter CDN;
--    este script foca colunas de avatar/logo de perfil e conversa.
-- ---------------------------------------------------------------------------
SELECT 'chat_conversations (avatar_url / avatar_cached)' AS secao,
       id::text, avatar_url, avatar_cached_url
FROM public.chat_conversations
WHERE avatar_url ILIKE '%whatsapp.net%' OR avatar_url ILIKE '%whatsapp.com%'
   OR avatar_cached_url ILIKE '%whatsapp.net%' OR avatar_cached_url ILIKE '%whatsapp.com%';

SELECT 'profiles/users (avatar_url)' AS secao, 'profiles' AS tabela, id::text, avatar_url
FROM public.profiles
WHERE avatar_url ILIKE '%whatsapp.net%' OR avatar_url ILIKE '%whatsapp.com%'
UNION ALL
SELECT 'profiles/users (avatar_url)', 'users', id::text, avatar_url
FROM public.users
WHERE avatar_url ILIKE '%whatsapp.net%' OR avatar_url ILIKE '%whatsapp.com%';

SELECT 'clients/leads (whatsapp_avatar_url — rever manualmente se cache pendente)' AS secao,
       'clients' AS tabela, id::text, whatsapp_avatar_url
FROM public.clients
WHERE whatsapp_avatar_url ILIKE '%whatsapp.net%' OR whatsapp_avatar_url ILIKE '%whatsapp.com%'
UNION ALL
SELECT 'clients/leads', 'leads', id::text, whatsapp_avatar_url
FROM public.leads
WHERE whatsapp_avatar_url ILIKE '%whatsapp.net%' OR whatsapp_avatar_url ILIKE '%whatsapp.com%';

SELECT 'communication_contacts.profile_avatar_url' AS secao, 'communication_contacts' AS tabela,
       id::text, profile_avatar_url
FROM public.communication_contacts
WHERE profile_avatar_url ILIKE '%whatsapp.net%' OR profile_avatar_url ILIKE '%whatsapp.com%';

SELECT 'tenants (logos)' AS secao, id::text, logo_url, logo_light_url
FROM public.tenants
WHERE COALESCE(logo_url,'') ILIKE '%whatsapp.net%'
   OR COALESCE(logo_light_url,'') ILIKE '%whatsapp.net%'
   OR COALESCE(logo_dark_url,'') ILIKE '%whatsapp.net%';


-- ---------------------------------------------------------------------------
-- 3) avatar-proxy persistido (não deve ser valor final em colunas de negócio)
-- ---------------------------------------------------------------------------
SELECT 'chat_conversations' AS tabela, id::text, avatar_url, avatar_cached_url
FROM public.chat_conversations
WHERE avatar_url ILIKE '%avatar-proxy%'
   OR avatar_cached_url ILIKE '%avatar-proxy%';

SELECT 'clients' AS tabela, id::text, whatsapp_avatar_url, whatsapp_avatar_cached_url
FROM public.clients
WHERE whatsapp_avatar_url ILIKE '%avatar-proxy%'
   OR whatsapp_avatar_cached_url ILIKE '%avatar-proxy%';

SELECT 'leads' AS tabela, id::text, whatsapp_avatar_url, whatsapp_avatar_cached_url
FROM public.leads
WHERE whatsapp_avatar_url ILIKE '%avatar-proxy%'
   OR whatsapp_avatar_cached_url ILIKE '%avatar-proxy%';

SELECT 'notifications.data' AS tabela, id::text, data::text AS data_snippet
FROM public.notifications
WHERE data::text ILIKE '%avatar-proxy%'
LIMIT 200;


-- ---------------------------------------------------------------------------
-- 4) JSON / texto — identificar padrões (revisão manual; não corrigir em massa)
-- ---------------------------------------------------------------------------
SELECT 'chat_messages.metadata' AS alvo, id::text, conversation_id::text,
       LEFT(metadata::text, 400) AS snippet
FROM public.chat_messages
WHERE metadata::text ILIKE '%localhost%'
   OR metadata::text ILIKE '%whatsapp.net%'
   OR metadata::text ILIKE '%avatar-proxy%'
LIMIT 300;

SELECT 'chat_messages.media' AS alvo, id::text, conversation_id::text,
       LEFT(media::text, 400) AS snippet
FROM public.chat_messages
WHERE media::text ILIKE '%localhost%'
   OR media::text ILIKE '%whatsapp.net%'
   OR media::text ILIKE '%avatar-proxy%'
LIMIT 300;

SELECT 'notifications.data' AS alvo, id::text, user_id::text,
       LEFT(data::text, 400) AS snippet
FROM public.notifications
WHERE data::text ILIKE '%localhost%'
   OR data::text ILIKE '%whatsapp.net%'
LIMIT 300;

-- Motor outbound (apenas se a tabela existir — comentar se a migração 129+ não correu)
SELECT 'notification_outbound_deliveries.metadata' AS alvo, id::text, tenant_id::text,
       LEFT(metadata::text, 300) AS snippet
FROM public.notification_outbound_deliveries
WHERE metadata::text ILIKE '%localhost%'
   OR metadata::text ILIKE '%whatsapp.net%'
   OR metadata::text ILIKE '%avatar-proxy%'
LIMIT 200;


-- ---------------------------------------------------------------------------
-- Fim: interpretação
-- ---------------------------------------------------------------------------
-- Contagens 0 nas famílias do topo + revisão amostral das secções 1–4 =
-- bom sinal para produção. Exceções documentadas (ex.: source_url com CDN) devem
-- estar só em colunas de origem, não em avatar_url final de conversa.
