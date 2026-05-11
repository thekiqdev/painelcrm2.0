import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Building2, CalendarPlus, FileText, GripHorizontal, ListTodo, MessageCircle, Phone, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { resolveProfileAvatarUrl } from '@/utils/chatIdentityDisplay';
import { formatDateOnlyPtBr } from '@/utils/formatCalendarDate';

const LEAD_KANBAN_DROP_PREFIX = 'lead-kanban-drop::';

function leadKanbanColumnDropId(status: string): string {
  return `${LEAD_KANBAN_DROP_PREFIX}${status}`;
}

function findContainerForItemId(id: string, items: Record<string, string[]>): string | undefined {
  if (id.startsWith(LEAD_KANBAN_DROP_PREFIX)) {
    return id.slice(LEAD_KANBAN_DROP_PREFIX.length);
  }
  for (const [colId, ids] of Object.entries(items)) {
    if (ids.includes(id)) return colId;
  }
  return undefined;
}

const leadKanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    const cardHit = pointerHits.find((h) => !String(h.id).startsWith(LEAD_KANBAN_DROP_PREFIX));
    return cardHit ? [cardHit] : pointerHits;
  }
  return closestCorners(args);
};

export type LeadKanbanLead = Record<string, unknown> & {
  id: string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  whatsapp_avatar_url?: string | null;
  profile_name?: string | null;
  assignee_display?: string | null;
  responsible_name?: string | null;
};

export type LeadKanbanStatus = {
  id: string;
  name: string;
  color: string;
};

type LeadKanbanAction = 'conversation' | 'task' | 'agenda' | 'proposal';

type LeadKanbanBoardProps = {
  leads: LeadKanbanLead[];
  statuses: LeadKanbanStatus[];
  loading?: boolean;
  getStatusVariant: (status: string) => { color: string };
  onOpenLead: (lead: LeadKanbanLead) => void;
  onStatusChange: (lead: LeadKanbanLead, nextStatus: string) => Promise<void>;
  onQuickAction: (lead: LeadKanbanLead, action: LeadKanbanAction) => void;
  canCreateProposal?: boolean;
};

function statusKey(status: string | null | undefined): string {
  const s = String(status ?? '').trim();
  return s || 'Sem status';
}

function buildItemMap(leads: LeadKanbanLead[], columns: LeadKanbanStatus[]): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const col of columns) m[col.name] = [];
  for (const lead of leads) {
    const key = statusKey(lead.status);
    if (!m[key]) m[key] = [];
    m[key].push(lead.id);
  }
  return m;
}

function itemMapsEqual(a: Record<string, string[]>, b: Record<string, string[]>, columns: LeadKanbanStatus[]): boolean {
  const keys = new Set([...columns.map((c) => c.name), ...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? []).join('\u0001') !== (b[key] ?? []).join('\u0001')) return false;
  }
  return true;
}

function formatLeadDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return formatDateOnlyPtBr(String(iso).slice(0, 10));
  } catch {
    return null;
  }
}

function compactResponsible(lead: LeadKanbanLead): string | null {
  const raw = lead.assignee_display || lead.responsible_name || lead.profile_name;
  const t = String(raw ?? '').trim();
  if (!t) return null;
  return t.split(/\s+/).slice(0, 2).join(' ');
}

