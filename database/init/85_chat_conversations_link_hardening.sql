-- Hardening Fase 1 Chat+CRM:
-- 1) reforça exclusividade de vínculo (client_id XOR lead_id OR ambos NULL)
-- 2) adiciona índices para matching por telefone normalizado
-- 3) saneia dados inválidos antes da constraint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_conversations'
      AND column_name = 'lead_id'
  ) THEN
    -- Corrige casos inválidos já existentes (ambos preenchidos): preserva client_id por precedência.
    UPDATE public.chat_conversations
    SET lead_id = NULL,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'hardening_link_cleanup', true,
          'hardening_link_cleanup_at', to_jsonb(now()::text),
          'hardening_link_cleanup_reason', 'both_client_and_lead_set_preserve_client'
        ),
        updated_at = now()
    WHERE client_id IS NOT NULL
      AND lead_id IS NOT NULL;

    ALTER TABLE public.chat_conversations
      DROP CONSTRAINT IF EXISTS chk_chat_conversations_single_link_entity;

    ALTER TABLE public.chat_conversations
      ADD CONSTRAINT chk_chat_conversations_single_link_entity
      CHECK (
        (client_id IS NULL AND lead_id IS NULL) OR
        (client_id IS NOT NULL AND lead_id IS NULL) OR
        (client_id IS NULL AND lead_id IS NOT NULL)
      ) NOT VALID;

    ALTER TABLE public.chat_conversations
      VALIDATE CONSTRAINT chk_chat_conversations_single_link_entity;
  END IF;
END$$;

-- Índices de telefone normalizado para matching (tenant-scoped via JOIN users.tenant_id)
CREATE INDEX IF NOT EXISTS idx_clients_user_phone_digits
  ON public.clients (user_id, (regexp_replace(phone, '\D', '', 'g')))
  WHERE phone IS NOT NULL AND phone <> '';

CREATE INDEX IF NOT EXISTS idx_leads_user_phone_digits
  ON public.leads (user_id, (regexp_replace(phone, '\D', '', 'g')))
  WHERE phone IS NOT NULL AND phone <> '';

-- Acelera join users(id) + filtro de tenant.
CREATE INDEX IF NOT EXISTS idx_users_tenant_id_id
  ON public.users (tenant_id, id)
  WHERE tenant_id IS NOT NULL;
