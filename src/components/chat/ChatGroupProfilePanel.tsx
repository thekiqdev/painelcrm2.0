import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { chatService, type ChatGroupDetails, type ChatGroupSettingsPayload } from "@/services/chat";
import { toast } from "sonner";
import { chatAvatarUrlForImgSrc } from "@/lib/chatAvatarUrl";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  Copy,
  ImagePlus,
  Loader2,
  LogOut,
  MessageSquare,
  MoreVertical,
  Pencil,
  RefreshCw,
  Settings2,
  Shield,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";

export type ChatGroupProfilePanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  interactionMode: "sheet" | "desktop";
  onDesktopClose?: () => void;
  conversationId: string;
  fallbackAvatarUrl?: string | null;
  fallbackInitials: string;
  fallbackTitle?: string | null;
  onBackToConversation: () => void;
  onAfterLeave?: () => void;
  /** Após nome/foto/definições sincronizados com o servidor (ex.: invalidar queries floating-chat). */
  onGroupConversationSynced?: () => void;
  /** Quando false, o CRM bloqueia gestão mesmo sendo administrador no WhatsApp. */
  crmAllowManage?: boolean;
};

function participantPrimaryLabel(
  jid: string,
  displayName: string | null,
  phoneDisplay: string | null,
) {
  if (displayName?.trim()) return displayName.trim();
  if (phoneDisplay?.trim()) return phoneDisplay.trim();
  return jid.split("@")[0] || jid;
}

function formatDisappearingLabel(timer: number | null, isEphemeral: boolean | null): string {
  if (timer === 0 || (timer == null && !isEphemeral)) return "Desativado";
  if (timer === 86400) return "24 horas";
  if (timer === 604800) return "7 dias";
  if (timer === 7776000) return "90 dias";
  if (timer != null && timer > 0) return `${Math.round(timer / 86400)} dias`;
  if (isEphemeral) return "Ativado";
  return "—";
}

function disappearingFromGroup(g: ChatGroupDetails | null): "off" | "24h" | "7d" | "90d" {
  const t = g?.disappearingTimer;
  if (t === 86400) return "24h";
  if (t === 604800) return "7d";
  if (t === 7776000) return "90d";
  return "off";
}

function formatMemberAddMode(mode: string | null): string {
  if (mode === "admin_add") return "Só administradores podem adicionar membros";
  if (mode === "all_member_add") return "Todos os membros podem adicionar participantes";
  return mode || "—";
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Falha ao ler ficheiro"));
    r.readAsDataURL(file);
  });
}