function QuickActionButton({
  label,
  title,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  title: string;
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 rounded-md text-muted-foreground opacity-90 transition hover:bg-background hover:text-foreground sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-visible:opacity-100"
      title={title}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}

const LeadKanbanCard = memo(function LeadKanbanCard({
  lead,
  statusColor,
  onClick,
  dragHandleProps,
  onQuickAction,
  canCreateProposal,
}: {
  lead: LeadKanbanLead;
  statusColor: string;
  onClick: () => void;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  onQuickAction: (action: LeadKanbanAction) => void;
  canCreateProposal?: boolean;
}) {
  const avatar = resolveProfileAvatarUrl(lead, lead.whatsapp_avatar_url ?? null);
  const updated = formatLeadDate(lead.updated_at);
  const source = String(lead.source ?? '').trim();
  const responsible = compactResponsible(lead);
  const status = statusKey(lead.status);

  return (
    <div className="group/card relative w-full">
      <button
        type="button"
        {...dragHandleProps}
        data-lead-kanban-card-id={lead.id}
        className="relative w-full cursor-grab rounded-xl border border-border/70 bg-card p-3 text-left shadow-sm transition-[box-shadow,border-color,background-color,transform] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        onClick={onClick}
      >
        <div className="flex min-w-0 gap-2.5">
          <Avatar className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-border/60">
            {avatar.src ? <AvatarImage src={avatar.src} alt={String(lead.name ?? '')} className="object-cover" /> : null}
            <AvatarFallback className="rounded-lg text-xs font-semibold">{avatar.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-foreground">{lead.name || 'Lead sem nome'}</p>
                {lead.company ? (
                  <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                    <span className="truncate">{lead.company}</span>
                  </p>
                ) : null}
              </div>
              {updated ? <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{updated}</span> : null}
            </div>

            {lead.phone ? (
              <p className="flex items-center gap-1 truncate text-[11px] tabular-nums text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0 opacity-75" aria-hidden />
                {lead.phone}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-1 pt-0.5">
              <Badge variant="outline" className="h-5 max-w-[8.5rem] border-0 px-1.5 py-0 text-[10px] text-white" style={{ backgroundColor: statusColor }}>
                <span className="truncate">{status}</span>
              </Badge>
              {source ? (
                <Badge variant="secondary" className="h-5 max-w-[8rem] px-1.5 py-0 text-[10px] font-normal">
                  <span className="truncate">Origem: {source}</span>
                </Badge>
              ) : null}
              {responsible ? (
                <span className="inline-flex h-5 max-w-[8rem] items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 text-[10px] text-violet-900">
                  <UserRound className="h-2.5 w-2.5 shrink-0" aria-hidden />
                  <span className="truncate">{responsible}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </button>

      <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-0.5 rounded-lg border border-border/50 bg-background/95 p-0.5 shadow-sm opacity-95 sm:opacity-0 sm:transition-opacity sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100">
        <div className="pointer-events-auto flex items-center gap-0.5">
          <QuickActionButton
            label="Abrir conversa"
            title="Abrir conversa"
            icon={<MessageCircle className="h-3.5 w-3.5" aria-hidden />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickAction('conversation');
            }}
          />
          <QuickActionButton
            label="Criar tarefa"
            title="Criar tarefa"
            icon={<ListTodo className="h-3.5 w-3.5" aria-hidden />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickAction('task');
            }}
          />
          <QuickActionButton
            label="Abrir agenda"
            title="Agendar compromisso"
            icon={<CalendarPlus className="h-3.5 w-3.5" aria-hidden />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickAction('agenda');
            }}
          />
          <QuickActionButton
            label="Criar proposta"
            title={canCreateProposal ? 'Criar proposta' : 'Sem permissão para criar proposta'}
            disabled={!canCreateProposal}
            icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickAction('proposal');
            }}
          />
        </div>
      </div>
    </div>
  );
});

function LeadKanbanSortableCard({
  lead,
  statusColor,
  onOpenLead,
  onQuickAction,
  canCreateProposal,
}: {
  lead: LeadKanbanLead;
  statusColor: string;
  onOpenLead: (lead: LeadKanbanLead) => void;
  onQuickAction: (lead: LeadKanbanLead, action: LeadKanbanAction) => void;
  canCreateProposal?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { type: 'lead-kanban-card' },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative touch-none">
      <LeadKanbanCard
        lead={lead}
        statusColor={statusColor}
        onClick={() => onOpenLead(lead)}
        dragHandleProps={{ ...attributes, ...listeners }}
        onQuickAction={(action) => onQuickAction(lead, action)}
        canCreateProposal={canCreateProposal}
      />
      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 rounded-xl border border-dashed border-primary/25 bg-muted/40" aria-hidden />
      ) : null}
    </div>
  );
}

