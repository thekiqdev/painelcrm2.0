import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { ChatKanbanTagBadge } from "@/components/chat/ChatKanbanTagBadge";
import {
  CHAT_TAG_COLOR_PALETTE,
  DEFAULT_CHAT_TAG_COLOR,
  normalizeHexColor,
} from "@/lib/chatKanbanTagStyle";
import {
  ArrowRightLeft,
  AlertTriangle,
  CalendarClock,
  CheckSquare,
  ChevronLeft,
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
  UsersRound,
  X,
} from "lucide-react";
import {
  ChatProfileContactCompactList,
  ChatProfileFinancialSummaryBlock,
  ChatProfileIdentitySummaryHeader,
} from "@/components/chat/ChatContactProfileSummary";
import { ChatContactInvoiceHistorySection } from "@/components/chat/ChatContactInvoiceHistorySection";

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
  /** Tags Kanban na conversa (catálogo partilhado com o quadro). */
  conversationKanbanTags?: Array<{ id: string; label: string; color?: string }>;
  conversationKanbanTagsLoading?: boolean;
  tenantKanbanTagOptions?: Array<{ id: string; label: string; color?: string }>;
  tenantKanbanTagsLoading?: boolean;
  kanbanTagsBusy?: boolean;
  onAddConversationKanbanTag?: (opts: {
    tagId?: string;
    newLabel?: string;
    newColor?: string;
  }) => Promise<void>;
  onRemoveConversationKanbanTag?: (tagId: string) => Promise<void>;
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
  /** Sem `leads.create`: desativa + Lead (perfil ainda pode mostrar vínculo). */
  disableAddLead?: boolean;
  addLeadDisabledReason?: string;
  onUnlink?: () => void;
  onSystemDelete?: () => Promise<void> | void;
  showConvertLead: boolean;
  showLinkActions: boolean;
  showUnlink: boolean;
  showSystemDelete?: boolean;
  linkConversationLabel?: string;
  /** Cliente CRM vinculado: botão para página completa do cliente */
  showOpenFullProfile?: boolean;
  onOpenFullProfile?: () => void;
  /** UUID do cliente CRM para resumo financeiro (customer_invoices) */
  crmClientId?: string | null;
  /** Texto curto ex.: "21 de abr. de 2023" quando kind === client */
  clientSinceLabel?: string | null;
  /** Abre o Financeiro do cliente (`/clients/:id/finance`) com retorno ao chat */
  onOpenClientFinance?: () => void;
  /** Notas CRM (painel lateral — últimas entradas) */
  crmNotesPreview?: Array<{
    id: string;
    note_text: string;
    created_at: string;
    conversation_id?: string | null;
    message_id?: string | null;
    source_comment_id?: string | null;
  }>;
  crmNotesLoading?: boolean;
  onCrmNotesRefresh?: () => void;
  onNewCrmNote?: () => void;
  /** Nota com vínculo à conversa/mensagem — abrir chat no ponto certo */
  onOpenNoteInChat?: (note: {
    id: string;
    note_text: string;
    created_at: string;
    conversation_id?: string | null;
    message_id?: string | null;
    source_comment_id?: string | null;
  }) => void;
  /** Fase 4: criar grupo WhatsApp (UazAPI) a partir desta conversa individual. */
  showCreateGroupWithClient?: boolean;
  /** Sem número detetável: mostra a secção mas impede o envio até haver MSISDN. */
  createGroupWithClientDisabled?: boolean;
  createGroupWithClientDisabledHint?: string | null;
  onOpenCreateGroupWithClient?: () => void;
  /** Secção opcional ex.: mensagens de texto agendadas para esta conversa */
  scheduledMessagesSection?: React.ReactNode;
};

export type ChatContactProfilePanelExtraProps = {
  interactionMode: "sheet" | "desktop";
  /** Coluna desktop: fechar painel */
  onDesktopClose?: () => void;
};

