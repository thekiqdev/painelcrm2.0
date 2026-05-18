import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types/tickets';
import type { Member } from '@/services/members';
import { isTicketClosedLocked } from '@/lib/ticketStatusControl';
import {
  TICKET_KANBAN_COLUMN_DEFS,
  ticketKanbanColumn,
  type TicketKanbanColumnDef,
} from '@/utils/ticketsKanbanStatus';
import { sortTicketsInKanbanColumn } from '@/utils/ticketKanbanDisplay';
import {
  TicketKanbanCard,
  type TicketKanbanQuickAction,
} from '@/components/tickets/TicketKanbanCard';

const TICKET_KANBAN_DROP_PREFIX = 'ticket-kanban-drop::';

function ticketKanbanColumnDropId(status: string): string {
  return `${TICKET_KANBAN_DROP_PREFIX}${status}`;
}

function findContainerForItemId(id: string, items: Record<string, string[]>): string | undefined {
  if (id.startsWith(TICKET_KANBAN_DROP_PREFIX)) {
    return id.slice(TICKET_KANBAN_DROP_PREFIX.length);
  }
  for (const [colId, ids] of Object.entries(items)) {
    if (ids.includes(id)) return colId;
  }
  return undefined;
}

const ticketKanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    const cardHit = pointerHits.find((h) => !String(h.id).startsWith(TICKET_KANBAN_DROP_PREFIX));
    return cardHit ? [cardHit] : pointerHits;
  }
  return closestCorners(args);
};

function statusKey(status: string | null | undefined): string {
  const s = String(status ?? '').trim();
  return s || 'new';
}

function buildItemMap(tickets: Ticket[], columns: TicketKanbanColumnDef[]): Record<string, string[]> {
  const ticketMap = new Map(tickets.map((t) => [t.id, t]));
  const m: Record<string, string[]> = {};
  for (const col of columns) m[col.id] = [];
  for (const ticket of tickets) {
    const key = ticketKanbanColumn(ticket);
    if (!key) continue;
    if (!m[key]) m[key] = [];
    m[key].push(ticket.id);
  }
  for (const col of columns) {
    const sorted = sortTicketsInKanbanColumn(
      (m[col.id] ?? []).map((id) => ticketMap.get(id)).filter((t): t is Ticket => t != null)
    );
    m[col.id] = sorted.map((t) => t.id);
  }
  return m;
}

function itemMapsEqual(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
  columns: TicketKanbanColumnDef[]
): boolean {
  const keys = new Set([...columns.map((c) => c.id), ...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? []).join('\u0001') !== (b[key] ?? []).join('\u0001')) return false;
  }
  return true;
}

