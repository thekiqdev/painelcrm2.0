import { ChevronRight, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { textOnAccent } from "./supportBranding";
import type { PublicPortalPayload } from "./types";
import type { TicketPriority } from "@/types/tickets";
import { ticketPriorityLabels } from "@/types/tickets";

type Props = {
  portal: PublicPortalPayload;
  accent: string;
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  priority: TicketPriority;
  setPriority: (v: TicketPriority) => void;
  message: string;
  setMessage: (v: string) => void;
  honeypot: string;
  setHoneypot: (v: string) => void;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (e: React.FormEvent) => void;
  stickySubmit?: boolean;
};

const fieldBase =
  "h-12 w-full rounded-lg border border-border/80 bg-muted/25 px-3.5 text-[15px] shadow-sm transition-all duration-150 placeholder:text-muted-foreground/70 hover:border-border hover:bg-muted/35 focus-visible:border-transparent focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-[color:var(--support-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-muted/15 dark:hover:bg-muted/25";

const labelClass = "text-sm font-medium text-foreground";

export function PublicSupportForm({
  portal,
  accent,
  name,
  setName,
  email,
  setEmail,
  phone,
  setPhone,
  subject,
  setSubject,
  categoryId,
  setCategoryId,
  priority,
  setPriority,
  message,
  setMessage,
  honeypot,
  setHoneypot,
  submitting,
  submitError,
  onSubmit,
  stickySubmit,
}: Props) {
  const fg = textOnAccent(accent);
  const canSubmit = !(portal.categories.length > 0 && !categoryId);
  const hasCategories = portal.categories.length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
      <nav
        className="flex items-center gap-1 border-b border-border/60 px-5 py-3 text-xs text-muted-foreground sm:px-8 sm:text-[13px]"
        aria-label="Navegação"
      >
        <span className="font-medium text-foreground/80">Suporte</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
        <span className="text-foreground/70">Novo chamado</span>
      </nav>

      <div className="border-b border-border/60 px-5 py-6 sm:px-8 sm:py-7">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem] sm:leading-tight">
          Abrir novo chamado
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
          Descreva o problema e nossa equipe irá analisar sua solicitação.
        </p>
      </div>

      <form onSubmit={onSubmit} className="px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-7">
        <div className="hidden" aria-hidden>
          <Label htmlFor="company_website">Website</Label>
          <Input
            id="company_website"
            name="company_website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5">
          <div className="space-y-2">
            <Label htmlFor="ps-name" className={labelClass}>
              Nome completo
            </Label>
            <Input
              id="ps-name"
              required
              maxLength={120}
              placeholder="Nome para contato"
              className={fieldBase}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ps-phone" className={labelClass}>
              Telefone / WhatsApp
            </Label>
            <Input
              id="ps-phone"
              type="tel"
              required
              minLength={8}
              placeholder="(00) 00000-0000"
              className={fieldBase}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Usado para localizar seu cadastro, quando existir.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ps-email" className={labelClass}>
              E-mail <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="ps-email"
              type="email"
              placeholder="seu@email.com"
              className={fieldBase}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label className={labelClass}>Prioridade</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
              <SelectTrigger className={fieldBase}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ticketPriorityLabels) as TicketPriority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {ticketPriorityLabels[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={cn("space-y-2", !hasCategories && "sm:col-span-2")}>
            <Label htmlFor="ps-subject" className={labelClass}>
              Assunto
            </Label>
            <Input
              id="ps-subject"
              required
              maxLength={160}
              placeholder="Resumo do pedido"
              className={fieldBase}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {hasCategories ? (
            <div className="space-y-2">
              <Label className={labelClass}>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className={fieldBase}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {portal.categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ps-message" className={labelClass}>
              Mensagem
            </Label>
            <Textarea
              id="ps-message"
              required
              maxLength={5000}
              rows={8}
              placeholder="Descreva o problema, passos para reproduzir, impacto no seu trabalho e o que já tentou."
              className={cn(
                fieldBase,
                "min-h-[220px] resize-y py-3 leading-relaxed sm:min-h-[260px]",
              )}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>

        {submitError ? (
          <p className="mt-5 rounded-lg border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {submitError}
          </p>
        ) : null}

        <div
          className={cn(
            "mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
            stickySubmit &&
              "fixed bottom-0 left-0 right-0 z-30 mt-0 border-t border-border/80 bg-background/95 p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md supports-[backdrop-filter]:bg-background/90 sm:static sm:z-0 sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none",
          )}
        >
          <p className="hidden text-xs text-muted-foreground sm:block sm:max-w-xs">
            Ao enviar, você concorda com o uso dos dados para este atendimento.
          </p>
          <Button
            type="submit"
            disabled={submitting || !canSubmit}
            className={cn(
              "h-12 w-full rounded-lg px-6 text-[15px] font-semibold shadow-md transition-[opacity,transform] hover:opacity-[0.97] active:scale-[0.99] disabled:opacity-60 sm:ml-auto sm:w-auto sm:min-w-[220px]",
            )}
            style={{ backgroundColor: accent, color: fg }}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Enviando…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4 opacity-90" aria-hidden />
                Enviar chamado
              </>
            )}
          </Button>
        </div>

        {stickySubmit ? <div className="h-24 shrink-0 sm:hidden" aria-hidden /> : null}
      </form>
    </div>
  );
}