function LeadKanbanColumn({
  column,
  cardIds,
  leadMap,
  getStatusVariant,
  onOpenLead,
  onQuickAction,
  canCreateProposal,
}: {
  column: LeadKanbanStatus;
  cardIds: string[];
  leadMap: Map<string, LeadKanbanLead>;
  getStatusVariant: (status: string) => { color: string };
  onOpenLead: (lead: LeadKanbanLead) => void;
  onQuickAction: (lead: LeadKanbanLead, action: LeadKanbanAction) => void;
  canCreateProposal?: boolean;
}) {
  const dropId = leadKanbanColumnDropId(column.name);
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const orderedLeads = cardIds.map((id) => leadMap.get(id)).filter((lead): lead is LeadKanbanLead => lead != null);
  const color = column.color || getStatusVariant(column.name).color;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'kanban-column flex h-full min-h-[min(520px,78dvh)] w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm transition-[box-shadow,ring] sm:w-[300px]',
        isOver && 'shadow-md ring-2 ring-primary/20',
      )}
    >
      <CardHeader className="rounded-t-xl border-b bg-muted/60 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background" style={{ backgroundColor: color }} />
            <span className="truncate text-sm font-semibold">{column.name}</span>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {orderedLeads.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col bg-muted/10 p-0">
        <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]]:!block [&_[data-radix-scroll-area-viewport]]:max-h-full [&_[data-radix-scroll-area-viewport]]:min-h-[220px]">
          <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
            <div className={cn('flex min-h-full flex-col gap-2 p-2 transition-colors', isOver && orderedLeads.length > 0 && 'bg-primary/5')}>
              {orderedLeads.length === 0 ? (
                <div className="flex min-h-[220px] flex-1 flex-col justify-center rounded-lg border border-dashed border-border/60 bg-background/45 px-3 py-6 text-center">
                  <p className="text-xs font-medium text-muted-foreground">Nenhum lead nesta etapa.</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/90">Arraste um card para atualizar o status.</p>
                </div>
              ) : (
                orderedLeads.map((lead) => (
                  <LeadKanbanSortableCard
                    key={lead.id}
                    lead={lead}
                    statusColor={getStatusVariant(statusKey(lead.status)).color}
                    onOpenLead={onOpenLead}
                    onQuickAction={onQuickAction}
                    canCreateProposal={canCreateProposal}
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

export default function LeadKanbanBoard({
  leads,
  statuses,
  loading = false,
  getStatusVariant,
  onOpenLead,
  onStatusChange,
  onQuickAction,
  canCreateProposal = true,
}: LeadKanbanBoardProps) {
  const columns = useMemo(() => {
    const seen = new Set<string>();
    const base: LeadKanbanStatus[] = [];
    for (const status of statuses) {
      const name = String(status.name ?? '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      base.push({ ...status, name });
    }
    for (const lead of leads) {
      const key = statusKey(lead.status);
      if (!seen.has(key)) {
        seen.add(key);
        base.push({ id: key, name: key, color: getStatusVariant(key).color });
      }
    }
    return base;
  }, [statuses, leads, getStatusVariant]);

  const leadMap = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const [dndItems, setDndItems] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const dndItemsRef = useRef(dndItems);
  const rollbackRef = useRef<Record<string, string[]> | null>(null);
  dndItemsRef.current = dndItems;

  useEffect(() => {
    if (isDraggingRef.current) return;
    setDndItems(buildItemMap(leads, columns));
  }, [leads, columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      isDraggingRef.current = true;
      const current = buildItemMap(leads, columns);
      rollbackRef.current = current;
      setDndItems(current);
      setActiveId(String(event.active.id));
    },
    [leads, columns],
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
      if (overId.startsWith(LEAD_KANBAN_DROP_PREFIX)) {
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
      if (overId.startsWith(LEAD_KANBAN_DROP_PREFIX)) {
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

      if (!snapshot || !over) {
        if (snapshot) setDndItems(snapshot);
        return;
      }

      const finalMap = dndItemsRef.current;
      if (itemMapsEqual(snapshot, finalMap, columns)) return;

      const targetStatus = findContainerForItemId(activeIdStr, finalMap);
      const lead = leadMap.get(activeIdStr);
      if (!targetStatus || !lead) {
        setDndItems(snapshot);
        return;
      }

      if (statusKey(lead.status) === targetStatus) return;

      try {
        await onStatusChange(lead, targetStatus);
      } catch {
        setDndItems(snapshot);
      }
    },
    [columns, leadMap, onStatusChange],
  );

  const onDragCancel = useCallback(() => {
    setActiveId(null);
    isDraggingRef.current = false;
    setDndItems(buildItemMap(leads, columns));
  }, [leads, columns]);

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
    panStripState.current = { active: true, pointerId: e.pointerId, startX: e.clientX, startScroll: main.scrollLeft };
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

  const activeLead = activeId ? leadMap.get(activeId) : null;

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border/60 bg-muted/15 text-sm text-muted-foreground">
        Carregando Kanban de leads…
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={leadKanbanCollisionDetection}
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

        <div ref={boardScrollRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth scrollbar-thin">
          <div ref={boardInnerRef} className="flex h-full min-h-[min(68dvh,600px)] w-max items-stretch gap-3 px-2 py-2 sm:gap-4">
            {columns.map((column) => (
              <LeadKanbanColumn
                key={column.id}
                column={column}
                cardIds={dndItems[column.name] ?? []}
                leadMap={leadMap}
                getStatusVariant={getStatusVariant}
                onOpenLead={onOpenLead}
                onQuickAction={onQuickAction}
                canCreateProposal={canCreateProposal}
              />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
        {activeLead ? (
          <div className="pointer-events-none w-[280px] max-w-[86vw] rotate-1 scale-[1.02] opacity-95 shadow-2xl">
            <LeadKanbanCard
              lead={activeLead}
              statusColor={getStatusVariant(statusKey(activeLead.status)).color}
              onClick={() => {}}
              onQuickAction={() => {}}
              canCreateProposal={canCreateProposal}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
