-- Identidade global: um e-mail e um WhatsApp (>= 8 dígitos) por usuário na plataforma.
-- Criação dos índices únicos é condicional: se já existirem duplicatas nos dados, a migration
-- NÃO falha — emite WARNING e pula o índice afetado (corrija dados e crie o índice manualmente).
--
-- Diagnóstico:
--   SELECT lower(btrim(email)) AS e, count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
--   SELECT regexp_replace(COALESCE(whatsapp_number,''), '\D', '', 'g') AS w, count(*)
--     FROM users
--     WHERE length(regexp_replace(COALESCE(whatsapp_number,''), '\D', '', 'g')) >= 8
--     GROUP BY 1 HAVING count(*) > 1;

DO $body$
BEGIN
  -- E-mail global (só se índice ainda não existe e não há e-mails duplicados após normalização)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_email_global_lower_key'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT lower(btrim(email)) AS e
        FROM public.users
        GROUP BY 1
        HAVING COUNT(*) > 1
      ) dup
    ) THEN
      RAISE WARNING 'painelcrm 87: users_email_global_lower_key NÃO criado — há e-mails duplicados (lower/trim). Corrija os dados e crie o índice manualmente.';
    ELSE
      DROP INDEX IF EXISTS public.users_tenant_email_key;
      DROP INDEX IF EXISTS public.users_email_null_tenant_key;
      CREATE UNIQUE INDEX users_email_global_lower_key ON public.users (lower(btrim(email)));
    END IF;
  END IF;

  -- WhatsApp normalizado (8+ dígitos): só se índice não existe e não há duplicatas
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_whatsapp_digits_unique'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT regexp_replace(COALESCE(whatsapp_number, ''), '\D', '', 'g') AS w
        FROM public.users
        WHERE length(regexp_replace(COALESCE(whatsapp_number, ''), '\D', '', 'g')) >= 8
        GROUP BY 1
        HAVING COUNT(*) > 1
      ) dup
    ) THEN
      RAISE WARNING 'painelcrm 87: users_whatsapp_digits_unique NÃO criado — há WhatsApp duplicado após normalização (apenas dígitos, 8+). Corrija os dados e crie o índice manualmente.';
    ELSE
      CREATE UNIQUE INDEX users_whatsapp_digits_unique
        ON public.users (regexp_replace(COALESCE(whatsapp_number, ''), '\D', '', 'g'))
        WHERE length(regexp_replace(COALESCE(whatsapp_number, ''), '\D', '', 'g')) >= 8;
    END IF;
  END IF;
END $body$;

DO $body$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_email_global_lower_key'
  ) THEN
    EXECUTE $c$COMMENT ON INDEX public.users_email_global_lower_key IS 'E-mail único na plataforma (lower + trim).'$c$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_whatsapp_digits_unique'
  ) THEN
    EXECUTE $c$COMMENT ON INDEX public.users_whatsapp_digits_unique IS 'WhatsApp único na plataforma quando há 8+ dígitos após normalização.'$c$;
  END IF;
END $body$;