export function ChatGroupProfilePanel(props: ChatGroupProfilePanelProps) {
  const {
    onOpenChange,
    isMobile,
    interactionMode,
    onDesktopClose,
    conversationId,
    fallbackAvatarUrl,
    fallbackInitials,
    fallbackTitle,
    onBackToConversation,
    onAfterLeave,
    onGroupConversationSynced,
    crmAllowManage = true,
  } = props;

  const [group, setGroup] = React.useState<ChatGroupDetails | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [memberQuery, setMemberQuery] = React.useState("");
  const [addInput, setAddInput] = React.useState("");
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [nameEditOpen, setNameEditOpen] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  const [settingsDraft, setSettingsDraft] = React.useState<ChatGroupSettingsPayload | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);

  const closeThen = React.useCallback(
    (fn: () => void) => {
      if (interactionMode === "sheet") onOpenChange(false);
      fn();
    },
    [interactionMode, onOpenChange],
  );

  const load = React.useCallback(
    async (refresh?: boolean) => {
      if (!conversationId) return;
      setLoading(true);
      setError(null);
      try {
        const g = await chatService.getConversationGroupDetails(conversationId, { refresh });
        setGroup(g);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Não foi possível carregar o grupo";
        setError(msg);
        setGroup(null);
      } finally {
        setLoading(false);
      }
    },
    [conversationId],
  );

  React.useEffect(() => {
    if (!props.open || !conversationId) return;
    void load(false);
  }, [props.open, conversationId, load]);

  const displayName = group?.name?.trim() || fallbackTitle?.trim() || "Grupo";
  const avatarUrl =
    chatAvatarUrlForImgSrc(group?.profilePicUrl ?? null) ??
    chatAvatarUrlForImgSrc(fallbackAvatarUrl ?? null);
  const canManage = group?.ownerIsAdmin === true && crmAllowManage !== false;

  const filteredParticipants = React.useMemo(() => {
    if (!group?.participants) return [];
    const q = memberQuery.trim().toLowerCase();
    if (!q) return group.participants;
    return group.participants.filter((p) => {
      const hay = `${p.jid} ${p.displayName ?? ""} ${p.phone ?? ""} ${p.phoneDisplay ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [group?.participants, memberQuery]);

  const run = async (key: string, fn: () => Promise<ChatGroupDetails | void>) => {
    setBusy(key);
    try {
      const g = await fn();
      if (g) setGroup(g);
      toast.success("Atualizado");
      onGroupConversationSynced?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Operação falhou");
    } finally {
      setBusy(null);
    }
  };

  const openSettings = () => {
    if (!group || group.ownerIsAdmin !== true) return;
    setSettingsDraft({
      sendMessages: group.isAnnounce ? "admins_only" : "all",
      editGroupInfo: group.isLocked ? "admins_only" : "all",
      joinApprovalRequired: group.isJoinApprovalRequired,
      addMembers: group.memberAddMode === "admin_add" ? "admins_only" : "all",
      disappearing: disappearingFromGroup(group),
    });
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    if (!group || !settingsDraft) return;
    setBusy("settings");
    try {
      const { group: g, warnings } = await chatService.postConversationGroupSettings(
        conversationId,
        settingsDraft,
      );
      setGroup(g);
      toast.success("Definições guardadas");
      if (warnings.length) {
        warnings.forEach((w) => toast.warning(w));
      }
      onGroupConversationSynced?.();
      setSettingsOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar");
    } finally {
      setBusy(null);
    }
  };

  const openNameEdit = () => {
    setNameDraft(displayName);
    setNameEditOpen(true);
  };

  const saveName = async () => {
    const v = nameDraft.trim();
    if (!v) {
      toast.error("O nome do grupo não pode ficar vazio");
      return;
    }
    if (v.length > 25) {
      toast.error("Nome demasiado longo (máx. 25 caracteres)");
      return;
    }
    await run("name", () => chatService.postConversationGroupName(conversationId, v));
    setNameEditOpen(false);
  };

  const onCopyInvite = async () => {
    const link = group?.inviteLink;
    if (!link) {
      toast.error("Sem link de convite disponível");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const onPickImage: React.ChangeEventHandler<HTMLInputElement> = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !canManage) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await run("img", () => chatService.postConversationGroupImage(conversationId, dataUrl));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha no envio da imagem");
    }
  };

  return (
    <div
      id="chat-group-profile-panel"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    >
      {interactionMode === "desktop" ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/15 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-0.5">
            <p className="min-w-0 truncate text-base font-semibold leading-tight">{displayName}</p>
            {canManage ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Editar nome do grupo"
                onClick={openNameEdit}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Atualizar dados do grupo"
              disabled={loading}
              onClick={() => void load(true)}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            {onDesktopClose ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Fechar painel"
                onClick={onDesktopClose}
              >
                <X className="h-5 w-5" />
              </Button>
            ) : null}
          </div>
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
          <div className="min-w-0 flex-1 pr-2 sm:pr-4">
            <div className="flex items-center gap-0.5">
              <p className="truncate text-base font-semibold leading-tight">{displayName}</p>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Editar nome do grupo"
                  onClick={openNameEdit}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            {group?.participantCount != null ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {group.participantCount} participantes
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={loading}
            aria-label="Atualizar"
            onClick={() => void load(true)}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-4 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {group?.ownerIsAdmin === true && crmAllowManage === false ? (
            <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              O seu perfil no CRM não tem permissão para gerir grupos neste painel.
            </p>
          ) : null}

          <div className="flex flex-col items-center text-center">
            <Avatar className="h-16 w-16 border border-border/80 shadow-sm">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
              <AvatarFallback className="bg-primary/12 text-lg font-semibold text-primary">
                {fallbackInitials}
              </AvatarFallback>
            </Avatar>
            {interactionMode !== "desktop" ? (
              <h2 className="mt-2.5 text-base font-semibold leading-snug">{displayName}</h2>
            ) : null}
            {canManage ? (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg"
                  className="hidden"
                  onChange={onPickImage}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={busy === "img"}
                  onClick={() => imageInputRef.current?.click()}
                >
                  {busy === "img" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" />
                  )}
                  Alterar foto (JPEG)
                </Button>
              </div>
            ) : null}
          </div>

          <section className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Informações
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome do grupo</Label>
              <p className="text-sm font-medium">{group?.name ?? "—"}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              {canManage ? (
                <Textarea
                  defaultValue={group?.topic ?? ""}
                  key={group?.jid + String(group?.topic)}
                  maxLength={512}
                  rows={3}
                  disabled={!group || busy === "desc"}
                  onBlur={async (e) => {
                    const v = e.target.value;
                    if (!group || v === (group.topic ?? "")) return;
                    await run("desc", () =>
                      chatService.postConversationGroupDescription(conversationId, v),
                    );
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{group?.topic?.trim() || "—"}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1">
                <Users className="h-3.5 w-3.5" />
                {group?.participantCount ?? "—"} participantes
              </span>
              {group?.ownerIsAdmin ? (
                <Badge variant="outline" className="font-normal">
                  Você é administrador
                </Badge>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Convite
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input readOnly value={group?.inviteLink ?? ""} placeholder="Sem link" className="font-mono text-xs" />
              <div className="flex gap-2 shrink-0">
                <Button type="button" variant="secondary" size="sm" className="gap-1" onClick={() => void onCopyInvite()}>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar
                </Button>
                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy === "invite"}
                    onClick={() =>
                      void run("invite", () => chatService.postConversationGroupInviteReset(conversationId))
                    }
                  >
                    {busy === "invite" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Novo link"}
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Permissões atuais
              </p>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 -mr-1"
                  aria-label="Configurações do grupo"
                  onClick={openSettings}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            <ul className="space-y-1.5 text-sm">
              <li>
                <span className="text-muted-foreground">Mensagens: </span>
                {group?.isAnnounce ? "Só administradores podem enviar" : "Todos podem enviar"}
              </li>
              <li>
                <span className="text-muted-foreground">Editar dados do grupo: </span>
                {group?.isLocked ? "Só administradores" : "Qualquer participante"}
              </li>
              <li>
                <span className="text-muted-foreground">Novos membros: </span>
                {group?.isJoinApprovalRequired ? "Requer aprovação" : "Entrada livre (conforme convite)"}
              </li>
              <li>
                <span className="text-muted-foreground">Quem pode adicionar: </span>
                {formatMemberAddMode(group?.memberAddMode ?? null)}
              </li>
              <li>
                <span className="text-muted-foreground">Mensagens temporárias: </span>
                {formatDisappearingLabel(group?.disappearingTimer ?? null, group?.isEphemeral ?? null)}
              </li>
            </ul>
            {!canManage ? (
              <p className="text-xs text-muted-foreground">
                Apenas administradores do grupo podem alterar estas definições.
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Participantes
            </p>
            <Input
              placeholder="Buscar por nome ou JID…"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
            />
            {canManage ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Telefone (DDI…) ou JID para adicionar"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  disabled={busy === "add" || !addInput.trim()}
                  onClick={() =>
                    void run("add", async () => {
                      const g = await chatService.postConversationGroupParticipants(conversationId, {
                        action: "add",
                        participants: [addInput.trim()],
                      });
                      setAddInput("");
                      return g;
                    })
                  }
                >
                  {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
                </Button>
              </div>
            ) : null}
            <div className="divide-y divide-border/50 rounded-lg border border-border/40">
              {loading && !group ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredParticipants.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum membro encontrado</p>
              ) : (
                filteredParticipants.map((p) => {
                  const primary = participantPrimaryLabel(p.jid, p.displayName, p.phoneDisplay);
                  const pic = chatAvatarUrlForImgSrc(p.participantAvatarUrl ?? p.profilePicUrl ?? null);
                  const initials =
                    primary
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((s) => s[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase() || "?";
                  return (
                  <div key={p.jid} className="flex items-center justify-between gap-2 px-2 py-2.5">
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <Avatar className="h-9 w-9 shrink-0 border border-border/60">
                        {pic ? <AvatarImage src={pic} alt="" /> : null}
                        <AvatarFallback className="bg-muted text-xs font-semibold">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{primary}</p>
                        {p.displayName?.trim() && p.phoneDisplay?.trim() ? (
                          <p className="truncate text-xs text-muted-foreground">{p.phoneDisplay}</p>
                        ) : null}
                        <p className="truncate font-mono text-[10px] text-muted-foreground/90">
                          {p.phoneDisplay ? `JID: ${p.jid.split("@")[0]}` : p.jid}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.isSuperAdmin ? (
                            <Badge variant="secondary" className="text-[10px] gap-0.5 font-normal">
                              <ShieldAlert className="h-3 w-3" />
                              Super Admin
                            </Badge>
                          ) : null}
                          {p.isAdmin ? (
                            <Badge variant="outline" className="text-[10px] gap-0.5 font-normal">
                              <Shield className="h-3 w-3" />
                              Admin
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {canManage ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            disabled={busy === `prom-${p.jid}`}
                            onClick={() =>
                              void run(`prom-${p.jid}`, () =>
                                chatService.postConversationGroupParticipants(conversationId, {
                                  action: "promote",
                                  participants: [p.jid],
                                }),
                              )
                            }
                          >
                            Promover a administrador
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busy === `dem-${p.jid}`}
                            onClick={() =>
                              void run(`dem-${p.jid}`, () =>
                                chatService.postConversationGroupParticipants(conversationId, {
                                  action: "demote",
                                  participants: [p.jid],
                                }),
                              )
                            }
                          >
                            Remover admin
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            disabled={busy === `rem-${p.jid}`}
                            onClick={() =>
                              void run(`rem-${p.jid}`, () =>
                                chatService.postConversationGroupParticipants(conversationId, {
                                  action: "remove",
                                  participants: [p.jid],
                                }),
                              )
                            }
                          >
                            Remover do grupo
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                  );
                })
              )}
            </div>
          </section>

          <Button
            type="button"
            variant="destructive"
            className="w-full gap-2"
            onClick={() => setLeaveOpen(true)}
          >
            <LogOut className="h-4 w-4" />
            Sair do grupo
          </Button>
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

      <Dialog open={nameEditOpen} onOpenChange={setNameEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nome do grupo</DialogTitle>
          </DialogHeader>
          <Input
            value={nameDraft}
            maxLength={25}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Nome visível no WhatsApp"
            autoFocus
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setNameEditOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busy === "name"} onClick={() => void saveName()}>
              {busy === "name" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurações do grupo</DialogTitle>
          </DialogHeader>
          {settingsDraft ? (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label className="text-xs">Quem pode enviar mensagens</Label>
                <Select
                  value={settingsDraft.sendMessages}
                  onValueChange={(v) =>
                    setSettingsDraft((d) =>
                      d ? { ...d, sendMessages: v as ChatGroupSettingsPayload["sendMessages"] } : d,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="admins_only">Só administradores</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quem pode editar dados do grupo</Label>
                <Select
                  value={settingsDraft.editGroupInfo}
                  onValueChange={(v) =>
                    setSettingsDraft((d) =>
                      d ? { ...d, editGroupInfo: v as ChatGroupSettingsPayload["editGroupInfo"] } : d,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="admins_only">Só administradores</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Aprovação para entrada</Label>
                <Select
                  value={settingsDraft.joinApprovalRequired ? "on" : "off"}
                  onValueChange={(v) =>
                    setSettingsDraft((d) => (d ? { ...d, joinApprovalRequired: v === "on" } : d))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Desativada</SelectItem>
                    <SelectItem value="on">Ativada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quem pode adicionar membros</Label>
                <Select
                  value={settingsDraft.addMembers}
                  onValueChange={(v) =>
                    setSettingsDraft((d) =>
                      d ? { ...d, addMembers: v as ChatGroupSettingsPayload["addMembers"] } : d,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="admins_only">Só administradores</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mensagens temporárias</Label>
                <Select
                  value={settingsDraft.disappearing}
                  onValueChange={(v) =>
                    setSettingsDraft((d) =>
                      d ? { ...d, disappearing: v as ChatGroupSettingsPayload["disappearing"] } : d,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Desativado</SelectItem>
                    <SelectItem value="24h">24 horas</SelectItem>
                    <SelectItem value="7d">7 dias</SelectItem>
                    <SelectItem value="90d">90 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busy === "settings" || !settingsDraft} onClick={() => void saveSettings()}>
              {busy === "settings" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair deste grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              A instância WhatsApp deixará de participar do grupo. Esta ação não pode ser desfeita pelo painel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setBusy("leave");
                chatService
                  .postConversationGroupLeave(conversationId)
                  .then(() => {
                    toast.success("Saiu do grupo");
                    setLeaveOpen(false);
                    onOpenChange(false);
                    onAfterLeave?.();
                  })
                  .catch((err: unknown) => {
                    toast.error(err instanceof Error ? err.message : "Falha ao sair");
                  })
                  .finally(() => setBusy(null));
              }}
            >
              {busy === "leave" ? "A sair…" : "Sair do grupo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ChatGroupProfileSheet(props: ChatGroupProfilePanelProps) {
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
        <SheetTitle className="sr-only">Grupo WhatsApp</SheetTitle>
        <SheetDescription className="sr-only">Administrar grupo e participantes.</SheetDescription>
        <ChatGroupProfilePanel {...props} interactionMode="sheet" />
      </SheetContent>
    </Sheet>
  );
}
