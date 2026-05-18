import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, RotateCcw, Send, X } from "lucide-react";
import { ClientEntityLink, LeadEntityLink } from "@/components/entities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ticketsService } from "@/services/tickets";
import { membersService } from "@/services/members";
import {
  ticketChannelLabels,
  ticketPriorityLabels,
  type TicketPriority,
  type TicketStatus,
} from "@/types/tickets";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useMemo, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { clientsService } from "@/services/clients";
import { formatTicketActivity } from "@/lib/ticketActivityLabels";
import {
  canReopenTicket,
  getEditableStatusOptions,
  isTicketClosedLocked,
  statusOptionLabel,
} from "@/lib/ticketStatusControl";
import { cn } from "@/lib/utils";

const PRIORITY_OPTIONS: TicketPriority[] = ["low", "normal", "high", "urgent"];

const UNASSIGNED = "__none__";

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String).filter(Boolean);
    } catch {
      /* ignore */
    }
  }
  return [];
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  const { data: ticket, isPending, error } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => ticketsService.getTicketById(id!),
    enabled: Boolean(id),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["ticket-categories"],
    queryFn: () => ticketsService.getTicketCategories(),
    staleTime: 120_000,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members", "ticket-detail"],
    queryFn: () => membersService.getMembers(),
    staleTime: 120_000,
  });

  const { data: clientsList = [] } = useQuery({
    queryKey: ["clients", "ticket-detail", ticket?.client_id],
    queryFn: () => clientsService.getClients(),
    enabled: Boolean(ticket?.client_id),
    staleTime: 120_000,
  });

  const linkedClientDisplayName = useMemo(() => {
    if (!ticket?.client_id) return null;
    const fromApi = ticket.client_name?.trim();
    if (fromApi) return fromApi;
    const tid = String(ticket.client_id).trim();
    const c = clientsList.find((x) => x.id === tid);
    const label = (c?.name || c?.company || c?.email || "").trim();
    return label || null;
  }, [ticket?.client_id, ticket?.client_name, clientsList]);

  const tags = useMemo(() => parseTags(ticket?.tags), [ticket?.tags]);

  const isLocked = ticket ? isTicketClosedLocked(ticket.status) : false;
  const statusOptions = ticket ? getEditableStatusOptions(ticket.status) : [];
  const showReopen = ticket ? canReopenTicket(ticket.status) : false;

  const { data: messages = [], isPending: messagesPending } = useQuery({
    queryKey: ["ticket-messages", id],
    queryFn: () => ticketsService.getTicketMessages(id!),
    enabled: Boolean(id) && Boolean(ticket?.id),
  });

  const { data: activities = [], isPending: activitiesPending } = useQuery({
    queryKey: ["ticket-activities", id],
    queryFn: () => ticketsService.getTicketActivities(id!),
    enabled: Boolean(id) && Boolean(ticket?.id),
  });

  const patchMutation = useMutation({
    mutationFn: (payload: Parameters<typeof ticketsService.updateTicket>[1]) =>
      ticketsService.updateTicket(id!, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      await queryClient.invalidateQueries({ queryKey: ["ticket-activities", id] });
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (e) => {
      toast({
        title: "Erro ao atualizar ticket",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      });
    },
  });

  const patchField = useCallback(
    (payload: Parameters<typeof ticketsService.updateTicket>[1]) => {
      patchMutation.mutate(payload);
    },
    [patchMutation]
  );

  const replyMutation = useMutation({
    mutationFn: () =>
      ticketsService.createTicketMessage(id!, {
        content: replyText.trim(),
        visibility: internalNote ? "internal" : "public",
      }),
    onSuccess: async () => {
      setReplyText("");
      await queryClient.invalidateQueries({ queryKey: ["ticket-messages", id] });
      await queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      toast({ title: internalNote ? "Nota interna registrada" : "Resposta enviada" });
    },
    onError: (e) => {
      toast({
        title: "Erro ao enviar resposta",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      });
    },
  });

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t || tags.includes(t)) {
      setTagDraft("");
      return;
    }
    patchField({ tags: [...tags, t] });
    setTagDraft("");
  };

  const removeTag = (tag: string) => {
    patchField({ tags: tags.filter((x) => x !== tag) });
  };

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
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{ticket.ticket_number}</Badge>
                <Badge variant="secondary" className="text-xs font-normal">
                  {ticketChannelLabels[ticket.channel]}
                </Badge>
              </div>
              <CardTitle className="text-xl leading-snug">{ticket.subject}</CardTitle>

              {isLocked ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed bg-muted/30 px-3 py-2">
                  Este ticket está fechado e não pode ser editado.
                </p>
              ) : null}

              {showReopen ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  disabled={patchMutation.isPending}
                  onClick={() => patchField({ status: "open" })}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reabrir ticket
                </Button>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select
                    value={ticket.status}
                    disabled={patchMutation.isPending || isLocked}
                    onValueChange={(v) => patchField({ status: v as TicketStatus })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusOptionLabel(s, ticket.status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Prioridade</Label>
                  <Select
                    value={ticket.priority}
                    disabled={patchMutation.isPending || isLocked}
                    onValueChange={(v) => patchField({ priority: v as TicketPriority })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {ticketPriorityLabels[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Responsável</Label>
                  <Select
                    value={ticket.assignee_id ?? UNASSIGNED}
                    disabled={patchMutation.isPending || isLocked}
                    onValueChange={(v) =>
                      patchField({ assignee_id: v === UNASSIGNED ? null : v })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Sem responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Sem responsável</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name || m.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Categoria</Label>
                  <Select
                    value={ticket.category_id ?? UNASSIGNED}
                    disabled={patchMutation.isPending || isLocked}
                    onValueChange={(v) =>
                      patchField({ category_id: v === UNASSIGNED ? null : v })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Sem categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Sem categoria</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                      {tag}
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-muted"
                        aria-label={`Remover tag ${tag}`}
                        disabled={isLocked}
                        onClick={() => removeTag(tag)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nova tag…"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    className="h-9"
                    disabled={isLocked}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTag}
                    disabled={isLocked || !tagDraft.trim()}
                  >
                    Adicionar
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground flex flex-col gap-3 pt-1 border-t">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Contato informado</p>
                  <p className="font-medium text-foreground">{ticket.contact_name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {ticket.contact_phone ? <span>{ticket.contact_phone}</span> : null}
                    {ticket.contact_email ? <span className="break-all">{ticket.contact_email}</span> : null}
                  </div>
                </div>

                {ticket.client_id ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Cliente vinculado</p>
                    <ClientEntityLink
                      clientId={String(ticket.client_id).trim()}
                      name={linkedClientDisplayName}
                      disabledFallbackText="Abrir cliente"
                      variant="inline"
                      className="text-xs font-medium"
                    />
                  </div>
                ) : null}

                {ticket.lead_id ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Lead vinculado</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <LeadEntityLink
                        leadId={String(ticket.lead_id).trim()}
                        name={ticket.lead_name || ticket.contact_name}
                        disabledFallbackText="Abrir lead"
                        variant="inline"
                        className="text-xs font-medium"
                      />
                      <Badge variant="outline" className="text-[10px] font-normal">
                        Lead
                      </Badge>
                    </div>
                  </div>
                ) : null}

                {!ticket.client_id && !ticket.lead_id ? (
                  <p className="text-xs text-muted-foreground">Sem cliente ou lead vinculado — contato externo.</p>
                ) : null}

                <span className="text-xs text-muted-foreground">
                  Atualizado{" "}
                  {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
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
                  <Link to="/support/tickets/kanban">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Kanban
                  </Link>
                </Button>
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
              <CardDescription>Mensagens do chamado. Notas internas só para a equipe.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {messagesPending ? (
                <p className="text-sm text-muted-foreground">Carregando mensagens…</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma mensagem na thread.</p>
              ) : (
                <ul className="space-y-3">
                  {messages.map((m: { id: string; visibility?: string; user?: { email?: string }; created_at: string; content: string }) => {
                    const isInternal = m.visibility === "internal";
                    return (
                      <li
                        key={m.id}
                        className={cn(
                          "rounded-lg border p-3 text-sm",
                          isInternal
                            ? "border-amber-300/80 bg-amber-50/90 dark:border-amber-700/60 dark:bg-amber-950/40"
                            : "bg-card"
                        )}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{m.user?.email ?? "Utilizador"}</span>
                          <span>
                            {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                        {isInternal ? (
                          <Badge className="mb-2 bg-amber-600/90 hover:bg-amber-600/90 text-[10px]">
                            Nota interna
                          </Badge>
                        ) : null}
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {!activitiesPending && activities.length > 0 ? (
                <div className="space-y-2 border-t pt-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Atividades do sistema
                  </p>
                  <ul className="space-y-2">
                    {activities.map((a) => (
                      <li
                        key={a.id}
                        className="flex gap-2 text-xs text-muted-foreground rounded-md border border-dashed bg-muted/20 px-3 py-2"
                      >
                        <span className="shrink-0 tabular-nums">
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                        <span className="text-foreground/80">{formatTicketActivity(a)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="space-y-3 border-t pt-4">
                {isLocked ? (
                  <p className="text-sm text-muted-foreground">
                    Não é possível enviar respostas em tickets fechados.
                  </p>
                ) : (
                  <>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="ticket-reply">Responder</Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="ticket-internal"
                      checked={internalNote}
                      onCheckedChange={setInternalNote}
                    />
                    <Label htmlFor="ticket-internal" className="text-sm font-normal cursor-pointer">
                      Nota interna
                    </Label>
                  </div>
                </div>
                <Textarea
                  id="ticket-reply"
                  rows={4}
                  placeholder={
                    internalNote
                      ? "Nota visível apenas para a equipe…"
                      : "Escreva uma resposta ao cliente…"
                  }
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className={cn(internalNote && "border-amber-400/60 focus-visible:ring-amber-500/30")}
                />
                <Button
                  type="button"
                  variant={internalNote ? "secondary" : "default"}
                  disabled={replyMutation.isPending || !replyText.trim()}
                  onClick={() => replyMutation.mutate()}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {internalNote ? "Salvar nota interna" : "Enviar resposta"}
                </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
