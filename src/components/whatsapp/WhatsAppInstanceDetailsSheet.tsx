import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Loader2, QrCode, RefreshCw, Unplug, MessageSquare, Shield, RotateCcw, Wrench } from "lucide-react";
import type { ChatInstance } from "@/services/chat";
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
              <p>{synced != null ? `${synced.toLocaleString("pt-BR")} mensagens sincronizadas` : "Mensagens sincronizadas: —"}</p>
              <p className="font-medium">{shortStatus}</p>
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
              <p className="break-all">ID: {instance.id}</p>
              {instance.external_instance_name ? <p className="break-all">Provedor: {instance.external_instance_name}</p> : null}
              {instance.created_at ? <p>Criado em: {new Date(instance.created_at).toLocaleString("pt-BR")}</p> : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

