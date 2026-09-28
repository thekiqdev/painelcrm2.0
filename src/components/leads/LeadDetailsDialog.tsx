import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarPlus,
  CheckCircle2,
  Edit,
  FileText,
  History,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  StickyNote,
  UserRoundPlus,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveConversationIdForCrmRecord } from "@/lib/resolveChatConversationForCrm";
import { chatService } from "@/services/chat";
import { useFloatingChatOptional } from "@/features/floating-chat";
import { resolveProfileAvatarUrl } from "@/utils/chatIdentityDisplay";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";
import LeadTasksTab from "./tabs/LeadTasksTab";
import LeadStickyNotesTab from "./tabs/LeadStickyNotesTab";
import LeadProposalsTab from "./tabs/LeadProposalsTab";
import { EmbeddedLeadConversationPanel } from "./EmbeddedLeadConversationPanel";
import { cn } from "@/lib/utils";
import { formatCpfCnpjDisplay } from "@/utils/cpfCnpj";

function formatLeadLastTouch(iso?: string | null): string {
  if (!iso) return "Não informado";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Não informado";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Hoje às ${format(d, "HH:mm", { locale: ptBR })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Ontem às ${format(d, "HH:mm", { locale: ptBR })}`;
  }
  return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

interface LeadDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lead: any | null;
  tasks: any[];
  getStatusVariant: (status: string) => { color: string };
  onEditLead: (lead: any) => void;
  onTabChange: (tab: string) => void;
  activeTab: string;
  onConvertToClient: () => void;
  onAddTask: (values: any) => void;
  onUpdateTaskStatus: (taskId: string, status: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onSaveStickyNotesJson: (notesJson: string) => void | Promise<void>;
  onOpenProposalCreate: () => void;
}

function InfoField({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1 min-h-5 text-sm text-foreground">{value || "Nao informado"}</div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  title,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 justify-start gap-2"
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Button>
  );

  if (!title) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{title}</TooltipContent>
    </Tooltip>
  );
}

function CompactQuickTile({
  label,
  icon,
  onClick,
  disabled,
  ariaLabel,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      className={cn(
        "flex w-full min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl border border-border/55 bg-muted/20 px-1.5 py-2 text-[11px] font-medium leading-tight text-foreground shadow-sm transition-colors",
        "active:bg-muted/45 disabled:pointer-events-none disabled:opacity-45",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
      )}
    >
      <span className="text-muted-foreground [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>
      <span className="text-center">{label}</span>
    </button>
  );
}

