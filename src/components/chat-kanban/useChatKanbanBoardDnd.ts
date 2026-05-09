import { useCallback, useEffect, useRef, useState } from 'react';
import {
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { toast } from '@/components/ui/sonner';
import { chatKanbanService, type ChatKanbanBoardCard, type ChatKanbanColumn } from '@/services/chatKanban';
import { setStoredProposalPublicUrl } from '@/utils/proposalPublicLinkSession';
import { computeKanbanInsertPosition } from '@/utils/kanbanFractionalPosition';
import { KANBAN_DROP_PREFIX } from '@/components/chat-kanban/kanbanDndIds';
import { parseKanbanColumnRules } from '@/utils/kanbanColumnRulesUi';

function columnIdOrder(cols: ChatKanbanColumn[]): string[] {
  return [...cols].sort((a, b) => a.position - b.position).map((c) => c.id);
}

function buildItemMap(cards: ChatKanbanBoardCard[], cols: ChatKanbanColumn[]): Record<string, string[]> {
  const sortedCols = [...cols].sort((a, b) => a.position - b.position);
  const m: Record<string, string[]> = {};
  for (const col of sortedCols) {
    const arr = cards
      .filter((c) => c.column_id === col.id)
      .sort(
        (a, b) =>
          Number(a.position) - Number(b.position) ||
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    m[col.id] = arr.map((c) => c.id);
  }
  return m;
}

function findContainerForItemId(
  id: string,
  items: Record<string, string[]>,
  dropPrefix: string,
): string | undefined {
  if (id.startsWith(dropPrefix)) {
    return id.slice(dropPrefix.length);
  }
  for (const [colId, ids] of Object.entries(items)) {
    if (ids.includes(id)) return colId;
  }
  return undefined;
}

/**
 * Colunas horizontais: `closestCorners` tende a escolher a coluna vizinha errada.
 * Prioriza o retângulo sob o ponteiro; se coluna e cartão coincidem, prefere o cartão (ordenar dentro da coluna).
 */
const kanbanBoardCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    const cardHit = pointerHits.find((h) => !String(h.id).startsWith(KANBAN_DROP_PREFIX));
    return cardHit ? [cardHit] : pointerHits;
  }
  return closestCorners(args);
};

function itemMapsEqual(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
  cols: ChatKanbanColumn[],
): boolean {
  for (const id of columnIdOrder(cols)) {
    const sa = (a[id] ?? []).join('\u0001');
    const sb = (b[id] ?? []).join('\u0001');
    if (sa !== sb) return false;
  }
  return true;
}

type Params = {
  cards: ChatKanbanBoardCard[];
  setCards: React.Dispatch<React.SetStateAction<ChatKanbanBoardCard[]>>;
  sortedColumns: ChatKanbanColumn[];
  enabled: boolean;
  /** Quando a coluna destino exige motivo, o pai abre o modal e resolve com texto ou null (cancelar). */
  requestMoveReason?: (args: { columnName: string }) => Promise<string | null>;
  /** Quando a coluna destino exige confirmação explícita antes do PATCH. */
  requestMoveConfirmation?: (args: { columnName: string }) => Promise<boolean>;
  /** Chamado após PATCH com linha enriquecida (conversa / atendimento / metadata). */
  onCardSynced?: (card: ChatKanbanBoardCard) => void;
};

