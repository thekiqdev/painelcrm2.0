import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, Ticket } from "lucide-react";
import { ticketsService } from "@/services/tickets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Ticket } from "@/types/tickets";
import { ticketPriorityLabels, ticketStatusLabels } from "@/types/tickets";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const CLOSED_LIKE: Set<string> = new Set(["closed", "cancelled"]);

type Props = {
  clientId: string;
};

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "new" || status === "open") return "default";
  if (status === "resolved") return "secondary";
  if (status === "cancelled") return "destructive";
  return "outline";
}

export function ClientProfileTicketsTab({ clientId }: Props) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["client-tickets", clientId],
    queryFn: () => ticketsService.getTickets({ client_id: clientId }),
    enabled: Boolean(clientId),
  });

  const openTickets = useMemo(() => {
    const rows = data ?? [];
    return rows.filter((t) => !CLOSED_LIKE.has(t.status));
  }, [data]);

  const formatDt = (iso: string) => {
    try {
      return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return iso;
    }
  };

  const renderRow = (t: Ticket) => (
    <TableRow key={t.id}>
      <TableCell className="font-mono text-xs sm:text-sm">{t.ticket_number}</TableCell>
      <TableCell className="max-w-[200px] truncate sm:max-w-xs" title={t.subject}>
        {t.subject}
      </TableCell>
      <TableCell>
        <Badge variant={statusBadgeVariant(t.status)} className="whitespace-nowrap text-[11px] font-normal">
          {ticketStatusLabels[t.status] ?? t.status}
        </Badge>
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {ticketPriorityLabels[t.priority] ?? t.priority}
      </TableCell>
      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{formatDt(t.created_at)}</TableCell>
      <TableCell className="text-right">
        <Button asChild variant="outline" size="sm" className="h-8 text-xs">
          <Link to={`/support/tickets/${t.id}`}>Abrir</Link>
        </Button>
      </TableCell>
    </TableRow>
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ticket className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            Chamados de suporte
          </CardTitle>
          <CardDescription>
            Chamados abertos vinculados a este cliente (portal ou CRM). Encerrados não aparecem nesta lista.
          </CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span className="text-sm">A carregar chamados…</span>
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "Erro ao carregar chamados."}
          </p>
        ) : openTickets.length === 0 ? (
          <div className="space-y-2 py-10 text-center text-sm text-muted-foreground">
            <p>Nenhum chamado aberto vinculado a este cliente.</p>
            <p className="text-xs">
              Chamados criados pelo portal passam a aparecer aqui quando o telefone corresponde ao cadastro.
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-2">
              <Link to="/support/tickets">Ver todos os chamados</Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[1%] whitespace-nowrap">Protocolo</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead className="w-[1%]">Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">Prioridade</TableHead>
                  <TableHead className="hidden md:table-cell">Aberto em</TableHead>
                  <TableHead className="w-[1%] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>{openTickets.map(renderRow)}</TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
