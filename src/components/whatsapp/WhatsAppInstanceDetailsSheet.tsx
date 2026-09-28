import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, QrCode, RefreshCw, Unplug, MessageSquare, Shield, RotateCcw, Wrench, AlertTriangle } from "lucide-react";
import type { ChatInstance } from "@/services/chat";
import { chatService } from "@/services/chat";
import { toast } from "@/components/ui/sonner";
import {
  formatWhatsappDisplayPhone,
  getConnectedAtShortDate,
  getMessagesSyncedCount,
  getShortOperationalPhrase,
  getWhatsAppInstanceProfileInfo,
} from "@/lib/whatsappInstanceProfile";

type Props = {
  instance: ChatInstance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generatingQR: boolean;
  checkingStatus: boolean;
  deleting: boolean;
  quickSyncing: boolean;
  canOperateConversations: boolean;
  onOpenChat: () => void;
  onQuickSync: () => void;
  onRefresh: () => void;
  onOpenQR: () => void;
  onDisconnect: () => void;
  onInstanceUpdated?: () => void;
  webhookStatus?: {
    hasSecret: boolean;
    needsReconfiguration: boolean;
    lastSeenAt: string | null;
    callbackUrlMasked: string | null;
    synced?: boolean | null;
    statusLabel:
      | "OK"
      | "Precisa reconfigurar"
      | "Secret ausente"
      | "Nunca recebeu webhook"
      | "Desync com provedor";
  } | null;
  webhookLoading?: boolean;
  webhookActionLoading?: boolean;
  onWebhookRefresh: () => void;
  onWebhookReconfigure: () => void;
  onWebhookRepair?: () => void;
  onWebhookRotateSecret: () => void;
};

