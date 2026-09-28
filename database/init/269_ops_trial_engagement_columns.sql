-- Sprint N1 — board Engajamento Trial + colunas canônicas (idempotente).

DO $$
DECLARE
  v_tenant uuid := '1f1a0f0a-0000-4000-8000-000000000001'::uuid;
  v_board_id uuid;
  v_max_pos int;
  v_actor_user_id uuid;
  rec record;
BEGIN
  SELECT id INTO v_board_id
  FROM public.chat_kanban_boards
  WHERE tenant_id = v_tenant
    AND archived_at IS NULL
    AND lower(btrim(name)) = lower(btrim('Engajamento Trial'))
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF v_board_id IS NULL THEN
    SELECT u.id INTO v_actor_user_id
    FROM public.users u
    WHERE u.is_super_admin = true
    ORDER BY u.created_at ASC
    LIMIT 1;

    IF v_actor_user_id IS NOT NULL THEN
      v_board_id := gen_random_uuid();
      INSERT INTO public.chat_kanban_boards (
        id, tenant_id, name, description, sort_order, archived_at,
        created_by_user_id, visibility_mode, is_active, created_at, updated_at
      ) VALUES (
        v_board_id,
        v_tenant,
        'Engajamento Trial',
        'Engajamento durante o período de teste — progressão temporal (Sprint N2)',
        55,
        NULL,
        v_actor_user_id,
        'restricted',
        true,
        now(),
        now()
      );
    END IF;
  END IF;

  IF v_board_id IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('Trial iniciado', '#34d399'),
      ('Dia 2', '#38bdf8'),
      ('Dia 4', '#a78bfa'),
      ('Dia 6', '#fbbf24'),
      ('Trial finalizando', '#fb7185')
    ) AS t(column_name, color)
  LOOP
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