export function useChatKanbanBoardDnd({
  cards,
  setCards,
  sortedColumns,
  enabled,
  requestMoveReason,
  requestMoveConfirmation,
  onCardSynced,
}: Params) {
  const [dndItems, setDndItems] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const isDraggingRef = useRef(false);
  const dndItemsRef = useRef(dndItems);
  dndItemsRef.current = dndItems;
  const rollbackRef = useRef<ChatKanbanBoardCard[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (isDraggingRef.current) return;
    setDndItems(buildItemMap(cards, sortedColumns));
  }, [cards, sortedColumns, enabled]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!enabled) return;
      isDraggingRef.current = true;
      rollbackRef.current = [...cards];
      setActiveId(String(event.active.id));
      setDndItems(buildItemMap(cards, sortedColumns));
    },
    [enabled, cards, sortedColumns],
  );

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!enabled) return;
      const { active, over } = event;
      const activeIdStr = String(active.id);
      if (!over) return;
      const overId = String(over.id);
      if (activeIdStr === overId) return;

      const activeContainer = findContainerForItemId(activeIdStr, dndItemsRef.current, KANBAN_DROP_PREFIX);
      const overContainer = findContainerForItemId(overId, dndItemsRef.current, KANBAN_DROP_PREFIX);
      if (!activeContainer || !overContainer) return;

      if (activeContainer === overContainer) {
        if (overId.startsWith(KANBAN_DROP_PREFIX)) {
          setDndItems((prev) => {
            const items = [...(prev[activeContainer] ?? [])];
            const oldIndex = items.indexOf(activeIdStr);
            if (oldIndex < 0) return prev;
            items.splice(oldIndex, 1);
            items.push(activeIdStr);
            return { ...prev, [activeContainer]: items };
          });
          return;
        }
        setDndItems((prev) => {
          const items = [...(prev[activeContainer] ?? [])];
          const oldIndex = items.indexOf(activeIdStr);
          const newIndex = items.indexOf(overId);
          if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
          return { ...prev, [activeContainer]: arrayMove(items, oldIndex, newIndex) };
        });
        return;
      }

      setDndItems((prev) => {
        const from = [...(prev[activeContainer] ?? [])];
        const to = [...(prev[overContainer] ?? [])];
        const fromIdx = from.indexOf(activeIdStr);
        if (fromIdx === -1) return prev;
        from.splice(fromIdx, 1);

        if (overId.startsWith(KANBAN_DROP_PREFIX)) {
          to.push(activeIdStr);
        } else {
          const overIdx = to.indexOf(overId);
          if (overIdx === -1) {
            to.push(activeIdStr);
          } else {
            to.splice(overIdx, 0, activeIdStr);
          }
        }
        return { ...prev, [activeContainer]: from, [overContainer]: to };
      });
    },
    [enabled],
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!enabled) return;
      const { active, over } = event;
      const activeIdStr = String(active.id);
      setActiveId(null);

      if (!over) {
        isDraggingRef.current = false;
        const base = rollbackRef.current;
        if (base) setDndItems(buildItemMap(base, sortedColumns));
        return;
      }

      const snapshot = rollbackRef.current;
      if (!snapshot) {
        isDraggingRef.current = false;
        return;
      }

      const initialMap = buildItemMap(snapshot, sortedColumns);
      const finalMap = dndItemsRef.current;

      if (itemMapsEqual(initialMap, finalMap, sortedColumns)) {
        isDraggingRef.current = false;
        return;
      }

      const targetCol = findContainerForItemId(activeIdStr, finalMap, KANBAN_DROP_PREFIX);
      if (!targetCol) {
        isDraggingRef.current = false;
        setDndItems(buildItemMap(snapshot, sortedColumns));
        setCards(snapshot);
        return;
      }

      const order = finalMap[targetCol] ?? [];
      const idx = order.indexOf(activeIdStr);
      if (idx === -1) {
        isDraggingRef.current = false;
        setDndItems(buildItemMap(snapshot, sortedColumns));
        setCards(snapshot);
        toast.error('Ordem do quadro inconsistente; atualize a página.');
        return;
      }

      const cardMap = new Map(snapshot.map((c) => [c.id, c]));
      const prevId = idx > 0 ? order[idx - 1] : null;
      const nextId = idx < order.length - 1 ? order[idx + 1] : null;
      const prevCard = prevId ? cardMap.get(prevId) : undefined;
      const nextCard = nextId ? cardMap.get(nextId) : undefined;
      const newPos = computeKanbanInsertPosition(
        prevCard != null ? Number(prevCard.position) : null,
        nextCard != null ? Number(nextCard.position) : null,
      );

      const moved = snapshot.find((c) => c.id === activeIdStr);
      if (!moved) {
        isDraggingRef.current = false;
        setDndItems(buildItemMap(snapshot, sortedColumns));
        return;
      }

      const columnChanged = moved.column_id !== targetCol;
      const destCol = sortedColumns.find((c) => c.id === targetCol);
      const destRules = destCol ? parseKanbanColumnRules(destCol.metadata) : null;

      let moveReason: string | undefined;
      if (columnChanged && destRules?.require_move_reason) {
        const ask = requestMoveReason ?? (async () => null);
        const reason = await ask({ columnName: destCol?.name?.trim() || 'Coluna' });
        if (!reason?.trim()) {
          isDraggingRef.current = false;
          setDndItems(buildItemMap(snapshot, sortedColumns));
          return;
        }
        moveReason = reason.trim();
      }

      let moveConfirmed = false;
      if (columnChanged && destRules?.require_confirmation) {
        const ask = requestMoveConfirmation ?? (async () => false);
        const ok = await ask({ columnName: destCol?.name?.trim() || 'Coluna' });
        if (!ok) {
          isDraggingRef.current = false;
          setDndItems(buildItemMap(snapshot, sortedColumns));
          return;
        }
        moveConfirmed = true;
      }

      setCards((prev) =>
        prev.map((c) => (c.id === activeIdStr ? { ...c, column_id: targetCol, position: newPos } : c)),
      );
      isDraggingRef.current = false;

      try {
        const updated = await chatKanbanService.patchCard(activeIdStr, {
          column_id: targetCol,
          position: newPos,
          ...(moveReason ? { move_reason: moveReason } : {}),
          ...(moveConfirmed ? { move_confirmed: true } : {}),
        });
        const auto = updated.kanban_auto_created_proposal;
        if (auto) {
          if (auto.public_link_path?.trim()) {
            const full = `${window.location.origin}${auto.public_link_path.trim()}`;
            setStoredProposalPublicUrl(auto.id, full);
          }
          toast.success('Proposta criada automaticamente', {
            description: auto.title,
            action: auto.public_link_path
              ? {
                  label: 'Abrir link',
                  onClick: () =>
                    window.open(
                      `${window.location.origin}${auto.public_link_path!.trim()}`,
                      '_blank',
                      'noopener,noreferrer',
                    ),
                }
              : undefined,
          });
        }
        const { kanban_auto_created_proposal: _omitAuto, ...cardPayload } = updated;
        setCards((prev) =>
          prev.map((c) => (c.id === activeIdStr ? { ...c, ...cardPayload } : c)),
        );
        onCardSynced?.(cardPayload);
      } catch (e) {
        setCards(snapshot);
        setDndItems(buildItemMap(snapshot, sortedColumns));
        toast.error(e instanceof Error ? e.message : 'Não foi possível mover o cartão');
      }
    },
    [enabled, sortedColumns, setCards, requestMoveReason, requestMoveConfirmation, onCardSynced],
  );

  const onDragCancel = useCallback(() => {
    if (!enabled) return;
    setActiveId(null);
    isDraggingRef.current = false;
    setDndItems(buildItemMap(cards, sortedColumns));
  }, [enabled, cards, sortedColumns]);

  return {
    dndItems,
    sensors,
    collisionDetection: kanbanBoardCollisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    activeId,
  };
}
