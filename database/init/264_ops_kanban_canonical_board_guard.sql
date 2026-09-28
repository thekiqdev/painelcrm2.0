-- P0-A — Boards canônicos no tenant Ops: arquiva duplicatas históricas + impede novas

DO $$
DECLARE
  v_tenant uuid := '1f1a0f0a-0000-4000-8000-000000000001'::uuid;
  v_name text;
  v_canonical uuid;
BEGIN
  FOR v_name IN
    SELECT lower(btrim(name))
    FROM public.chat_kanban_boards
    WHERE tenant_id = v_tenant AND archived_at IS NULL
    GROUP BY 1
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO v_canonical
    FROM public.chat_kanban_boards
    WHERE tenant_id = v_tenant
      AND archived_at IS NULL
      AND lower(btrim(name)) = v_name
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    UPDATE public.chat_kanban_boards b
    SET archived_at = now(), updated_at = now(), is_active = false
    WHERE b.tenant_id = v_tenant
      AND b.archived_at IS NULL
      AND lower(btrim(b.name)) = v_name
      AND b.id <> v_canonical
      AND NOT EXISTS (
        SELECT 1 FROM public.chat_kanban_cards c
        WHERE c.board_id = b.id AND c.archived_at IS NULL
      );
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_kanban_ops_board_name_active_uniq
  ON public.chat_kanban_boards (lower(btrim(name)))
  WHERE tenant_id = '1f1a0f0a-0000-4000-8000-000000000001'::uuid
    AND archived_at IS NULL;

COMMENT ON INDEX public.idx_chat_kanban_ops_board_name_active_uniq IS
  'Kanban Ops: um board ativo por nome. Duplicatas sem cards são arquivadas pela migration; registros permanecem.';
