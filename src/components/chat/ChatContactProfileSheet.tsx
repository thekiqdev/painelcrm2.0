import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ArrowRightLeft,
  CheckSquare,
  ChevronLeft,
  FileSignature,
  FileText,
  MessageSquare,
  Receipt,
  RefreshCw,
  Ticket,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

export type ChatContactProfileSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  displayName: string;
  phoneDisplay: string | null;
  /** Texto curto de status (etiqueta de vínculo, atendimento, etc.) */
  statusLine?: string | null;
  avatarUrl?: string | null;
  initials: string;
  kind: "client" | "lead" | "unlinked";
  lastInteractionLabel: string;
  assigneeDisplay: string | null;
  teamName: string | null;
  /** Linhas extras (e-mail, empresa, documento…) */
  detailRows: { label: string; value: string }[];
  tagLabels: string[];
  syncingMessages: boolean;
  loadingLead: boolean;
  canCreateInvoice: boolean;
  canCreateProposal: boolean;
  canCreateContract: boolean;
  canTransfer: boolean;
  onBackToConversation: () => void;
  onCreateInvoice: () => void;
  onCreateProposal: () => void;
  onCreateContract: () => void;
  onTransfer: () => void;
  onSync: () => void;
  onCreateTask: () => void;
  onOpenTicket: () => void;
  onConvertLead?: () => void;
  onLink?: () => void;
  onAddLead?: () => void;
  onUnlink?: () => void;
  showConvertLead: boolean;
  showLinkActions: boolean;
  showUnlink: boolean;
  /** Rótulo do botão de vínculo (ex.: «Escolher vínculo» quando `review_required`). */
  linkConversationLabel?: string;
};

function ActionButton({
  icon: Icon,
  label,
  onClick,
  variant = "secondary",
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  variant?: "secondary" | "outline" | "destructive";
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      disabled={disabled}
      className="h-12 w-full justify-start gap-3 rounded-xl text-left text-base font-medium"
      onClick={onClick}
    >
      <Icon className="h-5 w-5 shrink-0 opacity-80" />
      {label}
    </Button>
  );
}

