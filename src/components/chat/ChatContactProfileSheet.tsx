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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ArrowRightLeft,
  CalendarClock,
  CheckSquare,
  ChevronLeft,
  ExternalLink,
  FileSignature,
  FileText,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Ticket,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

export type ChatProfileFieldKey =
  | "name"
  | "email"
  | "phone"
  | "cpf_cnpj"
  | "company"
  | "source";

export type ChatProfileFieldRow = {
  key: ChatProfileFieldKey | "lastInteraction";
  label: string;
  value: string | null;
  editable: boolean;
};

export type ChatContactProfileSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  displayName: string;
  phoneDisplay: string | null;
  statusLine?: string | null;
  avatarUrl?: string | null;
  initials: string;
  kind: "client" | "lead" | "unlinked";
  assigneeDisplay: string | null;
  teamName: string | null;
  /** Linhas de informação com edição opcional */
  profileFields: ChatProfileFieldRow[];
  canEditProfileFields: boolean;
  profileSavingKey: string | null;
  onSaveProfileField?: (key: ChatProfileFieldKey, value: string) => Promise<void>;
  /** Etiquetas só leitura (funil, grupo, …) */
  tagLabels: string[];
  /** Cliente: grupos para alterar “etiqueta” de grupo */
  clientGroups?: { id: string; name: string }[];
  selectedClientGroupId?: string | null;
  onClientGroupChange?: (groupId: string | null) => Promise<void>;
  savingClientGroup?: boolean;
  syncingMessages: boolean;
  loadingLead: boolean;
  canCreateInvoice: boolean;
  canCreateProposal: boolean;
  canCreateContract: boolean;
  canTransfer: boolean;
  showScheduleAppointment: boolean;
  onBackToConversation: () => void;
  onCreateInvoice: () => void;
  onCreateProposal: () => void;
  onCreateContract: () => void;
  onTransfer: () => void;
  onSync: () => void;
  onCreateTask: () => void;
  onOpenTicket: () => void;
  onScheduleAppointment?: () => void;
  onConvertLead?: () => void;
  onLink?: () => void;
  onAddLead?: () => void;
  onUnlink?: () => void;
  showConvertLead: boolean;
  showLinkActions: boolean;
  showUnlink: boolean;
  linkConversationLabel?: string;
  /** Cliente CRM vinculado: botão para página completa do cliente */
  showOpenFullProfile?: boolean;
  onOpenFullProfile?: () => void;
};

export type ChatContactProfilePanelExtraProps = {
  interactionMode: "sheet" | "desktop";
  /** Coluna desktop: fechar painel */
  onDesktopClose?: () => void;
};

export type ChatContactProfilePanelProps = ChatContactProfileSheetProps & ChatContactProfilePanelExtraProps;

