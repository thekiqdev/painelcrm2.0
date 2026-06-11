import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { useChatKanbanBoardDnd } from './useChatKanbanBoardDnd';
import { KANBAN_DROP_PREFIX } from './kanbanDndIds';
import type { ChatKanbanBoardCard, ChatKanbanColumn, ChatKanbanService } from '@/services/chatKanban';

vi.mock('@/components/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const COL_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COL_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const columns: ChatKanbanColumn[] = [
  {
    id: COL_A,
    board_id: 'board-1',
    tenant_id: 'tenant-1',
    name: 'Coluna A',
    color: null,
    position: 0,
    funnel_stage_id: null,
    metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: COL_B,
    board_id: 'board-1',
    tenant_id: 'tenant-1',
    name: 'Coluna B',
    color: null,
    position: 1,
    funnel_stage_id: null,
    metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

function makeCard(columnId: string): ChatKanbanBoardCard {
  return {
    id: CARD_ID,
    board_id: 'board-1',
    column_id: columnId,
    tenant_id: 'tenant-1',
    conversation_id: null,
    acquisition_lead_id: 'lead-1',
    position: 1,
    metadata: {},
    archived_at: null,
    created_by_user_id: null,
    updated_by_user_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function makeKanbanService(patchCard: ChatKanbanService['patchCard'], isOpsLayer = false): ChatKanbanService {
  return { isOpsLayer, patchCard } as ChatKanbanService;
}

function useHarness(kanban: ChatKanbanService) {
  const [cards, setCards] = useState(() => [makeCard(COL_A)]);
  const dnd = useChatKanbanBoardDnd({
    kanban,
    cards,
    setCards,
    sortedColumns: columns,
    enabled: true,
  });
  return { ...dnd, cards };
}

async function dragToColumn(
  getApi: () => ReturnType<typeof useHarness>,
  destColumnId: string,
): Promise<void> {
  const dropId = `${KANBAN_DROP_PREFIX}${destColumnId}`;

  await act(async () => {
    getApi().onDragStart({ active: { id: CARD_ID } } as DragStartEvent);
  });

  await act(async () => {
    getApi().onDragOver({
      active: { id: CARD_ID },
      over: { id: dropId },
    } as DragOverEvent);
  });

  await waitFor(() => {
    expect(getApi().dndItems[destColumnId]).toContain(CARD_ID);
  });

  await act(async () => {
    await getApi().onDragEnd({
      active: { id: CARD_ID },
      over: { id: dropId },
    } as DragEndEvent);
  });
}

describe('useChatKanbanBoardDnd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cenário A — CRM normal usa chatKanbanService.patchCard', async () => {
    const patchCard = vi.fn().mockResolvedValue(makeCard(COL_B));
    const crmKanban = makeKanbanService(patchCard, false);

    const { result } = renderHook(() => useHarness(crmKanban));

    await dragToColumn(() => result.current, COL_B);

    await waitFor(() => expect(patchCard).toHaveBeenCalledTimes(1));
    expect(patchCard).toHaveBeenCalledWith(
      CARD_ID,
      expect.objectContaining({ column_id: COL_B }),
    );
    expect(crmKanban.isOpsLayer).toBe(false);
  });

  it('cenário B — Ops Kanban usa superadminOpsKanbanService.patchCard', async () => {
    const patchCard = vi.fn().mockResolvedValue(makeCard(COL_B));
    const opsKanban = makeKanbanService(patchCard, true);

    const { result } = renderHook(() => useHarness(opsKanban));

    await dragToColumn(() => result.current, COL_B);

    await waitFor(() => expect(patchCard).toHaveBeenCalledTimes(1));
    expect(patchCard).toHaveBeenCalledWith(
      CARD_ID,
      expect.objectContaining({ column_id: COL_B }),
    );
    expect(opsKanban.isOpsLayer).toBe(true);
  });

  it('cenário C — mover coluna envia column_id correto no PATCH', async () => {
    const patchCard = vi.fn().mockResolvedValue({ ...makeCard(COL_B), position: 2 });
    const kanban = makeKanbanService(patchCard, true);

    const { result } = renderHook(() => useHarness(kanban));

    await dragToColumn(() => result.current, COL_B);

    await waitFor(() => expect(patchCard).toHaveBeenCalledTimes(1));
    const payload = patchCard.mock.calls[0]?.[1];
    expect(payload?.column_id).toBe(COL_B);
    expect(typeof payload?.position).toBe('number');
  });

  it('cenário D — erro no patch restaura cards e dndItems locais', async () => {
    const patchCard = vi.fn().mockRejectedValue(new Error('TENANT_REQUIRED_FOR_OPERATION'));
    const kanban = makeKanbanService(patchCard, true);

    const { result } = renderHook(() => useHarness(kanban));

    await dragToColumn(() => result.current, COL_B);

    await waitFor(() => expect(patchCard).toHaveBeenCalledTimes(1));

    expect(result.current.cards[0]?.column_id).toBe(COL_A);
    expect(result.current.dndItems[COL_A]).toContain(CARD_ID);
    expect(result.current.dndItems[COL_B] ?? []).not.toContain(CARD_ID);
  });
});
