-- Fase 3: movimento agendado pode ter destino noutro quadro Kanban (além de outra coluna no mesmo quadro).
-- NULL = destino na mesma linha de board do cartão (comportamento legado).

ALTER TABLE public.chat_kanban_scheduled_moves
  ADD COLUMN IF NOT EXISTS to_board_id UUID REFERENCES public.chat_kanban_boards(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.chat_kanban_scheduled_moves.to_board_id IS
  'Quadro destino quando o movimento automático atravessa boards; NULL = coluna destino no mesmo board do cartão.';
