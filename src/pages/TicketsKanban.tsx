import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, List, ListFilter, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ticketsService } from '@/services/tickets';
import { membersService } from '@/services/members';
import { TicketsKanbanBoard } from '@/components/tickets/TicketsKanbanBoard';
import { TicketsKanbanStatsBar } from '@/components/tickets/TicketsKanbanStatsBar';
import { TicketsKanbanBulkBar } from '@/components/tickets/TicketsKanbanBulkBar';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { Ticket } from '@/types/tickets';
import type { TicketsKanbanColumnId } from '@/utils/ticketsKanbanStatus';
import { isTicketOnKanban } from '@/utils/ticketsKanbanStatus';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { cn } from '@/lib/utils';

type QuickFilter = 'unassigned' | 'urgent' | 'no_response';

export default function TicketsKanban() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [myQueueActive, setMyQueueActive] = useState(false);
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const queryKey = [
    'tickets',
    'kanban',
    debouncedSearch,
    myQueueActive,
    quickFilters.join(','),
  ] as const;

  const { data: ticketsRaw = [], isPending } = useQuery({
    queryKey,
    queryFn: () =>
      ticketsService.getTickets({
        search: debouncedSearch || undefined,
        my_queue: myQueueActive || undefined,
        unassigned: quickFilters.includes('unassigned'),
        no_response: quickFilters.includes('no_response'),
        priority: quickFilters.includes('urgent') ? 'urgent' : undefined,
      }),
  });

  const { data: stats, isPending: statsPending } = useQuery({
    queryKey: ['tickets', 'kanban-stats'],
    queryFn: () => ticketsService.getKanbanStats(),
    staleTime: 60_000,
  });

  const tickets = useMemo(() => ticketsRaw.filter(isTicketOnKanban), [ticketsRaw]);
  const hiddenCount = ticketsRaw.length - tickets.length;

  const { data: members = [] } = useQuery({
    queryKey: ['members', 'tickets-kanban'],
    queryFn: () => membersService.getMembers(),
    staleTime: 120_000,
  });

  const membersById = useMemo(() => {
    const m: Record<string, (typeof members)[0]> = {};
    for (const member of members) m[member.id] = member;
    return m;
  }, [members]);

  const toggleQuickFilter = (f: QuickFilter) => {
    setQuickFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['tickets'] });
  }, [queryClient]);

  const patchTicketOptimistic = useCallback(
    async (ticketId: string, patch: Partial<Ticket>, successTitle: string) => {
      const prev = queryClient.getQueryData<Ticket[]>(queryKey);
      if (prev) {
        queryClient.setQueryData<Ticket[]>(
          queryKey,
          prev.map((t) => (t.id === ticketId ? { ...t, ...patch } : t))
        );
      }
      try {
        await ticketsService.updateTicket(ticketId, patch);
        await invalidateAll();
        toast({ title: successTitle });
      } catch (e) {
        if (prev) queryClient.setQueryData(queryKey, prev);
        toast({
          title: 'Erro ao atualizar ticket',
          description: e instanceof Error ? e.message : 'Tente novamente',
          variant: 'destructive',
        });
      }
    },
    [queryClient, queryKey, invalidateAll]
  );

  const handleStatusChange = useCallback(
    async (ticket: Ticket, nextStatus: string) => {
      await patchTicketOptimistic(
        ticket.id,
        { status: nextStatus as TicketsKanbanColumnId },
        'Status atualizado'
      );
    },
    [patchTicketOptimistic]
  );

  const handleResolveTicket = useCallback(
    async (ticket: Ticket) => {
      await patchTicketOptimistic(ticket.id, { status: 'resolved' }, 'Ticket resolvido');
    },
    [patchTicketOptimistic]
  );

  const handleAssignToMe = useCallback(
    async (ticket: Ticket) => {
      if (!user?.id) return;
      await patchTicketOptimistic(ticket.id, { assignee_id: user.id }, 'Ticket atribuído a você');
    },
    [patchTicketOptimistic, user?.id]
  );

  const handleOpenTicket = useCallback(
    (ticket: Ticket) => {
      navigate(`/support/tickets/${ticket.id}`);
    },
    [navigate]
  );

  const handleToggleSelect = useCallback((ticketId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(ticketId);
      else next.delete(ticketId);
      return next;
    });
  }, []);

  const runBulk = useCallback(
    async (action: 'resolve' | 'assign' | 'add_tag', extra?: { assignee_id?: string; tag?: string }) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      setBulkBusy(true);
      const prev = queryClient.getQueryData<Ticket[]>(queryKey);
      try {
        await ticketsService.bulkUpdateTickets({
          ids,
          action,
          assignee_id: extra?.assignee_id,
          tag: extra?.tag,
        });
        setSelectedIds(new Set());
        await invalidateAll();
        toast({
          title:
            action === 'resolve'
              ? 'Tickets resolvidos'
              : action === 'assign'
                ? 'Tickets atribuídos'
                : 'Tag adicionada',
        });
      } catch (e) {
        if (prev) queryClient.setQueryData(queryKey, prev);
        toast({
          title: 'Erro na ação em massa',
          description: e instanceof Error ? e.message : 'Tente novamente',
          variant: 'destructive',
        });
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedIds, queryClient, queryKey, invalidateAll]
  );

  const quickFilterDefs: { id: QuickFilter; label: string }[] = [
    { id: 'unassigned', label: 'Não atribuídos' },
    { id: 'urgent', label: 'Urgentes' },
    { id: 'no_response', label: 'Sem resposta' },
  ];

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 pb-24">
      <div className="md:hidden">
        <MobilePageHeader
          title="Kanban"
          secondaryActions={[
            {
              icon: <List className="h-4 w-4" aria-hidden />,
              ariaLabel: 'Lista de tickets',
              onClick: () => navigate('/support/tickets'),
            },
          ]}
          primaryAction={{
            label: 'Novo',
            icon: <Plus className="h-4 w-4" aria-hidden />,
            onClick: () => navigate('/support/tickets/new'),
          }}
        />
      </div>

      <div className="hidden md:flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/support/tickets">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Lista
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Tickets — Kanban</h1>
            <p className="text-sm text-muted-foreground">Gestão visual e ações em massa</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/support/tickets">
              <List className="mr-2 h-4 w-4" />
              Vista em lista
            </Link>
          </Button>
          <Button size="sm" onClick={() => navigate('/support/tickets/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Novo ticket
          </Button>
        </div>
      </div>

      <TicketsKanbanStatsBar stats={stats} loading={statsPending} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <Button
            type="button"
            variant={myQueueActive ? 'default' : 'outline'}
            size="sm"
            className="shrink-0"
            disabled={!user?.id}
            onClick={() => {
              setMyQueueActive((v) => !v);
              if (!myQueueActive) setQuickFilters([]);
            }}
          >
            <ListFilter className="mr-2 h-4 w-4" aria-hidden />
            Minha fila
          </Button>

          <div className="flex flex-wrap gap-1.5">
            {quickFilterDefs.map((f) => {
              const active = quickFilters.includes(f.id);
              return (
                <Badge
                  key={f.id}
                  variant={active ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer select-none px-2.5 py-1 text-xs font-normal',
                    !active && 'hover:bg-muted',
                    myQueueActive && 'pointer-events-none opacity-50'
                  )}
                  role="button"
                  tabIndex={myQueueActive ? -1 : 0}
                  onClick={() => !myQueueActive && toggleQuickFilter(f.id)}
                  onKeyDown={(e) => {
                    if (myQueueActive) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleQuickFilter(f.id);
                    }
                  }}
                >
                  {f.label}
                </Badge>
              );
            })}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar assunto ou número…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {myQueueActive ? (
          <p className="text-xs text-muted-foreground">
            Minha fila: seus tickets sem resposta da equipe ou que não estão aguardando cliente.
          </p>
        ) : null}
      </div>

      {hiddenCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {hiddenCount} ticket(s) com status fora do kanban não exibidos aqui.
        </p>
      ) : null}

      <TicketsKanbanBoard
        tickets={tickets}
        membersById={membersById}
        loading={isPending}
        currentUserId={user?.id}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onStatusChange={handleStatusChange}
        onOpenTicket={handleOpenTicket}
        onResolveTicket={handleResolveTicket}
        onAssignToMe={handleAssignToMe}
      />

      <TicketsKanbanBulkBar
        selectedCount={selectedIds.size}
        members={members}
        currentUserId={user?.id}
        busy={bulkBusy}
        onClear={() => setSelectedIds(new Set())}
        onResolve={() => void runBulk('resolve')}
        onAssign={(assigneeId) => void runBulk('assign', { assignee_id: assigneeId })}
        onAddTag={(tag) => void runBulk('add_tag', { tag })}
      />
    </div>
  );
}
