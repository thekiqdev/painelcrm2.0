import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ticketsService } from "@/services/tickets";
import { ticketPriorityColors, ticketPriorityLabels, ticketStatusColors, ticketStatusLabels } from "@/types/tickets";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: ticket, isPending, error } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => ticketsService.getTicketById(id!),
    enabled: Boolean(id),
  });

  if (!id) {
    return (
      <div className="container mx-auto max-w-3xl p-4 md:p-6">
        <p className="text-sm text-muted-foreground">Ticket inválido.</p>
        <Button asChild variant="link" className="mt-2 px-0">
          <Link to="/support/tickets">Voltar para tickets</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 md:hidden"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
          <Link to="/support/tickets">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Lista de tickets
          </Link>
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Carregando ticket…</p>
      ) : error || !ticket ? (
        <Card>
          <CardHeader>
            <CardTitle>Não foi possível carregar</CardTitle>
            <CardDescription>O ticket pode ter sido removido ou você não tem acesso.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/support/tickets">Ir para tickets</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{ticket.ticket_number}</Badge>
              <Badge className={ticketStatusColors[ticket.status]}>{ticketStatusLabels[ticket.status]}</Badge>
              <Badge className={ticketPriorityColors[ticket.priority]} variant="outline">
                {ticketPriorityLabels[ticket.priority]}
              </Badge>
            </div>
            <CardTitle className="text-xl leading-snug">{ticket.subject}</CardTitle>
            <CardDescription className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
              <span>{ticket.contact_name}</span>
              {ticket.contact_email ? <span className="break-all">{ticket.contact_email}</span> : null}
              <span className="text-xs">
                Atualizado{" "}
                {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true, locale: ptBR })}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ticket.description ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{ticket.description}</div>
            ) : (
              <p className="text-sm text-muted-foreground">Sem descrição.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/support/tickets">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ver na lista
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