function ProfileFieldEditor({
  row,
  canEdit,
  saving,
  onSave,
}: {
  row: ChatProfileFieldRow;
  canEdit: boolean;
  saving: boolean;
  onSave?: (key: ChatProfileFieldKey, value: string) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(row.value ?? "");
  React.useEffect(() => {
    setDraft(row.value ?? "");
  }, [row.value, row.key]);

  if (row.key === "lastInteraction") {
    return (
      <div className="flex flex-col gap-0.5 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{row.label}</span>
        <span className="text-sm font-medium text-foreground">{row.value ?? "—"}</span>
      </div>
    );
  }

  const empty = !row.value?.trim();
  const showEdit = canEdit && row.editable && onSave;

  return (
    <div className="flex items-start justify-between gap-2 border-b border-border/50 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{row.label}</span>
        <p className={cn("mt-0.5 text-sm", empty ? "text-muted-foreground/80 italic" : "font-medium text-foreground")}>
          {empty ? "—" : row.value}
        </p>
      </div>
      {showEdit ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              aria-label={empty ? `Adicionar ${row.label}` : `Editar ${row.label}`}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-3" align="end">
            <label className="text-xs font-medium text-muted-foreground">{row.label}</label>
            <Input
              className="mt-2"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={empty ? "Adicionar…" : undefined}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={async () => {
                  try {
                    await onSave(row.key as ChatProfileFieldKey, draft.trim());
                    setOpen(false);
                  } catch {
                    /* toast no pai */
                  }
                }}
              >
                Guardar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

export function ChatContactProfilePanel(props: ChatContactProfilePanelProps) {
  const {
    onOpenChange,
    isMobile,
    interactionMode,
    onDesktopClose,
    showOpenFullProfile,
    onOpenFullProfile,
    displayName,
    phoneDisplay,
    statusLine,
    avatarUrl,
    initials,
    kind,
    assigneeDisplay,
    teamName,
    profileFields,
    canEditProfileFields,
    profileSavingKey,
    onSaveProfileField,
    tagLabels,
    clientGroups,
    selectedClientGroupId,
    onClientGroupChange,
    savingClientGroup,
    syncingMessages,
    loadingLead,
    canCreateInvoice,
    canCreateProposal,
    canCreateContract,
    canTransfer,
    showScheduleAppointment,
    onBackToConversation,
    onCreateInvoice,
    onCreateProposal,
    onCreateContract,
    onTransfer,
    onSync,
    onCreateTask,
    onOpenTicket,
    onScheduleAppointment,
    onConvertLead,
    onLink,
    onAddLead,
    onUnlink,
    showConvertLead,
    showLinkActions,
    showUnlink,
    linkConversationLabel = "Vincular conversa",
  } = props;

  const closeThen = React.useCallback(
    (fn: () => void) => {
      if (interactionMode === "sheet") {
        onOpenChange(false);
      }
      fn();
    },
    [interactionMode, onOpenChange],
  );

  const commercialActions = [
    canCreateInvoice ? { key: "inv", label: "Criar fatura", icon: Receipt, onClick: onCreateInvoice } : null,
    canCreateProposal ? { key: "prop", label: "Criar proposta", icon: FileText, onClick: onCreateProposal } : null,
    canCreateContract ? { key: "ctr", label: "Criar contrato", icon: FileSignature, onClick: onCreateContract } : null,
  ].filter(Boolean) as { key: string; label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void }[];

  return (
    <div
      id="chat-contact-profile-panel"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    >
      {interactionMode === "desktop" ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/15 px-3 py-2">
          <p className="min-w-0 truncate text-base font-semibold leading-tight">Perfil do contato</p>
          {onDesktopClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Fechar perfil"
              onClick={onDesktopClose}
            >
              <X className="h-5 w-5" />
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-b border-border bg-muted/15 px-3 py-2",
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
            {statusLine ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{statusLine}</p> : null}
          </div>
        </div>
      )}

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-4 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {/* Identidade */}
            <div className="flex flex-col items-center text-center">
              <Avatar className="h-16 w-16 border border-border/80 shadow-sm">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                <AvatarFallback className="bg-primary/12 text-lg font-semibold text-primary">{initials}</AvatarFallback>
              </Avatar>
              <h2 className="mt-2.5 text-base font-semibold leading-snug">{displayName}</h2>
              {phoneDisplay ? <p className="mt-0.5 text-sm text-muted-foreground">{phoneDisplay}</p> : null}
            </div>

            {/* CRM — sempre visível */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vínculo CRM</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {kind === "client" ? (
                  <Badge className="border-emerald-500/30 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100">Cliente</Badge>
                ) : kind === "lead" ? (
                  <Badge className="border-blue-500/35 bg-blue-500/10 text-blue-900 dark:text-blue-100">Lead</Badge>
                ) : (
                  <Badge variant="outline" className="font-normal">
                    Não vinculado
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {kind === "unlinked" && showLinkActions && onAddLead ? (
                  <Button
                    type="button"
                    size="default"
                    className="w-full gap-2 shadow-sm"
                    onClick={() => closeThen(onAddLead)}
                    disabled={loadingLead}
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    + Lead
                  </Button>
                ) : null}
                {kind === "unlinked" && showLinkActions && onLink ? (
                  <Button type="button" variant="secondary" className="w-full gap-2" onClick={() => closeThen(onLink)}>
                    <Users className="h-4 w-4 shrink-0" />
                    {linkConversationLabel}
                  </Button>
                ) : null}
                {kind === "lead" && showConvertLead && onConvertLead ? (
                  <Button
                    type="button"
                    className="w-full gap-2 shadow-sm"
                    onClick={() => closeThen(onConvertLead)}
                    disabled={loadingLead}
                  >
                    <UserPlus className="h-4 w-4 shrink-0" />
                    Converter para cliente
                  </Button>
                ) : null}
                {kind === "client" && showOpenFullProfile && onOpenFullProfile ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => closeThen(onOpenFullProfile)}
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    Abrir perfil completo
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Informações */}
            {profileFields.length > 0 ? (
              <section className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Informações do contato
                </p>
                <div className="mt-1 divide-y divide-border/40">
                  {profileFields.map((row) => (
                    <ProfileFieldEditor
                      key={row.key}
                      row={row}
                      canEdit={canEditProfileFields}
                      saving={profileSavingKey === row.key}
                      onSave={onSaveProfileField}
                    />
                  ))}
                </div>
                {(assigneeDisplay || teamName) && (
                  <div className="mt-3 space-y-1 border-t border-border/50 pt-3 text-xs text-muted-foreground">
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
              </section>
            ) : null}

            {/* Etiquetas CRM */}
            <section className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Etiquetas CRM</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Funil e grupo do cliente. As regras de etiquetas do Kanban usam os mesmos dados de cliente quando o cartão
                está vinculado ao CRM.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tagLabels.length > 0 ? (
                  tagLabels.map((t) => (
                    <Badge key={t} variant="secondary" className="font-normal">
                      {t}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs italic text-muted-foreground">Sem etiquetas definidas</span>
                )}
              </div>
              {kind === "client" && clientGroups && clientGroups.length > 0 && onClientGroupChange ? (
                <div className="mt-3">
                  <span className="text-[11px] font-medium text-muted-foreground">Grupo de clientes</span>
                  <Select
                    value={selectedClientGroupId ?? "__none__"}
                    disabled={savingClientGroup}
                    onValueChange={(v) => void onClientGroupChange(v === "__none__" ? null : v)}
                  >
                    <SelectTrigger className="mt-1.5 h-9">
                      <SelectValue placeholder="Sem grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem grupo</SelectItem>
                      {clientGroups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </section>

            {/* Comercial */}
            {commercialActions.length > 0 ? (
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Comercial</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {commercialActions.map(({ key, label, icon: Icon, onClick }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => closeThen(onClick)}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl border border-primary/25 bg-primary/6 px-3 py-3 text-center",
                        "transition-colors hover:bg-primary/10 active:scale-[0.99]",
                      )}
                    >
                      <Icon className="h-6 w-6 text-primary" />
                      <span className="text-xs font-semibold leading-tight text-foreground">{label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Atendimento */}
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Atendimento</p>
              <div className="mt-2 flex flex-col gap-2">
                {canTransfer ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full justify-start gap-2 rounded-lg"
                    onClick={() => closeThen(onTransfer)}
                  >
                    <ArrowRightLeft className="h-4 w-4 shrink-0 opacity-80" />
                    Transferir atendimento
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-start gap-2 rounded-lg"
                  onClick={() => closeThen(onCreateTask)}
                >
                  <CheckSquare className="h-4 w-4 shrink-0 opacity-80" />
                  Criar tarefa
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-start gap-2 rounded-lg"
                  onClick={() => closeThen(onOpenTicket)}
                >
                  <Ticket className="h-4 w-4 shrink-0 opacity-80" />
                  Abrir ticket
                </Button>
                {showScheduleAppointment && onScheduleAppointment ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full justify-start gap-2 rounded-lg"
                    onClick={() => closeThen(onScheduleAppointment)}
                  >
                    <CalendarClock className="h-4 w-4 shrink-0 opacity-80" />
                    Agendar compromisso
                  </Button>
                ) : null}
              </div>
            </section>

            {/* Sincronização */}
            <section className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sincronização</p>
              <Button
                type="button"
                variant="secondary"
                className="mt-2 h-11 w-full justify-start gap-2"
                disabled={syncingMessages}
                onClick={() => closeThen(onSync)}
              >
                {syncingMessages ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 shrink-0 opacity-80" />
                )}
                {syncingMessages ? "A sincronizar…" : "Forçar sincronização da conversa e foto"}
              </Button>
            </section>

            <Separator className="opacity-60" />

            {showUnlink && onUnlink ? (
              <div className="pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avançado</p>
                <Button
                  type="button"
                  variant="destructive"
                  className="mt-2 h-11 w-full justify-start gap-2 rounded-lg"
                  onClick={() => closeThen(onUnlink)}
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  Remover vínculo com CRM
                </Button>
              </div>
            ) : null}
          </div>
        </ScrollArea>

      {interactionMode === "sheet" && isMobile ? (
        <div className="shrink-0 border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="secondary" className="h-11 w-full gap-2" onClick={() => onOpenChange(false)}>
            <MessageSquare className="h-4 w-4" />
            Voltar para conversa
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ChatContactProfileSheet(props: ChatContactProfileSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md",
          props.isMobile && "h-[100dvh] max-h-[100dvh] rounded-none border-0 sm:max-w-full",
          "[&>button.absolute]:right-3 [&>button.absolute]:top-[max(0.75rem,env(safe-area-inset-top))] max-md:[&>button.absolute]:hidden",
        )}
      >
        <SheetTitle className="sr-only">Perfil do contato</SheetTitle>
        <SheetDescription className="sr-only">
          Dados do contato, vínculo CRM, etiquetas e ações comerciais.
        </SheetDescription>
        <ChatContactProfilePanel {...props} interactionMode="sheet" />
      </SheetContent>
    </Sheet>
  );
}
