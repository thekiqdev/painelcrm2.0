import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { publicApiPost } from "@/integrations/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PublicTicketLookupOk, PublicTicketLookupTicket } from "./types";
import type { TicketPriority, TicketStatus } from "@/types/tickets";
import { ticketPriorityLabels, ticketStatusLabels } from "@/types/tickets";

type Props = {
  portalSlug: string;
  accent: string;
};

const fieldClass =
  "h-10 rounded-lg border border-border/80 bg-background px-3 text-sm shadow-sm transition-all hover:border-border focus-visible:ring-2 focus-visible:ring-[color:var(--support-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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

export function PublicSupportTicketLookup({ portalSlug, accent }: Props) {
  const [ticketNumber, setTicketNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [ticket, setTicket] = useState<PublicTicketLookupTicket | null>(null);

  const lookup = async () => {
    setError(null);
    const num = ticketNumber.trim();
    const ph = phone.trim();
    if (!num || !ph) {
      setError("Preencha o protocolo e o telefone.");
      return;
    }
    setLoading(true);
    const res = await publicApiPost<PublicTicketLookupOk>(
      `/api/public/support/${encodeURIComponent(portalSlug)}/tickets/lookup`,
      { ticket_number: num, phone: ph },
    );
    setLoading(false);
    if (res.error || !res.data?.ok || !res.data.ticket) {
      setError(
        res.error ??
          "Não encontramos um chamado com estes dados. Verifique o protocolo e o telefone usados na abertura.",
      );
      return;
    }
    setTicket(res.data.ticket);
    setOpen(true);
  };

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
            onClick={() => void lookup()}
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
          if (!next) setTicket(null);
        }}
      >
        <DialogContent
          className="max-h-[min(90dvh,640px)] max-w-[min(100vw-1.5rem,40rem)] gap-0 overflow-hidden p-0 sm:rounded-xl"
          style={{ ["--support-accent" as string]: accent } as React.CSSProperties}
        >
          {ticket ? (
            <>
              <DialogHeader className="border-b border-border/60 px-5 py-4 text-left sm:px-6">
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
              <div className="max-h-[min(60dvh,480px)] overflow-y-auto px-5 py-4 sm:px-6">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Histórico público
                </p>
                {ticket.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem mensagens públicas ainda.</p>
                ) : (
                  <ul className="space-y-4">
                    {ticket.messages.map((m, i) => (
                      <li
                        key={`${m.created_at}-${i}`}
                        className={cn(
                          "rounded-lg border border-border/50 bg-muted/25 px-3 py-2.5 text-sm dark:bg-muted/10",
                        )}
                      >
                        <p className="text-[11px] text-muted-foreground">{formatWhen(m.created_at)}</p>
                        <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-foreground/95">{m.content}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
