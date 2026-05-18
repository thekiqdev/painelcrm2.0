import { useCallback, useState } from "react";
import { Loader2, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { publicApiPost } from "@/integrations/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  PublicTicketLookupOk,
  PublicTicketLookupTicket,
  PublicTicketReplyOk,
} from "./types";
import type { TicketPriority, TicketStatus } from "@/types/tickets";
import { ticketPriorityLabels, ticketStatusLabels } from "@/types/tickets";

type Props = {
  portalSlug: string;
  accent: string;
};

const fieldClass =
  "h-10 rounded-lg border border-border/80 bg-background px-3 text-sm shadow-sm transition-all hover:border-border focus-visible:ring-2 focus-visible:ring-[color:var(--support-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const TERMINAL_STATUSES = new Set(["closed", "cancelled"]);

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(status: string): string {
  return ticketStatusLabels[status as TicketStatus] ?? status;
}

function priorityLabel(p: string): string {
  return ticketPriorityLabels[p as TicketPriority] ?? p;
}

function canReplyToTicket(ticket: PublicTicketLookupTicket): boolean {
  if (ticket.can_reply === false) return false;
  return !TERMINAL_STATUSES.has(ticket.status);
}

export function PublicSupportTicketLookup({ portalSlug, accent }: Props) {
  const [ticketNumber, setTicketNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [ticket, setTicket] = useState<PublicTicketLookupTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");

  const fetchTicket = useCallback(
    async (num: string, ph: string): Promise<PublicTicketLookupTicket | null> => {
      const res = await publicApiPost<PublicTicketLookupOk>(
        `/api/public/support/${encodeURIComponent(portalSlug)}/tickets/lookup`,
        { ticket_number: num, phone: ph },
      );
      if (res.error || !res.data?.ok || !res.data.ticket) {
        return null;
      }
      return res.data.ticket;
    },
    [portalSlug],
  );

  const lookup = async () => {
    setError(null);
    const num = ticketNumber.trim();
    const ph = phone.trim();
    if (!num || !ph) {
      setError("Preencha o protocolo e o telefone.");
      return;
    }
    setLoading(true);
    const found = await fetchTicket(num, ph);
    setLoading(false);
    if (!found) {
      setError(
        "Não encontramos um chamado com estes dados. Verifique o protocolo e o telefone usados na abertura.",
      );
      return;
    }
    setTicket(found);
    setReplyText("");
    setReplyError(null);
    setOpen(true);
  };

  const refreshTicket = async () => {
    const num = ticketNumber.trim();
    const ph = phone.trim();
    if (!num || !ph) return;
    const found = await fetchTicket(num, ph);
    if (found) setTicket(found);
  };

  const sendReply = async () => {
    if (!ticket) return;
    setReplyError(null);
    const text = replyText.trim();
    if (!text) {
      setReplyError("Digite sua mensagem.");
      return;
    }
    const ph = phone.trim();
    if (!ph) {
      setReplyError("Telefone não informado.");
      return;
    }

    setReplySending(true);
    const res = await publicApiPost<PublicTicketReplyOk>(
      `/api/public/support/${encodeURIComponent(portalSlug)}/tickets/${encodeURIComponent(ticket.ticket_number)}/messages`,
      {
        phone: ph,
        message: text,
        company_website: honeypot || null,
      },
    );
    setReplySending(false);

    if (res.error) {
      if (res.code === "ticket_closed") {
        setReplyError("Este chamado está encerrado e não aceita novas respostas.");
        await refreshTicket();
        return;
      }
      setReplyError(res.error);
      return;
    }
    if (!res.data?.ok) {
      setReplyError("Não foi possível enviar sua mensagem. Tente novamente.");
      return;
    }

    setReplyText("");
    setHoneypot("");
    toast.success("Mensagem enviada");
    await refreshTicket();
  };

  const replyAllowed = ticket ? canReplyToTicket(ticket) : false;

  return (
    <>
      <div className="mt-5 rounded-lg border border-border/80 bg-background/90 p-3.5 shadow-sm dark:bg-card/50">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Consultar chamado
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Digite o protocolo e o telefone usados na abertura.
        </p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ps-lookup-protocol" className="text-xs font-medium text-foreground">
              Protocolo
            </Label>
            <Input
              id="ps-lookup-protocol"
              autoComplete="off"
              placeholder="Ex: TICKET-123456"
              className={fieldClass}
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-lookup-phone" className="text-xs font-medium text-foreground">
              Telefone
            </Label>
            <Input
              id="ps-lookup-phone"
              type="tel"
              autoComplete="tel"
              placeholder="Mesmo número da abertura"
              className={fieldClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="h-9 w-full gap-2 rounded-lg text-xs font-semibold sm:text-sm"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
            ) : (
              <Search className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            )}
            Consultar
          </Button>
        </form>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setTicket(null);
            setReplyText("");
            setReplyError(null);
          }
        }}
      >
        <DialogContent
          className="flex max-h-[min(90dvh,720px)] max-w-[min(100vw-1.5rem,40rem)] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
          style={{ ["--support-accent" as string]: accent } as React.CSSProperties}
        >
          {ticket ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 text-left sm:px-6">
                <DialogTitle className="pr-8 text-base font-semibold sm:text-lg">
                  {ticket.subject}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-left">
                    <span className="font-mono text-xs text-foreground/90">{ticket.ticket_number}</span>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {statusLabel(ticket.status)}
                    </Badge>
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {priorityLabel(ticket.priority)}
                    </Badge>
                    {ticket.category_name ? (
                      <span className="text-xs text-muted-foreground">{ticket.category_name}</span>
                    ) : null}
                  </div>
                </DialogDescription>
                <p className="mt-2 text-xs text-muted-foreground">
                  Aberto em {formatWhen(ticket.created_at)}
                  {ticket.updated_at !== ticket.created_at ? (
                    <> · Atualizado {formatWhen(ticket.updated_at)}</>
                  ) : null}
                </p>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Histórico público
                </p>
                {ticket.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem mensagens públicas ainda.</p>
                ) : (
                  <ul className="space-y-3">
                    {ticket.messages.map((m, i) => {
                      const isCustomer = m.author_role === "customer";
                      return (
                        <li
                          key={`${m.created_at}-${i}`}
                          className={cn("flex flex-col gap-1", isCustomer ? "items-end" : "items-start")}
                        >
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {isCustomer ? "Você" : "Equipe de suporte"}
                          </span>
                          <div
                            className={cn(
                              "max-w-[92%] rounded-xl px-3 py-2.5 text-sm shadow-sm",
                              isCustomer
                                ? "rounded-br-sm border border-[color:var(--support-accent)]/25 bg-[color:var(--support-accent)]/12 text-foreground"
                                : "rounded-bl-sm border border-border/60 bg-muted/40 text-foreground/95 dark:bg-muted/20",
                            )}
                          >
                            <p className="text-[10px] text-muted-foreground">{formatWhen(m.created_at)}</p>
                            <p className="mt-1 whitespace-pre-wrap leading-relaxed">{m.content}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="shrink-0 border-t border-border/60 bg-background/95 px-5 py-4 sm:px-6">
                {replyAllowed ? (
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void sendReply();
                    }}
                  >
                    <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
                      <Label htmlFor="ps-reply-website">Website</Label>
                      <Input
                        id="ps-reply-website"
                        tabIndex={-1}
                        autoComplete="off"
                        value={honeypot}
                        onChange={(e) => setHoneypot(e.target.value)}
                      />
                    </div>
                    <Label htmlFor="ps-reply-message" className="text-xs font-medium text-foreground">
                      Sua resposta
                    </Label>
                    <Textarea
                      id="ps-reply-message"
                      placeholder="Escreva sua mensagem…"
                      className="min-h-[88px] resize-y rounded-lg text-sm"
                      maxLength={5000}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={replySending}
                    />
                    {replyError ? <p className="text-xs text-destructive">{replyError}</p> : null}
                    <Button
                      type="submit"
                      size="sm"
                      className="h-9 w-full gap-2 rounded-lg text-xs font-semibold sm:text-sm"
                      disabled={replySending || !replyText.trim()}
                      style={
                        accent
                          ? ({ backgroundColor: accent, color: "#fff" } as React.CSSProperties)
                          : undefined
                      }
                    >
                      {replySending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                      ) : (
                        <Send className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                      )}
                      Enviar resposta
                    </Button>
                  </form>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    Este chamado está encerrado e não aceita novas respostas.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