export function WhatsAppInstanceDetailsSheet({
  instance,
  open,
  onOpenChange,
  generatingQR,
  checkingStatus,
  deleting,
  quickSyncing,
  canOperateConversations,
  onOpenChat,
  onQuickSync,
  onRefresh,
  onOpenQR,
  onDisconnect,
  onInstanceUpdated,
  webhookStatus,
  webhookLoading = false,
  webhookActionLoading = false,
  onWebhookRefresh,
  onWebhookReconfigure,
  onWebhookRepair,
  onWebhookRotateSecret,
}: Props) {
  const profile = instance ? getWhatsAppInstanceProfileInfo(instance) : null;
  const title = profile?.name?.trim() || "WhatsApp";
  const phone = formatWhatsappDisplayPhone(profile?.phone);
  const avatarLabel = profile?.name || title;
  const connectedAt = instance ? getConnectedAtShortDate(instance) : null;
  const synced = instance ? getMessagesSyncedCount(instance) : null;
  const shortStatus = instance ? getShortOperationalPhrase(instance) : "—";
  const canManage = instance?.can_manage !== false;

  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingSaving, setRoutingSaving] = useState(false);
  const [enabledInChat, setEnabledInChat] = useState(true);
  const [useForInvoice, setUseForInvoice] = useState(false);
  const [invoiceRoutedInstanceId, setInvoiceRoutedInstanceId] = useState<string | null>(null);
  const [modules, setModules] = useState<
    Array<{ module_key: string; label: string; enabled: boolean; routed_instance_id: string | null }>
  >([]);

  useEffect(() => {
    if (!open || !instance?.id) return;
    let cancelled = false;
    setRoutingLoading(true);
    void chatService
      .getInstancePurposeRouting(instance.id)
      .then((r) => {
        if (cancelled) return;
        setEnabledInChat(r.enabled_in_chat);
        setUseForInvoice(r.use_for_invoice);
        setInvoiceRoutedInstanceId(r.invoice_routed_instance_id ?? null);
        setModules(r.modules ?? []);
        if (r.auto_seeded) {
          toast.success("Finalidades ativadas automaticamente", {
            description:
              "Como era a única conexão ativa, Chat, faturas e módulos ficaram nesta instância. Pode desativar no detalhe.",
          });
          onInstanceUpdated?.();
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Não foi possível carregar finalidades");
      })
      .finally(() => {
        if (!cancelled) setRoutingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, instance?.id]);

  const applyPurposeRouting = (pr: {
    enabled_in_chat: boolean;
    use_for_invoice: boolean;
    modules?: Array<{ module_key: string; label: string; enabled: boolean; routed_instance_id: string | null }>;
  }) => {
    setEnabledInChat(pr.enabled_in_chat);
    setUseForInvoice(pr.use_for_invoice);
    if (pr.use_for_invoice) {
      setInvoiceRoutedInstanceId(instance?.id ?? null);
    } else {
      setInvoiceRoutedInstanceId((prev) => (prev === instance?.id ? null : prev));
    }
    if (pr.modules) setModules(pr.modules);
  };

  const patchRouting = async (patch: {
    enabledInChat?: boolean;
    useForInvoice?: boolean;
    moduleKey?: string;
    useForModule?: boolean;
  }) => {
    if (!instance?.id || !canManage) return;
    const prevChat = enabledInChat;
    const prevInvoice = useForInvoice;
    const prevInvoiceRouted = invoiceRoutedInstanceId;
    const prevModules = modules;
    if (patch.enabledInChat !== undefined) setEnabledInChat(patch.enabledInChat);
    if (patch.useForInvoice !== undefined) setUseForInvoice(patch.useForInvoice);
    if (patch.moduleKey !== undefined && patch.useForModule !== undefined) {
      setModules((list) =>
        list.map((m) =>
          m.module_key === patch.moduleKey ? { ...m, enabled: patch.useForModule! } : m,
        ),
      );
    }
    setRoutingSaving(true);
    try {
      const updated = await chatService.patchInstance(instance.id, patch);
      if (updated.purpose_routing) applyPurposeRouting(updated.purpose_routing);
      onInstanceUpdated?.();
      toast.success("Finalidade atualizada");
    } catch (e: unknown) {
      setEnabledInChat(prevChat);
      setUseForInvoice(prevInvoice);
      setInvoiceRoutedInstanceId(prevInvoiceRouted);
      setModules(prevModules);
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setRoutingSaving(false);
    }
  };

  const statusLower = (instance?.status ?? "").toLowerCase();
  const isDisconnected = statusLower !== "connected" && statusLower !== "open" && statusLower !== "connecting";
  const hasNotifyPurpose = useForInvoice || modules.some((m) => m.enabled);
  const showDisconnectedRoutingWarn =
    !routingLoading && isDisconnected && (hasNotifyPurpose || enabledInChat);
  const showNoInvoiceDedicated =
    !routingLoading && !useForInvoice && invoiceRoutedInstanceId == null;
  const showRoutedElsewhere =
    !routingLoading &&
    !useForInvoice &&
    invoiceRoutedInstanceId != null &&
    invoiceRoutedInstanceId !== instance?.id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes da instância</SheetTitle>
          <SheetDescription>Visão completa do canal selecionado</SheetDescription>
        </SheetHeader>

        {instance ? (
          <div className="mt-6 space-y-6">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14 border border-border/60">
                <AvatarImage src={profile?.pictureUrl || undefined} alt={avatarLabel} />
                <AvatarFallback>{avatarLabel.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{title}</p>
                <p className="truncate text-sm text-muted-foreground">{phone}</p>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-4 text-sm">
              <p>{connectedAt ? `Conectado em ${connectedAt}` : "Conectado em —"}</p>
              <p>
                {synced != null
                  ? `${synced.toLocaleString("pt-BR")} mensagens sincronizadas`
                  : "Mensagens sincronizadas: —"}
              </p>
              <p className="font-medium">{shortStatus}</p>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Para que usar esta conexão</p>
                {routingLoading || routingSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Chat controla o inbox. Faturas e módulos definem qual número envia notificações
                automáticas. Na primeira (ou única) conexão ativa, tudo é ativado automaticamente —
                desative o que não quiser.
              </p>
              {showDisconnectedRoutingWarn ? (
                <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Esta conexão está desconectada. Com finalidades ativas, o envio automático pode falhar
                    ou cair no fallback até reconectar (QR).
                  </AlertDescription>
                </Alert>
              ) : null}
              {showNoInvoiceDedicated ? (
                <Alert className="border-border/60 bg-muted/40">
                  <AlertDescription className="text-xs text-muted-foreground">
                    Nenhuma conexão dedicada a faturas — o sistema usa a heurística padrão. Com uma
                    única conexão ativa, as finalidades são ativadas automaticamente.
                  </AlertDescription>
                </Alert>
              ) : null}
              {showRoutedElsewhere ? (
                <Alert className="border-border/60 bg-muted/40">
                  <AlertDescription className="text-xs text-muted-foreground">
                    Notificações de faturas continuam em outra conexão. Marque aqui só se quiser
                    transferir.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 px-3 py-2.5">
                <Label htmlFor="purpose-chat" className="text-sm font-normal cursor-pointer">
                  Usar no Chat
                </Label>
                <Switch
                  id="purpose-chat"
                  checked={enabledInChat}
                  disabled={!canManage || routingLoading || routingSaving}
                  onCheckedChange={(v) => void patchRouting({ enabledInChat: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 px-3 py-2.5">
                <div className="min-w-0">
                  <Label htmlFor="purpose-invoice" className="text-sm font-normal cursor-pointer">
                    Notificação de faturas
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Apenas uma conexão por conta. Ao marcar, substitui a anterior.
                  </p>
                </div>
                <Switch
                  id="purpose-invoice"
                  checked={useForInvoice}
                  disabled={!canManage || routingLoading || routingSaving}
                  onCheckedChange={(v) => void patchRouting({ useForInvoice: v })}
                />
              </div>
              {modules.map((m) => (
                <div
                  key={m.module_key}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <Label
                      htmlFor={`purpose-module-${m.module_key}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {m.label}
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Notificações automáticas deste módulo
                    </p>
                  </div>
                  <Switch
                    id={`purpose-module-${m.module_key}`}
                    checked={m.enabled}
                    disabled={!canManage || routingLoading || routingSaving}
                    onCheckedChange={(v) =>
                      void patchRouting({ moduleKey: m.module_key, useForModule: v })
                    }
                  />
                </div>
              ))}
              {!canManage ? (
                <p className="text-xs text-muted-foreground">Apenas o dono da conexão pode alterar estas opções.</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button type="button" onClick={onOpenChat} className="h-11">
                <MessageSquare className="mr-2 h-4 w-4" />
                Abrir conversa
              </Button>
              <Button
                type="button"
                onClick={onQuickSync}
                className="h-11"
                disabled={!canOperateConversations || quickSyncing}
              >
                {quickSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {quickSyncing ? "Sincronizando..." : "Sincronizar"}
              </Button>
              <Button type="button" variant="outline" onClick={onRefresh} disabled={checkingStatus} className="h-11">
                {checkingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {checkingStatus ? "Atualizando..." : "Atualizar conexão"}
              </Button>
              <Button type="button" variant="outline" onClick={onOpenQR} disabled={generatingQR} className="h-11">
                {generatingQR ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                {generatingQR ? "Abrindo..." : "QR Code"}
              </Button>
            </div>

            <Separator />

            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4" />
                  Status do webhook
                </div>
                <Button size="sm" variant="outline" onClick={onWebhookRefresh} disabled={webhookLoading || webhookActionLoading}>
                  {webhookLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Status:{" "}
                  <Badge variant={webhookStatus?.statusLabel === "OK" ? "default" : "secondary"} className="ml-1">
                    {webhookStatus?.statusLabel ?? "—"}
                  </Badge>
                </p>
                <p>
                  Último delivery recebido:{" "}
                  {webhookStatus?.lastSeenAt
                    ? new Date(webhookStatus.lastSeenAt).toLocaleString("pt-BR")
                    : "—"}
                </p>
                <p>Secret configurado: {webhookStatus?.hasSecret ? "Sim" : "Não"}</p>
                <p>
                  Sync com Uaz:{" "}
                  {webhookStatus?.synced === true
                    ? "Sim"
                    : webhookStatus?.synced === false
                      ? "Não"
                      : "—"}
                </p>
                <p className="break-all">Callback atual: {webhookStatus?.callbackUrlMasked ?? "—"}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="button" variant="secondary" disabled={webhookActionLoading} onClick={onWebhookReconfigure}>
                  {webhookActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Reconfigurar webhook
                </Button>
                {onWebhookRepair ? (
                  <Button type="button" variant="outline" disabled={webhookActionLoading} onClick={onWebhookRepair}>
                    <Wrench className="mr-2 h-4 w-4" />
                    Reparar webhook
                  </Button>
                ) : null}
                <Button type="button" variant="outline" disabled={webhookActionLoading} onClick={onWebhookRotateSecret}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Rotacionar secret
                </Button>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={onDisconnect}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
              {deleting ? "Desconectando..." : "Desconectar"}
            </Button>

            <div className="space-y-1 rounded-lg border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
              {instance.name ? <p>Referência interna: {instance.name}</p> : null}
              <p className="font-mono text-[10px] break-all">{instance.id}</p>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
