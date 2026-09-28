-- Sprint I — auditoria de promoções lifecycle + colunas destino nos boards canônicos.

CREATE TABLE IF NOT EXISTS public.ops_lifecycle_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  acquisition_lead_id uuid NULL REFERENCES public.acquisition_leads(id) ON DELETE SET NULL,
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  card_id uuid NULL,
  event_type text NOT NULL,
  source_board_id uuid NULL,
  source_column_id uuid NULL,
  destination_board_id uuid NULL,
  destination_column_id uuid NULL,
  result text NOT NULL,
  correlation_id text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ops_lifecycle_transitions_created_at
  ON public.ops_lifecycle_transitions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_lifecycle_transitions_lead
  ON public.ops_lifecycle_transitions (acquisition_lead_id)
  WHERE acquisition_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ops_lifecycle_transitions_tenant
  ON public.ops_lifecycle_transitions (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ops_lifecycle_transitions_card
  ON public.ops_lifecycle_transitions (card_id)
  WHERE card_id IS NOT NULL;

-- Colunas de destino do Lifecycle Router (idempotente por board canônico + nome).
DO $$
DECLARE
  v_tenant uuid := '1f1a0f0a-0000-4000-8000-000000000001'::uuid;
  v_board_id uuid;
  v_max_pos int;
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('Onboarding', 'Provisionado', '#64748b'),
      ('Onboarding', 'Onboarding concluído', '#22c55e'),
      ('Expansão', 'Novo Cliente', '#64748b'),
      ('Reativação', 'Trial expirado', '#fb7185'),
      ('Reativação', 'Cancelado', '#94a3b8'),
      ('Aquisição', 'Novo Lead', '#64748b')
    ) AS t(board_name, column_name, color)
  LOOP
    SELECT id INTO v_board_id
    FROM public.chat_kanban_boards
    WHERE tenant_id = v_tenant
      AND archived_at IS NULL
      AND lower(btrim(name)) = lower(btrim(rec.board_name))
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    IF v_board_id IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.chat_kanban_columns c
      WHERE c.tenant_id = v_tenant
        AND c.board_id = v_board_id
        AND lower(btrim(c.name)) = lower(btrim(rec.column_name))
    ) THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(MAX(position), -1) + 1 INTO v_max_pos
    FROM public.chat_kanban_columns
    WHERE board_id = v_board_id;

    INSERT INTO public.chat_kanban_columns (
      id, tenant_id, board_id, name, color, position, metadata, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_tenant,
      v_board_id,
      rec.column_name,
      rec.color,
      v_max_pos,
      '{"automation_config":{"enabled":false}}'::jsonb,
      now(),
      now()
    );
  END LOOP;
END $$;
