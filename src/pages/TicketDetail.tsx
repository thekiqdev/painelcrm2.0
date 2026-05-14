import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ticketsService } from "@/services/tickets";
import {
  ticketChannelLabels,
  ticketPriorityColors,
  ticketPriorityLabels,
  ticketStatusColors,
  ticketStatusLabels,
} from "@/types/tickets";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");

  const { data: ticket, isPending, error } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => ticketsService.getTicketById(id!),
    enabled: Boolean(id),
  });

  const { data: messages = [], isPending: messagesPending } = useQuery({
    queryKey: ["ticket-messages", id],
    queryFn: () => ticketsService.getTicketMessages(id!),
    enabled: Boolean(id) && Boolean(ticket?.id),
  });

  const replyMutation = useMutation({
    mutationFn: () => ticketsService.createTicketMessage(id!, { content: replyText.trim(), visibility: "public" }),
    onSuccess: async () => {
      setReplyText("");
      await queryClient.invalidateQueries({ queryKey: ["ticket-messages", id] });
      await queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      toast({ title: "Resposta enviada" });
    },
    onError: (e) => {
      toast({
        title: "Erro ao enviar resposta",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      });
    },
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
        <>
          <Card>
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{ticket.ticket_number}</Badge>
                <Badge className={ticketStatusColors[ticket.status]}>{ticketStatusLabels[ticket.status]}</Badge>
                <Badge className={ticketPriorityColors[ticket.priority]} variant="outline">
                  {ticketPriorityLabels[ticket.priority]}
                </Badge>
                <Badge variant="secondary" className="text-xs font-normal">
                  {ticketChannelLabels[ticket.channel]}
                </Badge>
              </div>
              <CardTitle className="text-xl leading-snug">{ticket.subject}</CardTitle>
              <CardDescription className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                <span>{ticket.contact_name}</span>
                {ticket.contact_phone ? <span>{ticket.contact_phone}</span> : null}
                {ticket.contact_email ? <span className="break-all">{ticket.contact_email}</span> : null}
                {ticket.channel === "portal" ? (
                  <span className="text-xs text-muted-foreground">Origem: Portal público</span>
                ) : null}
                {ticket.client_id ? (
                  <Link to={`/clients/${ticket.client_id}`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                    Abrir cliente no CRM
                  </Link>
                ) : null}
                {ticket.custom_fields &&
                typeof ticket.custom_fields === "object" &&
                ticket.custom_fields !== null &&
                "phone_match_conflict" in ticket.custom_fields &&
                (ticket.custom_fields as { phone_match_conflict?: boolean }).phone_match_conflict ? (
                  <span className="text-xs text-amber-700 dark:text-amber-500">
                    Telefone coincidente com vários clientes — sem vínculo automático.
                  </span>
                ) : null}
                <span className="text-xs">
                  Atualizado{" "}
                  {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true, locale: ptBR })}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.description ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Descrição inicial</p>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{ticket.description}</div>
                </div>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Conversa</CardTitle>
              <CardDescription>Mensagens públicas do chamado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {messagesPending ? (
                <p className="text-sm text-muted-foreground">Carregando mensagens…</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma mensagem na thread.</p>
              ) : (
                <ul className="space-y-3">
                  {messages.map((m: any) => (
                    <li key={m.id} className="rounded-lg border bg-card p-3 text-sm">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{m.user?.email ?? "Utilizador"}</span>
                        <span>
                          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                      {m.visibility === "internal" ? (
                        <Badge variant="outline" className="mb-2 text-[10px]">
                          Interno
                        </Badge>
                      ) : null}
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="ticket-reply">Responder</Label>
                <Textarea
                  id="ticket-reply"
                  rows={4}
                  placeholder="Escreva uma resposta…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <Button
                  type="button"
                  disabled={replyMutation.isPending || !replyText.trim()}
                  onClick={() => replyMutation.mutate()}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Enviar resposta
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