const LeadDetailsDialog: React.FC<LeadDetailsDialogProps> = ({
  isOpen,
  onClose,
  lead,
  tasks,
  getStatusVariant,
  onEditLead,
  onTabChange,
  activeTab,
  onConvertToClient,
  onAddTask,
  onUpdateTaskStatus,
  onDeleteTask,
  onSaveStickyNotesJson,
  onOpenProposalCreate,
}) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const floatingChat = useFloatingChatOptional();
  const { user } = useAuth();
  const {
    canView,
    canCreate,
    canEditRecord,
    hasPermissionKey,
  } = useModulePermissions();
  const [whatsappAvatarUrl, setWhatsappAvatarUrl] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationLookupDone, setConversationLookupDone] = useState(false);

  const tabValue = activeTab === "details" ? "summary" : activeTab;
  const isConverted = String(lead?.status ?? "").toLowerCase() === "convertido";
  const canEditLead = Boolean(lead && canEditRecord("leads", lead.user_id, user?.id));
  const canCreateTask = canCreate("tasks");
  const canEditTask = canEditRecord("tasks", undefined, user?.id);
  const canViewProposal = canView("proposals");
  const canCreateProposal = canCreate("proposals");
  const canCreateClient = canCreate("clients");
  const canConvertLead = hasPermissionKey("leads.convert_to_client") && canCreateClient && !isConverted;
  const canUseChat = canView("chat");
  const canSendChat = canUseChat && hasPermissionKey("chat.send_message");
  const canCreateAgenda = canView("agenda") && canCreate("agenda");

  useEffect(() => {
    if (lead?.id) {
      setWhatsappAvatarUrl(lead.whatsapp_avatar_url ?? null);
    }
  }, [lead?.id, lead?.whatsapp_avatar_url]);

  useEffect(() => {
    if (!isOpen || !lead?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await chatService.getCrmWhatsappIdentity({ leadId: lead.id });
        if (!cancelled) {
          setWhatsappAvatarUrl((prev) => r.avatarUrl ?? prev ?? lead.whatsapp_avatar_url ?? null);
        }
      } catch {
        if (!cancelled) setWhatsappAvatarUrl(lead.whatsapp_avatar_url ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, lead?.id]);

  useEffect(() => {
    if (!isOpen || !lead?.id || !canUseChat || !floatingChat) {
      setConversationId(null);
      setConversationLookupDone(true);
      return;
    }
    let cancelled = false;
    setConversationLookupDone(false);
    void (async () => {
      const cid = await resolveConversationIdForCrmRecord({
        leadId: lead.id,
        instanceIds: floatingChat.instanceIds,
        inboxScope: floatingChat.inboxScope,
      });
      if (!cancelled) {
        setConversationId(cid);
        setConversationLookupDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, lead?.id, canUseChat, floatingChat?.instanceIds, floatingChat?.inboxScope]);

  const profileAvatar = useMemo(
    () => resolveProfileAvatarUrl(lead ?? {}, whatsappAvatarUrl ?? lead?.whatsapp_avatar_url ?? null),
    [lead, whatsappAvatarUrl],
  );

  const goToConversationsTab = useCallback(() => {
    onTabChange("conversations");
  }, [onTabChange]);

  const handleChatQuickAction = useCallback(async () => {
    if (!canUseChat) return;
    if (!conversationLookupDone && !conversationId) return;
    if (isMobile && floatingChat && lead?.id) {
      try {
        if (conversationId) {
          floatingChat.openConversationInContext(conversationId);
          return;
        }
        const cid = await floatingChat.openChatForLead(lead.id, { createIfMissing: true });
        if (cid) {
          setConversationId(cid);
          return;
        }
      } catch {
        // Fluxo pela aba Conversas (painel embutido prepara conversa se necessário).
      }
    }
    goToConversationsTab();
  }, [
    canUseChat,
    conversationId,
    conversationLookupDone,
    floatingChat,
    goToConversationsTab,
    isMobile,
    lead?.id,
  ]);

  const openAgenda = useCallback(() => {
    if (!lead?.id) return;
    const params = new URLSearchParams({
      new: "1",
      lead_id: lead.id,
      title: lead.name ? `Contato com ${lead.name}` : "Contato com lead",
    });
    navigate(`/agenda?${params.toString()}`);
  }, [lead?.id, lead?.name, navigate]);

  if (!lead) return null;

  const statusColor = getStatusVariant(lead.status).color;
  const sourceLabel = lead.source || "Direto";

  return (
    <>
    <Sheet open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent
        side="right"
        className={
          isMobile
            ? "flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden p-0"
            : "flex h-full w-full max-w-[720px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px] lg:max-w-[720px]"
        }
      >
        <TooltipProvider delayDuration={250}>
          <SheetHeader
            className={cn(
              "sticky top-0 z-10 border-b border-border bg-background/95 text-left backdrop-blur supports-[backdrop-filter]:bg-background/90",
              isMobile ? "space-y-2.5 px-3 pb-2.5 pt-2.5" : "px-4 pb-3 pt-4 sm:px-5",
            )}
          >
            {/* Mobile: hub compacto + ações em grade */}
            <div className={cn("md:hidden", "space-y-2.5 pr-7")}>
              <div className="flex min-w-0 items-start gap-2.5">
                <Avatar className="h-10 w-10 shrink-0 ring-1 ring-border/60">
                  {profileAvatar.src ? <AvatarImage src={profileAvatar.src} alt={lead.name} /> : null}
                  <AvatarFallback className="text-sm">{profileAvatar.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-base font-semibold leading-tight tracking-tight">
                    {lead.name}
                  </SheetTitle>
                  <SheetDescription className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                    {lead.company || "Empresa não informada"}
                  </SheetDescription>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <Badge
                      variant="outline"
                      className="border-0 px-2 py-0 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: statusColor, color: "#fff" }}
                    >
                      {lead.status || "Sem status"}
                    </Badge>
                    <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
                      {sourceLabel}
                    </Badge>
                  </div>
                  {lead.phone ? (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                      <span className="truncate">{lead.phone}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {!isConverted ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block w-full">
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 w-full gap-1.5 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 px-3 text-xs font-semibold text-white shadow-md shadow-emerald-900/15 transition-all hover:from-emerald-500 hover:via-emerald-500 hover:to-teal-500 disabled:opacity-50"
                        onClick={onConvertToClient}
                        disabled={!canConvertLead}
                        aria-label="Converter este lead em cliente no CRM"
                      >
                        <UserRoundPlus className="h-3.5 w-3.5 shrink-0" />
                        Converter para cliente
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canConvertLead ? (
                    <TooltipContent className="max-w-xs">
                      Requer permissão para converter lead e criar cliente.
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <CompactQuickTile
                  label="Conversa"
                  ariaLabel={
                    conversationId ? "Abrir conversa no WhatsApp" : "Iniciar conversa no WhatsApp"
                  }
                  icon={
                    conversationLookupDone ? (
                      <MessageCircle className="h-4 w-4" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )
                  }
                  onClick={() => void handleChatQuickAction()}
                  disabled={!canUseChat || (!conversationId && !conversationLookupDone)}
                />
                <CompactQuickTile
                  label="Tarefa"
                  ariaLabel="Criar ou ver tarefas do lead"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => onTabChange("tasks")}
                  disabled={!canCreateTask}
                />
                <CompactQuickTile
                  label="Agenda"
                  ariaLabel="Agendar compromisso com este lead"
                  icon={<CalendarPlus className="h-4 w-4" />}
                  onClick={openAgenda}
                  disabled={!canCreateAgenda}
                />
                <CompactQuickTile
                  label="Proposta"
                  ariaLabel="Criar proposta comercial"
                  icon={<FileText className="h-4 w-4" />}
                  onClick={onOpenProposalCreate}
                  disabled={!canCreateProposal}
                />
                <div className="col-span-2">
                  <CompactQuickTile
                    label="Editar"
                    ariaLabel="Editar dados do lead"
                    icon={<Edit className="h-4 w-4" />}
                    onClick={() => onEditLead(lead)}
                    disabled={!canEditLead}
                  />
                </div>
              </div>
            </div>

            {/* Desktop: layout original */}
            <div className="hidden md:block">
              <div className="flex min-w-0 items-start gap-3 pr-8">
                <Avatar className="h-12 w-12 shrink-0 ring-1 ring-border/70">
                  {profileAvatar.src ? <AvatarImage src={profileAvatar.src} alt={lead.name} /> : null}
                  <AvatarFallback>{profileAvatar.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-xl">{lead.name}</SheetTitle>
                  <SheetDescription className="mt-0.5 line-clamp-2">
                    {lead.company || "Empresa não informada"}
                  </SheetDescription>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="border-0 text-white"
                      style={{ backgroundColor: statusColor, color: "#fff" }}
                    >
                      {lead.status || "Sem status"}
                    </Badge>
                    <Badge variant="secondary">{sourceLabel}</Badge>
                    {lead.phone ? (
                      <Badge variant="outline" className="gap-1 font-normal">
                        <Phone className="h-3 w-3" />
                        {lead.phone}
                      </Badge>
                    ) : null}
                    {!isConverted ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                              onClick={onConvertToClient}
                              disabled={!canConvertLead}
                            >
                              <UserRoundPlus className="h-3.5 w-3.5" />
                              Converter para cliente
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!canConvertLead ? (
                          <TooltipContent className="max-w-xs">
                            Requer permissão para converter lead e criar cliente.
                          </TooltipContent>
                        ) : null}
                      </Tooltip>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <ActionButton
                  label={conversationId ? "Abrir conversa" : "Iniciar conversa"}
                  icon={
                    conversationLookupDone ? (
                      <MessageCircle className="h-4 w-4" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )
                  }
                  onClick={goToConversationsTab}
                  disabled={!canUseChat || (!conversationId && !conversationLookupDone)}
                  title={
                    !canUseChat
                      ? "Sem permissão para ver o Chat."
                      : conversationId
                        ? "Abrir a aba Conversas deste lead."
                        : "Abrir a aba Conversas para iniciar WhatsApp com este lead."
                  }
                />
                <ActionButton
                  label="Criar tarefa"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => onTabChange("tasks")}
                  disabled={!canCreateTask}
                  title={!canCreateTask ? "Sem permissão para criar tarefas." : undefined}
                />
                <ActionButton
                  label="Agendar"
                  icon={<CalendarPlus className="h-4 w-4" />}
                  onClick={openAgenda}
                  disabled={!canCreateAgenda}
                  title={!canCreateAgenda ? "Sem permissão para criar compromissos na Agenda." : undefined}
                />
                <ActionButton
                  label="Proposta"
                  icon={<FileText className="h-4 w-4" />}
                  onClick={onOpenProposalCreate}
                  disabled={!canCreateProposal}
                  title={!canCreateProposal ? "Sem permissão para criar propostas." : undefined}
                />
                <ActionButton
                  label="Editar"
                  icon={<Edit className="h-4 w-4" />}
                  onClick={() => onEditLead(lead)}
                  disabled={!canEditLead}
                  title={!canEditLead ? "Sem permissão para editar este lead." : undefined}
                />
              </div>
            </div>
          </SheetHeader>

          <Tabs value={tabValue} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
            <div
              className={cn(
                "border-b border-border bg-background/98 backdrop-blur-sm",
                isMobile ? "sticky top-0 z-20 px-2 py-1.5" : "px-3 py-2",
              )}
            >
              <ScrollArea className="w-full">
                <TabsList
                  className={cn(
                    "inline-flex w-max min-w-full justify-start gap-0.5 bg-transparent p-0",
                    isMobile
                      ? "h-auto min-h-9 rounded-full border border-border/50 bg-muted/45 p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] [&>button]:rounded-full [&>button]:px-3 [&>button]:py-1.5 [&>button]:text-[11px] [&>button]:font-semibold [&>button]:tracking-tight"
                      : "h-10 rounded-md bg-muted p-1",
                  )}
                >
                  <TabsTrigger value="summary">Resumo</TabsTrigger>
                  <TabsTrigger value="pre_register">Pré-cadastro</TabsTrigger>
                  <TabsTrigger value="tasks">Tarefas</TabsTrigger>
                  <TabsTrigger value="proposals">Propostas</TabsTrigger>
                  <TabsTrigger value="notes">Notas</TabsTrigger>
                  <TabsTrigger value="conversations">Conversas</TabsTrigger>
                  <TabsTrigger value="history">Histórico</TabsTrigger>
                </TabsList>
              </ScrollArea>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div
                className={cn(
                  "space-y-4",
                  isMobile ? "px-3 py-3" : "px-4 py-4 sm:px-5",
                )}
              >
                <TabsContent value="summary" className="m-0 space-y-3 md:space-y-4">
                  {/* Mobile: lista compacta */}
                  <div className="md:hidden">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Resumo comercial
                    </p>
                    <div className="rounded-xl border border-border/55 bg-card/90 px-3 py-1 shadow-sm">
                      <InfoField variant="row" label="Nome" value={lead.name} />
                      <InfoField variant="row" label="Empresa" value={lead.company} />
                      <InfoField variant="row" label="E-mail" value={lead.email} />
                      <InfoField variant="row" label="Telefone" value={lead.phone} />
                      <InfoField variant="row" label="CPF/CNPJ" value={formatCpfCnpjDisplay(lead.cpf_cnpj)} />
                      <InfoField variant="row" label="Origem" value={sourceLabel} />
                      <InfoField variant="row" label="Último contato" value={formatLeadLastTouch(lead.updated_at)} />
                      <InfoField variant="row" label="Status" value={lead.status} />
                    </div>
                    <div className="mt-3 rounded-xl border border-border/55 bg-muted/15 px-3 py-2.5 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Observações
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {lead.notes || "Nenhuma observação registrada."}
                      </p>
                    </div>
                  </div>
                  {/* Desktop: cards em grade */}
                  <div className="hidden md:block space-y-4">
                    <Card className="border-border/70 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Resumo comercial</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3 sm:grid-cols-2">
                        <InfoField label="Nome" value={lead.name} />
                        <InfoField label="Empresa" value={lead.company} />
                        <InfoField label="E-mail" value={lead.email} />
                        <InfoField label="Telefone / WhatsApp" value={lead.phone} />
                        <InfoField label="CPF/CNPJ" value={formatCpfCnpjDisplay(lead.cpf_cnpj)} />
                        <InfoField label="Origem" value={sourceLabel} />
                        <InfoField label="Último contato" value={formatLeadLastTouch(lead.updated_at)} />
                        <InfoField label="Status" value={lead.status} />
                      </CardContent>
                    </Card>
                    <Card className="border-border/70 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Observações</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {lead.notes || "Nenhuma observação registrada."}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="pre_register" className="m-0 space-y-3 md:space-y-4">
                  <div className="md:hidden">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Pré-cadastro do cliente
                    </p>
                    <div className="rounded-xl border border-border/55 bg-card/90 px-3 py-1 shadow-sm">
                      <InfoField variant="row" label="Nome" value={lead.name} />
                      <InfoField variant="row" label="Empresa" value={lead.company} />
                      <InfoField variant="row" label="E-mail" value={lead.email} />
                      <InfoField variant="row" label="Telefone" value={lead.phone} />
                      <InfoField variant="row" label="CPF/CNPJ" value={formatCpfCnpjDisplay(lead.cpf_cnpj)} />
                      <InfoField variant="row" label="Origem" value={sourceLabel} />
                      <InfoField variant="row" label="Status" value={lead.status} />
                      <InfoField variant="row" label="Observações" value={lead.notes} />
                    </div>
                    <Card className="mt-3 border-dashed border-border/60 bg-muted/10 py-3 shadow-none">
                      <CardHeader className="space-y-1 px-3 pb-2 pt-0">
                        <CardTitle className="text-sm">Campos adicionais em breve</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-1.5 px-3 pb-1 pt-0 text-xs text-muted-foreground">
                        {["Endereço", "Valor potencial", "Interesse", "Campanha"].map((item) => (
                          <Badge key={item} variant="outline" className="font-normal">
                            {item}
                          </Badge>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                  <div className="hidden md:block space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Pré-cadastro do cliente</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3 sm:grid-cols-2">
                        <InfoField label="Nome" value={lead.name} />
                        <InfoField label="Empresa" value={lead.company} />
                        <InfoField label="E-mail" value={lead.email} />
                        <InfoField label="Telefone" value={lead.phone} />
                        <InfoField label="CPF/CNPJ" value={formatCpfCnpjDisplay(lead.cpf_cnpj)} />
                        <InfoField label="Origem" value={sourceLabel} />
                        <InfoField label="Status" value={lead.status} />
                        <div className="sm:col-span-2">
                          <InfoField label="Observações" value={lead.notes} />
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-dashed">
                      <CardHeader>
                        <CardTitle className="text-base">Campos adicionais em breve</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        {["Endereço", "Valor potencial", "Interesse", "Campanha"].map((item) => (
                          <Badge key={item} variant="outline" className="font-normal">
                            {item}
                          </Badge>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <LeadTasksTab
                  tasks={tasks}
                  onAddTask={onAddTask}
                  onUpdateTaskStatus={onUpdateTaskStatus}
                  onDeleteTask={onDeleteTask}
                  canCreateTask={canCreateTask}
                  canEditTask={canEditTask}
                />

                <LeadProposalsTab
                  leadId={lead.id}
                  migratedClientId={lead.migrated_client_id}
                  leadName={lead.name || ""}
                  onCreateProposal={onOpenProposalCreate}
                  canViewProposal={canViewProposal}
                  canCreateProposal={canCreateProposal}
                />

                <LeadStickyNotesTab
                  notesRaw={lead.notes}
                  onSaveNotesJson={onSaveStickyNotesJson}
                  canEditNotes={canEditLead}
                />

                <TabsContent value="conversations" className="m-0">
                  {conversationLookupDone ? (
                    <EmbeddedLeadConversationPanel
                      lead={{
                        id: lead.id,
                        name: lead.name,
                        phone: lead.phone,
                        whatsapp_avatar_url: whatsappAvatarUrl ?? lead.whatsapp_avatar_url,
                      }}
                      active={tabValue === "conversations"}
                      conversationId={conversationId}
                      inboxScope={floatingChat?.inboxScope ?? "owner"}
                      onConversationReady={setConversationId}
                      onOpenFloating={(id) => floatingChat?.openConversationInContext(id)}
                    />
                  ) : (
                    <Card>
                      <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Procurando conversa vinculada...
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="history" className="m-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <History className="h-4 w-4" />
                        Historico
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                        <div>
                          <p className="font-medium">Lead cadastrado</p>
                          <p className="text-muted-foreground">
                            {lead.created_at ? formatDateOnlyPtBr(String(lead.created_at).slice(0, 10)) : "Data indisponivel"}
                          </p>
                        </div>
                      </div>
                      {lead.updated_at ? (
                        <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                          <StickyNote className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Ultima atualizacao</p>
                            <p className="text-muted-foreground">{formatDateOnlyPtBr(String(lead.updated_at).slice(0, 10))}</p>
                          </div>
                        </div>
                      ) : null}
                      <div className="rounded-lg border border-dashed border-border p-4 text-muted-foreground">
                        Timeline detalhada de atividades sera conectada em uma proxima fase.
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </TooltipProvider>
      </SheetContent>
    </Sheet>
    </>
  );
};

export default LeadDetailsDialog;
