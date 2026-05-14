import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ticketsService } from '@/services/tickets';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  Ticket,
  ticketStatusLabels,
  ticketPriorityLabels,
  ticketStatusColors,
  ticketPriorityColors,
  ticketChannelLabels,
} from '@/types/tickets';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';

export default function Tickets() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (user) {
      loadTickets();
    }
  }, [user, statusFilter, debouncedSearch]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const data = await ticketsService.getTickets({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: debouncedSearch || undefined,
      });
      setTickets(data);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar tickets',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getSLABadge = (ticket: Ticket) => {
    if (!ticket.resolution_due_at) return null;
    
    const now = new Date();
    const dueDate = new Date(ticket.resolution_due_at);
    const diffMs = dueDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffMs < 0) {
      return <Badge variant="destructive">SLA Vencido</Badge>;
    } else if (diffHours < 2) {
      return <Badge variant="destructive">A Vencer</Badge>;
    } else {
      return <Badge variant="default">No Prazo</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="md:hidden sticky top-0 z-30 -mx-0.5 border-b border-border/70 bg-background/95 px-0.5 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <MobilePageHeader
          title="Tickets"
          secondaryActions={[
            {
              icon: <List className="h-4 w-4" aria-hidden />,
              ariaLabel: 'Vista em lista',
              onClick: () => setViewMode('table'),
            },
            {
              icon: <LayoutGrid className="h-4 w-4" aria-hidden />,
              ariaLabel: 'Vista em kanban',
              onClick: () => setViewMode('kanban'),
            },
          ]}
          primaryAction={{
            label: 'Novo ticket',
            icon: <Plus className="h-4 w-4" aria-hidden />,
            onClick: () => navigate('/support/tickets/new'),
          }}
        />
      </div>
      <div className="hidden md:flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Tickets</h1>
          <p className="text-muted-foreground">Gerencie seus chamados e atendimentos</p>
        </div>
        <Button onClick={() => navigate('/support/tickets/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Ticket
        </Button>
      </div>

      {/* Filters and Search */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar por número, assunto ou cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="new">Novos</TabsTrigger>
              <TabsTrigger value="open">Abertos</TabsTrigger>
              <TabsTrigger value="in_progress">Em Andamento</TabsTrigger>
              <TabsTrigger value="waiting_customer">Aguardando</TabsTrigger>
              <TabsTrigger value="resolved">Resolvidos</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-2">
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('table')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Table View */}
      {viewMode === 'table' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr>
                  <th className="text-left p-4">Número</th>
                  <th className="text-left p-4">Assunto</th>
                  <th className="text-left p-4">Cliente</th>
                  <th className="text-left p-4">Prioridade</th>
                  <th className="text-left p-4">Status</th>
                  <th className="text-left p-4">SLA</th>
                  <th className="text-left p-4">Criado</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/support/tickets/${ticket.id}`)}
                  >
                    <td className="p-4 font-medium">{ticket.ticket_number}</td>
                    <td className="p-4">{ticket.subject}</td>
                    <td className="p-4">{ticket.contact_name}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={ticketPriorityColors[ticket.priority]}>
                          {ticketPriorityLabels[ticket.priority]}
                        </Badge>
                        <Badge variant="outline" className="text-xs font-normal">
                          {ticketChannelLabels[ticket.channel]}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge className={ticketStatusColors[ticket.status]}>
                        {ticketStatusLabels[ticket.status]}
                      </Badge>
                    </td>
                    <td className="p-4">{getSLABadge(ticket)}</td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(ticket.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {['new', 'open', 'in_progress', 'resolved'].map((status) => (
            <div key={status} className="space-y-3">
              <div className="font-semibold">
                {ticketStatusLabels[status as keyof typeof ticketStatusLabels]}
                <span className="ml-2 text-sm text-muted-foreground">
                  ({tickets.filter((t) => t.status === status).length})
                </span>
              </div>
              <div className="space-y-2">
                {tickets
                  .filter((t) => t.status === status)
                  .map((ticket) => (
                    <Card
                      key={ticket.id}
                      className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => navigate(`/support/tickets/${ticket.id}`)}
                    >
                      <div className="space-y-2">
                        <div className="font-medium text-sm">{ticket.ticket_number}</div>
                        <div className="text-sm">{ticket.subject}</div>
                        <div className="flex items-center justify-between">
                          <Badge className={ticketPriorityColors[ticket.priority]} variant="outline">
                            {ticketPriorityLabels[ticket.priority]}
                          </Badge>
                          {getSLABadge(ticket)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ticket.contact_name}
                        </div>
                      </div>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tickets.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Nenhum ticket encontrado</p>
        </Card>
      )}
    </div>
  );
}