function TicketKanbanSortableCard({
  ticket,
  columnColor,
  assignee,
  selected,
  selectionMode,
  currentUserId,
  onOpenTicket,
  onQuickAction,
  onToggleSelect,
}: {
  ticket: Ticket;
  columnColor: string;
  assignee?: Member;
  selected: boolean;
  selectionMode: boolean;
  currentUserId?: string;
  onOpenTicket: (ticket: Ticket) => void;
  onQuickAction: (ticket: Ticket, action: TicketKanbanQuickAction) => void;
  onToggleSelect: (ticketId: string, checked: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    data: { type: 'ticket-kanban-card' },
    disabled: selectionMode,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const locked = isTicketClosedLocked(ticket.status);
  const isMine = Boolean(currentUserId && ticket.assignee_id === currentUserId);
  const canResolve = !locked && ticket.status !== 'resolved' && ticket.status !== 'closed';
  const canAssignToMe = Boolean(currentUserId && !isMine && !locked);

  return (
    <div ref={setNodeRef} style={style} className="relative touch-none">
      <TicketKanbanCard
        ticket={ticket}
        columnColor={columnColor}
        assignee={assignee}
        selected={selected}
        onClick={() => onOpenTicket(ticket)}
        dragHandleProps={selectionMode ? undefined : { ...attributes, ...listeners }}
        onQuickAction={(action) => onQuickAction(ticket, action)}
        onToggleSelect={(checked) => onToggleSelect(ticket.id, checked)}
        canResolve={canResolve}
        canAssignToMe={canAssignToMe}
      />
      {isDragging ? (
        <div
          className="pointer-events-none absolute inset-0 rounded-xl border border-dashed border-primary/25 bg-muted/40"
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function TicketKanbanColumn({
  column,
  cardIds,
  ticketMap,
  membersById,
  currentUserId,
  selectedIds,
  selectionMode,
  onOpenTicket,
  onQuickAction,
  onToggleSelect,
}: {
  column: TicketKanbanColumnDef;
  cardIds: string[];
  ticketMap: Map<string, Ticket>;
  membersById: Record<string, Member>;
  currentUserId?: string;
  selectedIds: Set<string>;
  selectionMode: boolean;
  onOpenTicket: (ticket: Ticket) => void;
  onQuickAction: (ticket: Ticket, action: TicketKanbanQuickAction) => void;
  onToggleSelect: (ticketId: string, checked: boolean) => void;
}) {
  const dropId = ticketKanbanColumnDropId(column.id);
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const orderedTickets = cardIds
    .map((id) => ticketMap.get(id))
    .filter((ticket): ticket is Ticket => ticket != null);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'kanban-column flex h-full min-h-[min(520px,78dvh)] w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm transition-[box-shadow,ring] sm:w-[300px]',
        isOver && 'shadow-md ring-2 ring-primary/20'
      )}
    >
      <CardHeader className="rounded-t-xl border-b bg-muted/60 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background"
              style={{ backgroundColor: column.color }}
            />
            <span className="truncate text-sm font-semibold">{column.label}</span>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {orderedTickets.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col bg-muted/10 p-0">
        <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]]:!block [&_[data-radix-scroll-area-viewport]]:max-h-full [&_[data-radix-scroll-area-viewport]]:min-h-[220px]">
          <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
            <div
              className={cn(
                'flex min-h-full flex-col gap-2 p-2 transition-colors',
                isOver && orderedTickets.length > 0 && 'bg-primary/5'
              )}
            >
              {orderedTickets.length === 0 ? (
                <div className="flex min-h-[220px] flex-1 flex-col justify-center rounded-lg border border-dashed border-border/60 bg-background/45 px-3 py-6 text-center">
                  <p className="text-xs font-medium text-muted-foreground">Nenhum ticket nesta etapa.</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/90">
                    Arraste um card para atualizar o status.
                  </p>
                </div>
              ) : (
                orderedTickets.map((ticket) => (
                  <TicketKanbanSortableCard
                    key={ticket.id}
                    ticket={ticket}
                    columnColor={column.color}
                    assignee={
                      ticket.assignee_id ? membersById[ticket.assignee_id] : undefined
                    }
                    selected={selectedIds.has(ticket.id)}
                    selectionMode={selectionMode}
                    currentUserId={currentUserId}
                    onOpenTicket={onOpenTicket}
                    onQuickAction={onQuickAction}
                    onToggleSelect={onToggleSelect}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </ScrollArea>
      </CardContent>
    </div>
  );
}

export interface TicketsKanbanBoardProps {
  tickets: Ticket[];
  membersById: Record<string, Member>;
  loading?: boolean;
  currentUserId?: string;
  selectedIds: Set<string>;
  onToggleSelect: (ticketId: string, checked: boolean) => void;
  onStatusChange: (ticket: Ticket, nextStatus: string) => Promise<void>;
  onOpenTicket: (ticket: Ticket) => void;
  onResolveTicket: (ticket: Ticket) => void | Promise<void>;
  onAssignToMe: (ticket: Ticket) => void | Promise<void>;
}

export function TicketsKanbanBoard({
  tickets,
  membersById,
  loading = false,
  currentUserId,
  selectedIds,
  onToggleSelect,
  onStatusChange,
  onOpenTicket,
  onResolveTicket,
  onAssignToMe,
}: TicketsKanbanBoardProps) {
  const columns = TICKET_KANBAN_COLUMN_DEFS;
  const ticketMap = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const selectionMode = selectedIds.size > 0;

  const [dndItems, setDndItems] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const dndItemsRef = useRef(dndItems);
  const rollbackRef = useRef<Record<string, string[]> | null>(null);
  dndItemsRef.current = dndItems;

  useEffect(() => {
    if (isDraggingRef.current) return;
    setDndItems(buildItemMap(tickets, columns));
  }, [tickets, columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: selectionMode ? 9999 : 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      if (selectionMode) return;
      isDraggingRef.current = true;
      const current = buildItemMap(tickets, columns);
      rollbackRef.current = current;
      setDndItems(current);
      setActiveId(String(event.active.id));
    },
    [tickets, columns, selectionMode]
  );

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    const activeIdStr = String(active.id);
    if (!over) return;
    const overId = String(over.id);
    if (activeIdStr === overId) return;

    const activeContainer = findContainerForItemId(activeIdStr, dndItemsRef.current);
    const overContainer = findContainerForItemId(overId, dndItemsRef.current);
    if (!activeContainer || !overContainer) return;

    if (activeContainer === overContainer) {
      if (overId.startsWith(TICKET_KANBAN_DROP_PREFIX)) {
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
      if (overId.startsWith(TICKET_KANBAN_DROP_PREFIX)) {
        to.push(activeIdStr);
      } else {
        const overIdx = to.indexOf(overId);
        if (overIdx === -1) to.push(activeIdStr);
        else to.splice(overIdx, 0, activeIdStr);
      }
      return { ...prev, [activeContainer]: from, [overContainer]: to };
    });
  }, []);

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      const activeIdStr = String(active.id);
      setActiveId(null);

      const snapshot = rollbackRef.current;
      isDraggingRef.current = false;

      if (!snapshot || !over || selectionMode) {
        if (snapshot) setDndItems(snapshot);
        return;
      }

      const finalMap = dndItemsRef.current;
      if (itemMapsEqual(snapshot, finalMap, columns)) return;

      const targetStatus = findContainerForItemId(activeIdStr, finalMap);
      const ticket = ticketMap.get(activeIdStr);
      if (!targetStatus || !ticket) {
        setDndItems(snapshot);
        return;
      }

      if (isTicketClosedLocked(ticket.status)) {
        setDndItems(snapshot);
        return;
      }

      if (statusKey(ticket.status) === targetStatus) return;

      try {
        await onStatusChange(ticket, targetStatus);
      } catch {
        setDndItems(snapshot);
      }
    },
    [columns, ticketMap, onStatusChange, selectionMode]
  );

  const onDragCancel = useCallback(() => {
    setActiveId(null);
    isDraggingRef.current = false;
    setDndItems(buildItemMap(tickets, columns));
  }, [tickets, columns]);

  const handleQuickAction = useCallback(
    (ticket: Ticket, action: TicketKanbanQuickAction) => {
      if (action === 'open') onOpenTicket(ticket);
      else if (action === 'resolve') void onResolveTicket(ticket);
      else if (action === 'assign') void onAssignToMe(ticket);
    },
    [onOpenTicket, onResolveTicket, onAssignToMe]
  );

  const boardScrollRef = useRef<HTMLDivElement>(null);
  const boardInnerRef = useRef<HTMLDivElement>(null);
  const panStripState = useRef({ active: false, pointerId: 0, startX: 0, startScroll: 0 });
  const [boardHScroll, setBoardHScroll] = useState({ scrollWidth: 0, clientWidth: 0 });

  useLayoutEffect(() => {
    const main = boardScrollRef.current;
    const inner = boardInnerRef.current;
    if (!main || !inner) return;
    const update = () => {
      setBoardHScroll({ scrollWidth: main.scrollWidth, clientWidth: main.clientWidth });
    };
    const ro = new ResizeObserver(update);
    ro.observe(main);
    ro.observe(inner);
    update();
    return () => ro.disconnect();
  }, [columns.length, loading]);

  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        el.scrollLeft += e.deltaX;
        e.preventDefault();
      } else if (e.shiftKey) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [columns.length, loading]);

  const hasHorizontalOverflow = boardHScroll.scrollWidth > boardHScroll.clientWidth + 2;

  const onPanStripPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const main = boardScrollRef.current;
    if (!main || main.scrollWidth <= main.clientWidth) return;
    panStripState.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: main.scrollLeft,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPanStripPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!panStripState.current.active) return;
    const main = boardScrollRef.current;
    if (!main) return;
    main.scrollLeft = panStripState.current.startScroll - (e.clientX - panStripState.current.startX);
  };

  const onPanStripPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!panStripState.current.active) return;
    panStripState.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(panStripState.current.pointerId);
    } catch {
      /* ignore */
    }
  };

  const activeTicket = activeId ? ticketMap.get(activeId) : null;
  const activeColumn = activeTicket ? ticketKanbanColumn(activeTicket) : null;
  const activeColumnDef = activeColumn
    ? columns.find((c) => c.id === activeColumn)
    : columns[0];

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border/60 bg-muted/15 text-sm text-muted-foreground">
        Carregando Kanban de tickets…
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={ticketKanbanCollisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex min-h-[min(72dvh,650px)] min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-muted/20 px-1 pt-1 pb-2 shadow-inner">
        {hasHorizontalOverflow ? (
          <div
            className="mb-1.5 flex h-6 shrink-0 cursor-grab select-none items-center justify-center gap-1 rounded-md border border-border/40 bg-background/70 px-2 text-[11px] leading-tight text-muted-foreground hover:bg-background active:cursor-grabbing"
            onPointerDown={onPanStripPointerDown}
            onPointerMove={onPanStripPointerMove}
            onPointerUp={onPanStripPointerUp}
            onPointerCancel={onPanStripPointerUp}
            title="Clique e arraste para deslocar o quadro"
          >
            <GripHorizontal className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
            Arraste para mover o quadro horizontalmente
          </div>
        ) : null}

        <div
          ref={boardScrollRef}
          className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth scrollbar-thin"
        >
          <div
            ref={boardInnerRef}
            className="flex h-full min-h-[min(68dvh,600px)] w-max items-stretch gap-3 px-2 py-2 sm:gap-4"
          >
            {columns.map((column) => (
              <TicketKanbanColumn
                key={column.id}
                column={column}
                cardIds={dndItems[column.id] ?? []}
                ticketMap={ticketMap}
                membersById={membersById}
                currentUserId={currentUserId}
                selectedIds={selectedIds}
                selectionMode={selectionMode}
                onOpenTicket={onOpenTicket}
                onQuickAction={handleQuickAction}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
        {activeTicket ? (
          <div className="pointer-events-none w-[280px] max-w-[86vw] rotate-1 scale-[1.02] opacity-95 shadow-2xl">
            <TicketKanbanCard
              ticket={activeTicket}
              columnColor={activeColumnDef?.color ?? '#6b7280'}
              assignee={
                activeTicket.assignee_id ? membersById[activeTicket.assignee_id] : undefined
              }
              onClick={() => {}}
              onQuickAction={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default TicketsKanbanBoard;
