import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, MessageSquare, MoreVertical, QrCode, RefreshCw, Unplug, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChatInstance } from "@/services/chat";
import {
  getWhatsAppInstanceProfileInfo,
  formatWhatsappDisplayPhone,
  getActivityHint,
  getSyncStatusUserMessage,
} from "@/lib/whatsappInstanceProfile";

type Props = {
  instance: ChatInstance;
  generatingQR: boolean;
  checkingStatus: boolean;
  deleting: boolean;
  quickSyncing?: boolean;
  onOpenDetails: () => void;
  onOpenChat: () => void;
  onQuickSync: () => void;
  onRefresh: () => void;
  onOpenQR: () => void;
  onDisconnect: () => void;
  canOperateConversations?: boolean;
  onRetryInitialSync?: () => void;
  retryInitialSyncing?: boolean;
};

function connectionBadge(status: string): string {
  const s = status.toLowerCase();
  if (s === "connected" || s === "open") return "🟢 Ativo agora";
  if (s === "connecting") return "🟡 Conectando";
  return "🔴 Desconectado";
}

export function WhatsAppInstanceCard({
  instance,
  generatingQR,
  checkingStatus,
  deleting,
  quickSyncing = false,
  onOpenDetails,
  onOpenChat,
  onQuickSync,
  onRefresh,
  onOpenQR,
  onDisconnect,
  canOperateConversations = true,
  onRetryInitialSync,
  retryInitialSyncing = false,
}: Props) {
  const { phone, name, pictureUrl } = getWhatsAppInstanceProfileInfo(instance);
  const phoneDisplay = formatWhatsappDisplayPhone(phone);
  const canManage = instance.can_manage !== false;
  const isActive = ["connected", "open"].includes(instance.status.toLowerCase());
  const profileTitle = name?.trim() || "WhatsApp";
  const avatarLabel = name || profileTitle;
  const badgeText = connectionBadge(instance.status);
  const busy = generatingQR || checkingStatus || deleting || quickSyncing || retryInitialSyncing;
  const activityHint = getActivityHint(instance);
  const syncUserMsg = getSyncStatusUserMessage(instance);
  const showRetryInitial = Boolean(syncUserMsg?.isError && onRetryInitialSync);
  const purposeBadges = instance.purpose_badges ?? [];

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-xl border border-border/70 transition-all duration-200 hover:-translate-y-[1px] hover:border-primary/25 hover:shadow-md",
        isActive && "border-emerald-500/30 bg-emerald-500/[0.02]"
      )}
    >
      <CardContent className="px-4 py-3 sm:px-4 sm:py-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 shrink-0 border border-border/60">
            <AvatarImage src={pictureUrl || undefined} alt={avatarLabel} />
            <AvatarFallback className="text-sm font-semibold">
              {avatarLabel.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-sm font-semibold text-foreground">{profileTitle}</p>
            <p className="truncate text-xs text-muted-foreground">{phoneDisplay}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              Instância: <span className="font-medium">{instance.name || "—"}</span>
            </p>
            <p className="mt-1 text-xs font-medium text-foreground">{badgeText}</p>
            {purposeBadges.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {purposeBadges.map((label) => (
                  <Badge key={label} variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                    {label}
                  </Badge>
                ))}
              </div>
            ) : null}
            <p className="truncate text-[11px] text-muted-foreground">
              {activityHint || "—"}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onOpenChat}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Abrir conversa
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onQuickSync}
                disabled={!canOperateConversations || quickSyncing}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {quickSyncing ? "Sincronizando..." : "Sincronizar"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRefresh} disabled={checkingStatus}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {checkingStatus ? "Atualizando..." : "Atualizar conexão"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenQR} disabled={generatingQR}>
                <QrCode className="mr-2 h-4 w-4" />
                {generatingQR ? "Abrindo..." : "QR Code"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDisconnect} disabled={deleting} className="text-destructive">
                <Unplug className="mr-2 h-4 w-4" />
                {deleting ? "Desconectando..." : "Desconectar"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenDetails}>
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {showRetryInitial ? (
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-3 sm:w-auto"
              onClick={onRetryInitialSync}
              disabled={retryInitialSyncing || !canManage}
            >
              {retryInitialSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Tentando…
                </>
              ) : (
                "Tentar novamente"
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-8 px-4 sm:w-auto"
            onClick={onOpenDetails}
            disabled={!canManage && busy}
          >
            <Eye className="mr-2 h-4 w-4" />
            Abrir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