export type ChatContactProfilePanelProps = ChatContactProfileSheetProps & ChatContactProfilePanelExtraProps;

function KanbanTagsOnConversationSection({
  tags,
  loading,
  tenantOptions,
  tenantLoading,
  busy,
  onAdd,
  onRemove,
}: {
  tags: Array<{ id: string; label: string; color?: string }>;
  loading: boolean;
  tenantOptions: Array<{ id: string; label: string; color?: string }>;
  tenantLoading: boolean;
  busy: boolean;
  onAdd: (opts: { tagId?: string; newLabel?: string; newColor?: string }) => Promise<void>;
  onRemove: (tagId: string) => Promise<void>;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [pickId, setPickId] = React.useState<string>("");
  const [draftLabel, setDraftLabel] = React.useState("");
  const [draftColor, setDraftColor] = React.useState<string>(DEFAULT_CHAT_TAG_COLOR);
  const [hexDraft, setHexDraft] = React.useState<string>(DEFAULT_CHAT_TAG_COLOR);
  const customColorInputRef = React.useRef<HTMLInputElement>(null);

  const onConv = new Set(tags.map((t) => t.id));
  const available = tenantOptions.filter((t) => !onConv.has(t.id));

  React.useEffect(() => {
    if (!addOpen) {
      setPickId("");
      setDraftLabel("");
      setDraftColor(DEFAULT_CHAT_TAG_COLOR);
      setHexDraft(DEFAULT_CHAT_TAG_COLOR);
    }
  }, [addOpen]);

  return (
    <section className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tags Kanban</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {loading ? (
          <span className="text-xs text-muted-foreground">A carregar…</span>
        ) : tags.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          tags.map((t) => (
            <span key={t.id} className="inline-flex max-w-full items-center gap-0.5">
              <ChatKanbanTagBadge label={t.label} color={t.color} className="max-w-[min(200px,70vw)] gap-0 pr-1" />
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label={`Remover tag ${t.label}`}
                disabled={busy}
                onClick={() => void onRemove(t.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="mt-3">
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-1.5 text-xs" disabled={busy}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] space-y-3 p-3" align="start">
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Tag existente</span>
              {tenantLoading ? (
                <p className="text-[11px] text-muted-foreground">A carregar catálogo…</p>
              ) : available.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {tenantOptions.length === 0
                    ? "Ainda não há tags no tenant. Crie uma nova abaixo."
                    : "Todas as tags já estão nesta conversa."}
                </p>
              ) : (
                <Select value={pickId || undefined} onValueChange={setPickId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Escolher…" />
                  </SelectTrigger>
                    <SelectContent>
                    {available.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full border border-border/60"
                            style={{
                              backgroundColor: normalizeHexColor(t.color ?? DEFAULT_CHAT_TAG_COLOR),
                            }}
                            aria-hidden
                          />
                          {t.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                type="button"
                size="sm"
                className="w-full"
                disabled={busy || !pickId}
                onClick={async () => {
                  const id = pickId.trim();
                  if (!id) return;
                  try {
                    await onAdd({ tagId: id });
                    setAddOpen(false);
                  } catch {
                    /* toast no pai */
                  }
                }}
              >
                Adicionar selecionada
              </Button>
            </div>
            <Separator className="opacity-60" />
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Nova tag</span>
              <Input
                className="h-9 text-xs"
                placeholder="Nome da tag"
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                maxLength={80}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {CHAT_TAG_COLOR_PALETTE.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    title={p.name}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-transform hover:scale-105",
                      draftColor === p.value ? "border-foreground ring-1 ring-ring" : "border-transparent",
                    )}
                    style={{ backgroundColor: p.value }}
                    onClick={() => {
                      setDraftColor(p.value);
                      setHexDraft(p.value);
                    }}
                  />
                ))}
                {(() => {
                  const resolvedHex = normalizeHexColor(hexDraft || draftColor);
                  const isPreset = CHAT_TAG_COLOR_PALETTE.some(
                    (pal) => pal.value.toLowerCase() === resolvedHex.toLowerCase(),
                  );
                  const pickerValue = /^#[0-9A-Fa-f]{6}$/.test(resolvedHex) ? resolvedHex : DEFAULT_CHAT_TAG_COLOR;
                  return (
                    <>
                      <input
                        ref={customColorInputRef}
                        type="color"
                        className="sr-only pointer-events-none h-px w-px opacity-0"
                        value={pickerValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraftColor(v);
                          setHexDraft(v);
                        }}
                        aria-hidden
                        tabIndex={-1}
                      />
                      <button
                        type="button"
                        title="Cor personalizada"
                        aria-label="Abrir seletor de cor personalizada"
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/45 bg-muted/30 text-muted-foreground transition hover:scale-105 hover:border-primary/70 hover:bg-muted/60 hover:text-foreground",
                          !isPreset && "border-primary text-primary ring-1 ring-ring",
                        )}
                        onClick={() => customColorInputRef.current?.click()}
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 flex-1 font-mono text-xs"
                  placeholder="#2563EB"
                  value={hexDraft}
                  onChange={(e) => setHexDraft(e.target.value)}
                  maxLength={7}
                  spellCheck={false}
                />
                <ChatKanbanTagBadge
                  label={draftLabel.trim() || "Pré-visualização"}
                  color={normalizeHexColor(hexDraft || draftColor)}
                  className="shrink-0"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={busy || !draftLabel.trim()}
                onClick={async () => {
                  const label = draftLabel.trim();
                  if (!label) return;
                  const color = normalizeHexColor(hexDraft || draftColor);
                  try {
                    await onAdd({ newLabel: label, newColor: color });
                    setAddOpen(false);
                  } catch {
                    /* toast no pai */
                  }
                }}
              >
                Criar e aplicar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}

export function ProfileFieldEditor({
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
    crmNotesPreview = [],
    crmNotesLoading,
    onCrmNotesRefresh,
    onNewCrmNote,
    onOpenNoteInChat,
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
    conversationKanbanTags,
    conversationKanbanTagsLoading,
    tenantKanbanTagOptions,
    tenantKanbanTagsLoading,
    kanbanTagsBusy,
    onAddConversationKanbanTag,
    onRemoveConversationKanbanTag,
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
    disableAddLead = false,
    addLeadDisabledReason,
    onUnlink,
    onSystemDelete,
    showConvertLead,
    showLinkActions,
    showUnlink,
    showSystemDelete = false,
    linkConversationLabel = "Vincular conversa",
    showCreateGroupWithClient = false,
    createGroupWithClientDisabled = false,
    createGroupWithClientDisabledHint = null,
    onOpenCreateGroupWithClient,
    crmClientId = null,
    clientSinceLabel = null,
    onOpenClientFinance,
    scheduledMessagesSection,
  } = props;

  const [profileSurface, setProfileSurface] = React.useState<"summary" | "edit">("summary");
  const [systemDeleteConfirmOpen, setSystemDeleteConfirmOpen] = React.useState(false);
  const [systemDeleting, setSystemDeleting] = React.useState(false);

  React.useEffect(() => {
    setProfileSurface("summary");
  }, [displayName, kind, phoneDisplay]);

  const closeThen = React.useCallback(
    (fn: () => void) => {
      if (interactionMode === "sheet") {
        onOpenChange(false);
      }
      fn();
    },
    [interactionMode, onOpenChange],
  );

  const handleMobileHeaderBack = React.useCallback(() => {
    if (profileSurface === "edit") {
      setProfileSurface("summary");
      return;
    }
    closeThen(onBackToConversation);
  }, [profileSurface, closeThen, onBackToConversation]);

  const handleConfirmSystemDelete = React.useCallback(async () => {
    if (!onSystemDelete) return;
    setSystemDeleting(true);
    try {
      await onSystemDelete();
      setSystemDeleteConfirmOpen(false);
      onOpenChange(false);
    } finally {
      setSystemDeleting(false);
    }
  }, [onOpenChange, onSystemDelete]);

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
          <p className="min-w-0 truncate text-base font-semibold leading-tight">
            {profileSurface === "edit" ? "Editar contato" : "Perfil do contato"}
          </p>
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
              aria-label={profileSurface === "edit" ? "Voltar ao resumo do perfil" : "Voltar para conversa"}
              onClick={handleMobileHeaderBack}
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
            {profileSurface === "summary" ? (
              <>
                <ChatProfileIdentitySummaryHeader
                  displayName={displayName}
                  phoneDisplay={phoneDisplay}
                  avatarUrl={avatarUrl}
                  initials={initials}
                  kind={kind}
                  clientSinceLabel={clientSinceLabel ?? undefined}
                  showOpenFullProfile={Boolean(showOpenFullProfile && onOpenFullProfile)}
                  onOpenFullProfile={
                    showOpenFullProfile && onOpenFullProfile ? () => closeThen(onOpenFullProfile) : undefined
                  }
                  canEditProfileFields={canEditProfileFields}
                  onEdit={() => setProfileSurface("edit")}
                />
                {statusLine ? (
                  <p className="-mt-2 text-center text-[11px] leading-snug text-muted-foreground">{statusLine}</p>
                ) : null}

                {scheduledMessagesSection ? (
                  <div className="-mt-1 space-y-2">{scheduledMessagesSection}</div>
                ) : null}

                <ChatProfileFinancialSummaryBlock clientId={crmClientId} kind={kind} />

                <ChatProfileContactCompactList
                  profileFields={profileFields}
                  headerPhone={phoneDisplay}
                  onEditContact={() => setProfileSurface("edit")}
                  canEditProfileFields={canEditProfileFields}
                />

                {(kind === "unlinked" && showLinkActions) || (kind === "lead" && showConvertLead && onConvertLead) ? (
                  <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vínculo CRM</p>
                    <div className="mt-3 flex flex-col gap-2">
                      {kind === "unlinked" && showLinkActions && onAddLead ? (
                        <Button
                          type="button"
                          size="default"
                          className="w-full gap-2 shadow-sm"
                          onClick={() => closeThen(onAddLead)}
                          disabled={loadingLead || disableAddLead}
                          title={disableAddLead ? addLeadDisabledReason : undefined}
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
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {interactionMode === "desktop" ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 px-2 text-muted-foreground"
                      onClick={() => setProfileSurface("summary")}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Voltar ao resumo
                    </Button>
                  </div>
                ) : null}
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
              </>
            )}

            {profileSurface === "summary" && showCreateGroupWithClient && onOpenCreateGroupWithClient ? (
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Grupo WhatsApp</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 h-11 w-full justify-start gap-2"
                  disabled={createGroupWithClientDisabled}
                  onClick={() => {
                    if (createGroupWithClientDisabled) return;
                    closeThen(onOpenCreateGroupWithClient);
                  }}
                >
                  <UsersRound className="h-4 w-4 shrink-0 opacity-80" />
                  Criar grupo com este cliente
                </Button>
                {createGroupWithClientDisabled && createGroupWithClientDisabledHint ? (
                  <p className="mt-2 text-xs text-muted-foreground">{createGroupWithClientDisabledHint}</p>
                ) : null}
              </div>
            ) : null}

            {profileSurface === "summary" && kind === "client" && crmClientId ? (
              <ChatContactInvoiceHistorySection
                clientId={crmClientId}
                enabled={kind === "client"}
                onViewAll={
                  onOpenClientFinance ? () => closeThen(onOpenClientFinance) : undefined
                }
              />
            ) : null}

            {kind === "client" && clientGroups && clientGroups.length > 0 && onClientGroupChange ? (
              <section className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Grupo de clientes
                </p>
                <Select
                  value={selectedClientGroupId ?? "__none__"}
                  disabled={savingClientGroup}
                  onValueChange={(v) => void onClientGroupChange(v === "__none__" ? null : v)}
                >
                  <SelectTrigger className="mt-2 h-9">
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
              </section>
            ) : null}

            {onAddConversationKanbanTag && onRemoveConversationKanbanTag ? (
              <KanbanTagsOnConversationSection
                tags={conversationKanbanTags ?? []}
                loading={conversationKanbanTagsLoading ?? false}
                tenantOptions={tenantKanbanTagOptions ?? []}
                tenantLoading={tenantKanbanTagsLoading ?? false}
                busy={kanbanTagsBusy ?? false}
                onAdd={onAddConversationKanbanTag}
                onRemove={onRemoveConversationKanbanTag}
              />
            ) : null}

            {/* Anotações CRM */}
            <section className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Anotações</p>
                {onNewCrmNote && kind !== "unlinked" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => closeThen(onNewCrmNote)}
                  >
                    Nova
                  </Button>
                ) : null}
              </div>
              {kind === "unlinked" ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Vincule este contato a um cliente ou lead para salvar anotações no perfil.
                </p>
              ) : crmNotesLoading ? (
                <p className="mt-2 text-xs text-muted-foreground">A carregar…</p>
              ) : crmNotesPreview.length === 0 ? (
                <p className="mt-2 text-xs italic text-muted-foreground">Sem anotações ainda.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {crmNotesPreview.slice(0, 3).map((n) => (
                    <li key={n.id} className="rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                      <p className="line-clamp-4 whitespace-pre-wrap text-foreground/95">{n.note_text}</p>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                        <p className="text-[10px] text-muted-foreground">
                          {n.created_at ? new Date(n.created_at).toLocaleString("pt-BR") : ""}
                        </p>
                        {n.conversation_id && n.message_id && onOpenNoteInChat ? (
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto min-h-0 p-0 text-[10px] font-medium text-primary"
                            onClick={() => closeThen(() => onOpenNoteInChat(n))}
                          >
                            Ver na conversa
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {kind !== "unlinked" && onCrmNotesRefresh ? (
                <Button
                  type="button"
                  variant="link"
                  className="mt-1 h-auto px-0 text-xs text-primary"
                  onClick={() => onCrmNotesRefresh()}
                >
                  Ver todas / atualizar
                </Button>
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

            {(showUnlink && onUnlink) || (showSystemDelete && onSystemDelete) ? (
              <div className="pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avançado</p>
                {showUnlink && onUnlink ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="mt-2 h-11 w-full justify-start gap-2 rounded-lg"
                    onClick={() => closeThen(onUnlink)}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    Remover vínculo com CRM
                  </Button>
                ) : null}
                {showSystemDelete && onSystemDelete ? (
                  <div className="mt-2 rounded-lg border border-destructive/25 bg-destructive/5 p-2">
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-11 w-full justify-start gap-2 rounded-lg"
                      onClick={() => setSystemDeleteConfirmOpen(true)}
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Deletar conversa do sistema
                    </Button>
                    <p className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground">
                      Remove permanentemente o histórico desta conversa do PainelCRM.
                    </p>
                  </div>
                ) : null}
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
      <AlertDialog open={systemDeleteConfirmOpen} onOpenChange={setSystemDeleteConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar conversa?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Esta ação removerá permanentemente:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>histórico de mensagens;</li>
                  <li>vínculo com cliente/lead;</li>
                  <li>anexos locais;</li>
                  <li>cache da conversa;</li>
                  <li>dados do atendimento.</li>
                </ul>
                <p className="font-medium text-foreground">A conversa NÃO será apagada do WhatsApp.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={systemDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={systemDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmSystemDelete();
              }}
            >
              {systemDeleting ? "Deletando..." : "Sim, deletar conversa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
