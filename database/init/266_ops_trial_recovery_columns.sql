-- Sprint K — colunas de recuperação de trial no board Reativação (idempotente).

DO $$
DECLARE
  v_tenant uuid := '1f1a0f0a-0000-4000-8000-000000000001'::uuid;
  v_board_id uuid;
  v_max_pos int;
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('Reativação', 'Dia 1', '#f59e0b'),
      ('Reativação', 'Dia 3', '#f97316'),
      ('Reativação', 'Dia 7', '#ea580c'),
      ('Reativação', 'Última tentativa', '#dc2626'),
      ('Reativação', 'Reativado', '#22c55e')
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