export function ChatContactProfileSheet({
  open,
  onOpenChange,
  isMobile,
  displayName,
  phoneDisplay,
  statusLine,
  avatarUrl,
  initials,
  kind,
  lastInteractionLabel,
  assigneeDisplay,
  teamName,
  detailRows,
  tagLabels,
  syncingMessages,
  loadingLead,
  canCreateInvoice,
  canCreateProposal,
  canCreateContract,
  canTransfer,
  onBackToConversation,
  onCreateInvoice,
  onCreateProposal,
  onCreateContract,
  onTransfer,
  onSync,
  onCreateTask,
  onOpenTicket,
  onConvertLead,
  onLink,
  onAddLead,
  onUnlink,
  showConvertLead,
  showLinkActions,
  showUnlink,
  linkConversationLabel = "Vincular conversa",
}: ChatContactProfileSheetProps) {
  const closeThen = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  /** Mobile: só «Converter» ou «Adicionar lead» no topo; «Vincular» fica em Mais ações. */
  const mobileLeadHero =
    isMobile && kind === "lead" && showConvertLead && Boolean(onConvertLead);
  const mobileUnlinkedAddLeadHero =
    isMobile && kind === "unlinked" && showLinkActions && Boolean(onAddLead);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md",
          isMobile && "h-[100dvh] max-h-[100dvh] rounded-none border-0 sm:max-w-full",
          "[&>button.absolute]:right-3 [&>button.absolute]:top-[max(0.75rem,env(safe-area-inset-top))] max-md:[&>button.absolute]:hidden",
        )}
      >
        <SheetTitle className="sr-only">Perfil do contato</SheetTitle>
        <SheetDescription className="sr-only">
          Dados do contato, última interação e ações rápidas da conversa.
        </SheetDescription>

        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 py-2",
            "pt-[max(0.5rem,env(safe-area-inset-top))]",
          )}
        >
          {isMobile ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Voltar para conversa"
              onClick={() => closeThen(onBackToConversation)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1 pr-8 sm:pr-10">
            <p className="truncate text-base font-semibold leading-tight">{displayName}</p>
            {statusLine ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{statusLine}</p>
            ) : null}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="flex w-full max-w-md flex-col items-center text-center">
              <Avatar className="h-24 w-24 border-2 border-border shadow-sm">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                <AvatarFallback className="bg-primary/15 text-2xl font-semibold text-primary">{initials}</AvatarFallback>
              </Avatar>
              <h2 className="mt-3 text-lg font-semibold leading-snug">{displayName}</h2>
              {phoneDisplay ? <p className="mt-1 text-sm text-muted-foreground">{phoneDisplay}</p> : null}

              {isMobile && kind === "client" ? (
                <div className="mt-3 flex justify-center">
                  <Badge>Cliente</Badge>
                </div>
              ) : mobileLeadHero ? (
                <div className="mt-4 w-full space-y-2 px-0.5">
                  <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Lead
                  </p>
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full gap-2 rounded-xl text-base font-semibold shadow-md"
                    onClick={() => closeThen(onConvertLead!)}
                    disabled={loadingLead}
                  >
                    <UserPlus className="h-5 w-5 shrink-0" aria-hidden />
                    Converter para cliente
                  </Button>
                </div>
              ) : mobileUnlinkedAddLeadHero ? (
                <div className="mt-4 w-full px-0.5">
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full gap-2 rounded-xl text-base font-semibold shadow-md"
                    onClick={() => closeThen(onAddLead!)}
                    disabled={loadingLead}
                  >
                    <UserPlus className="h-5 w-5 shrink-0" aria-hidden />
                    Adicionar lead
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {kind === "client" ? (
                    <Badge>Cliente</Badge>
                  ) : kind === "lead" ? (
                    <Badge className="border-blue-300/80 bg-blue-500/10 text-blue-900 hover:bg-blue-500/15 dark:border-blue-800/60 dark:bg-blue-950/45 dark:text-blue-200">
                      Lead
                    </Badge>
                  ) : (
                    <Badge variant="outline">Sem vínculo CRM</Badge>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4 text-sm shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Última interação</p>
              <p className="mt-1 font-medium text-foreground">{lastInteractionLabel}</p>
              {(assigneeDisplay || teamName) && (
                <div className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  {assigneeDisplay ? (
                    <p>
                      <span className="font-medium text-foreground/90">Responsável:</span> {assigneeDisplay}
                    </p>
                  ) : null}
                  {teamName ? (
                    <p>
                      <span className="font-medium text-foreground/90">Equipe / fila:</span> {teamName}
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            {tagLabels.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Etiquetas</p>
                <div className="flex flex-wrap gap-2">
                  {tagLabels.map((t) => (
                    <Badge key={t} variant="secondary" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {detailRows.length > 0 ? (
              <div className="space-y-3 rounded-xl border bg-card p-4 text-sm shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dados cadastrados</p>
                <ul className="space-y-2">
                  {detailRows.map((row) => (
                    <li key={row.label} className="flex flex-col gap-0.5 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                      <span className="text-xs text-muted-foreground">{row.label}</span>
                      <span className="break-words font-medium">{row.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ações rápidas</p>
              <div className="flex flex-col gap-2">
                {canCreateInvoice ? (
                  <ActionButton icon={Receipt} label="Criar fatura" onClick={() => closeThen(onCreateInvoice)} />
                ) : null}
                {canCreateProposal ? (
                  <ActionButton icon={FileText} label="Criar proposta" onClick={() => closeThen(onCreateProposal)} />
                ) : null}
                {canCreateContract ? (
                  <ActionButton icon={FileSignature} label="Criar contrato" onClick={() => closeThen(onCreateContract)} />
                ) : null}
                {canTransfer ? (
                  <ActionButton icon={ArrowRightLeft} label="Transferir atendimento" onClick={() => closeThen(onTransfer)} />
                ) : null}
              </div>
            </div>

            <Separator />

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Mais ações</p>
              <div className="flex flex-col gap-2">
                <ActionButton
                  icon={RefreshCw}
                  label={syncingMessages ? "Sincronizando…" : "Sincronizar conversa"}
                  onClick={() => closeThen(onSync)}
                  variant="outline"
                  disabled={syncingMessages}
                />
                <ActionButton icon={CheckSquare} label="Criar tarefa" onClick={() => closeThen(onCreateTask)} variant="outline" />
                <ActionButton icon={Ticket} label="Abrir ticket" onClick={() => closeThen(onOpenTicket)} variant="outline" />
                {showConvertLead && onConvertLead && !mobileLeadHero ? (
                  <ActionButton
                    icon={UserPlus}
                    label="Converter para cliente"
                    onClick={() => closeThen(onConvertLead)}
                    variant="outline"
                    disabled={loadingLead}
                  />
                ) : null}
                {showLinkActions && onAddLead && !mobileUnlinkedAddLeadHero ? (
                  <ActionButton
                    icon={UserPlus}
                    label="Adicionar lead"
                    onClick={() => closeThen(onAddLead)}
                    variant="outline"
                    disabled={loadingLead}
                  />
                ) : null}
                {showLinkActions && onLink ? (
                  <ActionButton
                    icon={Users}
                    label={linkConversationLabel}
                    onClick={() => closeThen(onLink)}
                    variant="outline"
                  />
                ) : null}
                {showUnlink && onUnlink ? (
                  <ActionButton icon={Trash2} label="Remover vínculo com CRM" onClick={() => closeThen(onUnlink)} variant="destructive" />
                ) : null}
              </div>
            </div>
          </div>
        </ScrollArea>

        {isMobile ? (
          <div className="shrink-0 border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full gap-2"
              onClick={() => onOpenChange(false)}
            >
              <MessageSquare className="h-4 w-4" />
              Voltar para conversa
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
