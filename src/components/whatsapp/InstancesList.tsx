import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
import { Loader2, Plus, MessageCircle } from "lucide-react";
import { chatService, ChatInstance, type BootstrapSyncMeta } from "@/services/chat";
import { toast } from "@/components/ui/sonner";
import QRCodePopup from "./QRCodePopup";
import { InstanceDetailsDialog } from "./InstanceDetailsDialog";
import { WhatsAppInstanceCard } from "./WhatsAppInstanceCard";
import { WhatsAppInstanceDetailsSheet } from "./WhatsAppInstanceDetailsSheet";
import { REALTIME_WINDOW_EVENTS } from "@/services/realtimeClient";
import { resetWhatsAppIntegrationCaches } from "@/lib/whatsappInstanceCacheReset";

interface InstancesListProps {
  onAddInstance: () => void;
  onInstanceCreated?: () => void;
  /** WI1: false quando quota do plano esgotada */
  canAddInstance?: boolean;
  limitLabel?: string | null;
}

export const InstancesList: React.FC<InstancesListProps> = ({
  onAddInstance,
  onInstanceCreated,
  canAddInstance = true,
  limitLabel = null,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [instances, setInstances] = useState<ChatInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<ChatInstance | null>(null);
  const [qrCodeInstanceId, setQrCodeInstanceId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [generatingQR, setGeneratingQR] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<ChatInstance | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [quickSyncingId, setQuickSyncingId] = useState<string | null>(null);
  const [retryInitialSyncingId, setRetryInitialSyncingId] = useState<string | null>(null);
  const [sheetInstanceId, setSheetInstanceId] = useState<string | null>(null);
  const [webhookStatusByInstance, setWebhookStatusByInstance] = useState<
    Record<
      string,
      {
        hasSecret: boolean;
        needsReconfiguration: boolean;
        lastSeenAt: string | null;
        callbackUrlMasked: string | null;
        synced: boolean | null;
        statusLabel:
          | "OK"
          | "Precisa reconfigurar"
          | "Secret ausente"
          | "Nunca recebeu webhook"
          | "Desync com provedor";
      }
    >
  >({});
  const [webhookStatusLoadingId, setWebhookStatusLoadingId] = useState<string | null>(null);
  const [webhookActionLoadingId, setWebhookActionLoadingId] = useState<string | null>(null);
  const [rotateSecretDialogOpen, setRotateSecretDialogOpen] = useState(false);
  const [instanceToRotateSecret, setInstanceToRotateSecret] = useState<ChatInstance | null>(null);

  const loadInstances = async () => {
    try {
      setLoading(true);
      const data = await chatService.listInstances();
      setInstances(data);
    } catch (error) {
      console.error("Erro ao carregar instâncias:", error);
      toast.error("Erro ao carregar conexões", {
        description: error instanceof Error ? error.message : "Ocorreu um erro",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstances();
  }, []);

  useEffect(() => {
    const onChannelStatusChanged = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      const channelId = typeof detail?.channel_id === "string" ? detail.channel_id : null;
      const status = typeof detail?.status === "string" ? detail.status : null;
      if (!channelId || !status) return;
      setInstances((prev) =>
        prev.map((inst) => (inst.id === channelId ? { ...inst, status } : inst))
      );
    };
    window.addEventListener(REALTIME_WINDOW_EVENTS.channelStatusChanged, onChannelStatusChanged);
    return () => {
      window.removeEventListener(REALTIME_WINDOW_EVENTS.channelStatusChanged, onChannelStatusChanged);
    };
  }, []);

  useEffect(() => {
    const needsBootstrapPoll = instances.some((inst) => {
      const bs = inst.metadata?.bootstrap_sync as BootstrapSyncMeta | undefined;
      return bs?.status === "queued" || bs?.status === "running";
    });
    if (!needsBootstrapPoll) return;
    const id = setInterval(() => {
      void loadInstances();
    }, 8000);
    return () => clearInterval(id);
  }, [instances]);

  useEffect(() => {
    const needsPolling = instances.filter(
      (inst) => inst.status === "connecting" || qrCodeInstanceId === inst.id
    );
    if (needsPolling.length === 0) return;

    const statusInterval = setInterval(async () => {
      try {
        const updates = await Promise.all(
          needsPolling.map(async (instance) => {
            try {
              const status = await chatService.getInstanceStatus(instance.id);
              const instanceData = status?.instance || status;
              const state = instanceData?.state || instanceData?.status || status?.status;
              const connected = status?.connected || instanceData?.connected;
              const loggedIn = status?.loggedIn || instanceData?.loggedIn;

              if (state === "open" || state === "connected" || connected === true || loggedIn === true) {
                return { id: instance.id, status: "connected" };
              }
            } catch {
              /* silenciar */
            }
            return null;
          })
        );

        const validUpdates = updates.filter((u) => u !== null);
        if (validUpdates.length > 0) {
          setInstances((prev) =>
            prev.map((inst) => {
              const update = validUpdates.find((u) => u?.id === inst.id);
              return update ? { ...inst, status: update.status } : inst;
            })
          );
          if (validUpdates.some((u) => u?.status === "connected")) {
            loadInstances();
          }
        }
      } catch {
        /* silenciar */
      }
    }, 15000);

    return () => clearInterval(statusInterval);
  }, [instances.length, qrCodeInstanceId]);

  const handleGenerateQRCode = async (instance: ChatInstance) => {
    setGeneratingQR(instance.id);
    try {
      const connectResponse = await chatService.connectInstance(instance.id);

      const instanceData = connectResponse?.instance || {};
      const qrData = instanceData?.qrcode || connectResponse?.qrcode || connectResponse?.code;
      const pairingCode = instanceData?.paircode || connectResponse?.paircode || connectResponse?.pairingCode;

      if (qrData) {
        const processedQR = qrData.startsWith("data:image") ? qrData : `data:image/png;base64,${qrData}`;

        setQrCodeData(processedQR);
        setQrCodeInstanceId(instance.id);
        toast.success("QR Code pronto!");
      } else if (pairingCode) {
        toast.info("Código de pareamento disponível", {
          description: `Use o código: ${pairingCode}`,
        });
      } else if (connectResponse?.connected || connectResponse?.loggedIn || instanceData?.status === "open") {
        toast.success("Já está conectado!");
        await loadInstances();
      } else {
        throw new Error("QR Code não disponível na resposta");
      }
    } catch (error: unknown) {
      console.error("Erro ao gerar QR code:", error);

      const errorMessage = error instanceof Error ? error.message : "";
      if (errorMessage.includes("409") || errorMessage.includes("Conflict") || errorMessage.includes("já está conectada")) {
        toast.error("Já conectado", {
          description: "Aguarde alguns segundos e tente novamente se precisar de um novo QR.",
          duration: 5000,
        });
        setTimeout(() => {
          loadInstances();
        }, 2000);
      } else {
        toast.error("Não foi possível abrir o QR", {
          description: errorMessage || "Tente novamente.",
        });
      }
    } finally {
      setGeneratingQR(null);
    }
  };

  const handleCheckStatus = async (instance: ChatInstance) => {
    setCheckingStatus(instance.id);
    try {
      const status = await chatService.getInstanceStatus(instance.id);
      const instanceData = status?.instance || status;
      const state = instanceData?.state || instanceData?.status || status?.status;
      const connected = status?.connected || instanceData?.connected;
      const loggedIn = status?.loggedIn || instanceData?.loggedIn;

      let newStatus = "disconnected";
      if (state === "open" || state === "connected" || connected === true || loggedIn === true) {
        newStatus = "connected";
      } else if (state === "connecting") {
        newStatus = "connecting";
      } else if (state) {
        newStatus = state;
      }

      setInstances((prev) =>
        prev.map((inst) => (inst.id === instance.id ? { ...inst, status: newStatus } : inst))
      );

      toast.success("Conexão atualizada");
      await loadInstances();
    } catch (error) {
      console.error("Erro ao verificar status:", error);
      toast.error("Erro ao atualizar", {
        description: error instanceof Error ? error.message : "Ocorreu um erro",
      });
    } finally {
      setCheckingStatus(null);
    }
  };

  const handleDeleteClick = (instance: ChatInstance) => {
    setInstanceToDelete(instance);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!instanceToDelete) return;

    setDeletingId(instanceToDelete.id);
    try {
      await chatService.deleteInstance(instanceToDelete.id);
      resetWhatsAppIntegrationCaches(queryClient);
      toast.success("Instância removida", {
        description: "Conversas e mensagens desta linha foram apagadas. Pode ligar uma nova instância.",
      });
      await loadInstances();
      onInstanceCreated?.();
      navigate("/settings?section=whatsapp&openAddConnection=1", { replace: true });
    } catch (error) {
      console.error("Erro ao remover:", error);
      toast.error("Não foi possível remover", {
        description: error instanceof Error ? error.message : "Ocorreu um erro",
      });
    } finally {
      setDeletingId(null);
      setDeleteDialogOpen(false);
      setInstanceToDelete(null);
    }
  };

  const openConversationsDialog = (instance: ChatInstance) => {
    setSelectedInstance(instance);
    setDetailsDialogOpen(true);
  };
  const openDetailsSheet = (instance: ChatInstance) => {
    setSheetInstanceId(instance.id);
    void loadWebhookStatus(instance.id);
  };
  const activeSheetInstance = instances.find((inst) => inst.id === sheetInstanceId) ?? null;

  const maskCallbackUrl = (url: string | null | undefined): string | null => {
    const raw = (url || "").trim();
    if (!raw) return null;
    try {
      const u = new URL(raw);
      const s = u.searchParams.get("secret");
      if (s && s.length > 4) {
        u.searchParams.set("secret", `********${s.slice(-4)}`);
      } else if (s) {
        u.searchParams.set("secret", "********");
      }
      // v2 path: /webhooks/uazapi/v2/:instanceId/:token
      u.pathname = u.pathname.replace(
        /(\/v2\/[0-9a-f-]{36}\/)([^/]+)/i,
        (_m, prefix: string, token: string) => {
          const decoded = (() => {
            try {
              return decodeURIComponent(token);
            } catch {
              return token;
            }
          })();
          if (decoded.length <= 4) return `${prefix}********`;
          return `${prefix}********${decoded.slice(-4)}`;
        },
      );
      return u.toString();
    } catch {
      return raw
        .replace(/([?&]secret=)([^&]+)/i, (_m, p1, p2) => `${p1}${"*".repeat(Math.max(8, p2.length - 4))}${p2.slice(-4)}`)
        .replace(/(\/v2\/[0-9a-f-]{36}\/)([^/?#]+)/i, (_m, prefix, token) => {
          const t = String(token);
          if (t.length <= 4) return `${prefix}********`;
          return `${prefix}********${t.slice(-4)}`;
        });
    }
  };

  const deriveWebhookStatusLabel = (input: {
    hasSecret: boolean;
    needsReconfiguration: boolean;
    lastSeenAt: string | null;
    synced: boolean | null;
  }):
    | "OK"
    | "Precisa reconfigurar"
    | "Secret ausente"
    | "Nunca recebeu webhook"
    | "Desync com provedor" => {
    if (!input.hasSecret) return "Secret ausente";
    if (input.synced === false) return "Desync com provedor";
    if (input.needsReconfiguration) return "Precisa reconfigurar";
    if (!input.lastSeenAt) return "Nunca recebeu webhook";
    return "OK";
  };

  const loadWebhookStatus = async (instanceId: string) => {
    setWebhookStatusLoadingId(instanceId);
    try {
      const data = await chatService.getInstanceWebhook(instanceId);
      const hasSecret = Boolean(data.webhookStatus?.has_secret);
      const needsReconfiguration = Boolean(data.webhookStatus?.needs_reconfiguration);
      const lastSeenAt = data.webhookStatus?.last_seen_at ?? null;
      const synced =
        typeof data.webhookStatus?.synced === "boolean"
          ? data.webhookStatus.synced
          : typeof data.synced === "boolean"
            ? data.synced
            : null;
      const callbackRaw =
        (typeof data.webhookStatus?.callback_url === "string"
          ? data.webhookStatus.callback_url
          : null) ||
        (typeof data.database?.url === "string" ? data.database.url : null) ||
        (typeof (data.database as Record<string, unknown> | null)?.["webhook_url"] === "string"
          ? String((data.database as Record<string, unknown>)["webhook_url"])
          : null);
      const callbackUrlMasked = maskCallbackUrl(callbackRaw);
      setWebhookStatusByInstance((prev) => ({
        ...prev,
        [instanceId]: {
          hasSecret,
          needsReconfiguration,
          lastSeenAt,
          callbackUrlMasked,
          synced,
          statusLabel: deriveWebhookStatusLabel({
            hasSecret,
            needsReconfiguration,
            lastSeenAt,
            synced,
          }),
        },
      }));
    } catch (error) {
      toast.error("Erro ao carregar status do webhook", {
        description: error instanceof Error ? error.message : "Tente novamente",
      });
    } finally {
      setWebhookStatusLoadingId(null);
    }
  };

  const handleWebhookRepair = async (instance: ChatInstance) => {
    setWebhookActionLoadingId(instance.id);
    try {
      await chatService.repairInstanceWebhook(instance.id);
      toast.success("Webhook reconfigurado com sucesso.");
      await loadWebhookStatus(instance.id);
      await loadInstances();
    } catch (error) {
      toast.error("Não foi possível reparar o webhook", {
        description: error instanceof Error ? error.message : "Tente novamente",
      });
    } finally {
      setWebhookActionLoadingId(null);
    }
  };

  const handleWebhookReconfigure = async (instance: ChatInstance) => {
    setWebhookActionLoadingId(instance.id);
    try {
      await chatService.reconfigureInstanceWebhook(instance.id);
      toast.success("Webhook reconfigurado com sucesso");
      await loadWebhookStatus(instance.id);
      await loadInstances();
    } catch (error) {
      toast.error("Falha ao reconfigurar webhook", {
        description: error instanceof Error ? error.message : "Tente novamente",
      });
    } finally {
      setWebhookActionLoadingId(null);
    }
  };

  const askRotateWebhookSecret = (instance: ChatInstance) => {
    setInstanceToRotateSecret(instance);
    setRotateSecretDialogOpen(true);
  };

  const confirmRotateWebhookSecret = async () => {
    const instance = instanceToRotateSecret;
    if (!instance) return;
    setWebhookActionLoadingId(instance.id);
    try {
      await chatService.rotateInstanceWebhookSecret(instance.id);
      toast.success("Secret rotacionado com sucesso");
      await loadWebhookStatus(instance.id);
      await loadInstances();
    } catch (error) {
      toast.error("Falha ao rotacionar secret", {
        description: error instanceof Error ? error.message : "Tente novamente",
      });
    } finally {
      setWebhookActionLoadingId(null);
      setRotateSecretDialogOpen(false);
      setInstanceToRotateSecret(null);
    }
  };

  const handleOpenChat = (instance: ChatInstance) => {
    navigate("/chat", { state: { focusInstanceId: instance.id } });
  };

  const handleQuickSync = async (instance: ChatInstance) => {
    setQuickSyncingId(instance.id);
    try {
      await chatService.syncConversations(instance.id, { limit: 200 });
      toast.success("Conversas sincronizadas", {
        description: "A lista no chat foi atualizada com as últimas conversas.",
      });
      await loadInstances();
    } catch (error) {
      console.error("Erro ao sincronizar conversas:", error);
      toast.error("Não foi possível sincronizar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setQuickSyncingId(null);
    }
  };

  const handleRetryInitialSync = async (instance: ChatInstance) => {
    setRetryInitialSyncingId(instance.id);
    try {
      const result = await chatService.retryInitialInstanceSync(instance.id);
      if (result?.skipped && result?.reason === "already_completed") {
        toast.success("Sincronização inicial já concluída");
      } else if (result?.skipped && result?.reason === "already_in_progress") {
        toast.info("Sincronização inicial já está em andamento");
      } else {
        toast.success("Sincronização inicial iniciada", {
          description: "Estamos sincronizando conversas em segundo plano.",
        });
      }
      await loadInstances();
    } catch (error) {
      toast.error("Não foi possível tentar novamente", {
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
      });
    } finally {
      setRetryInitialSyncingId(null);
    }
  };

  return (
    <>
      {loading ? (
        <div className="mx-auto flex min-h-[220px] w-full max-w-4xl items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : instances.length === 0 ? (
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/60 bg-gradient-to-b from-muted/30 to-card px-6 py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MessageCircle className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Nenhuma conexão ainda</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Adicione um número para o seu time atender pelo chat integrado.
            {limitLabel ? ` (${limitLabel})` : null}
          </p>
          <Button
            className="mt-6 h-12 px-8 text-base"
            onClick={onAddInstance}
            size="lg"
            disabled={!canAddInstance}
            title={!canAddInstance ? "Limite de conexões do plano atingido" : undefined}
          >
            <Plus className="mr-2 h-5 w-5" />
            Conectar WhatsApp
          </Button>
          {!canAddInstance ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Limite do plano atingido.{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => navigate("/meu-plano")}
              >
                Ir para Meu Plano
              </button>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {instances.map((instance) => (
            <WhatsAppInstanceCard
              key={instance.id}
              instance={instance}
              generatingQR={generatingQR === instance.id}
              checkingStatus={checkingStatus === instance.id}
              deleting={deletingId === instance.id}
              quickSyncing={quickSyncingId === instance.id}
              onOpenDetails={() => openDetailsSheet(instance)}
              onOpenChat={() => handleOpenChat(instance)}
              onQuickSync={() => handleQuickSync(instance)}
              onRefresh={() => handleCheckStatus(instance)}
              onOpenQR={() => handleGenerateQRCode(instance)}
              onDisconnect={() => handleDeleteClick(instance)}
              canOperateConversations={instance.can_operate !== false}
              onRetryInitialSync={() => handleRetryInitialSync(instance)}
              retryInitialSyncing={retryInitialSyncingId === instance.id}
            />
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta instância WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span className="block font-medium text-foreground">
                Ao remover esta instância, todas as conversas e mensagens ligadas a ela serão apagadas neste PainelCRM.
              </span>
              <span className="block">
                A ligação no servidor UazAPI será terminada e a instância removida quando possível. Ao voltar a
                conectar, tudo começa do zero (novo QR e novos dados).
              </span>
              <span className="block text-destructive">
                Esta ação não pode ser desfeita.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
              disabled={deletingId !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                  A remover…
                </>
              ) : (
                "Remover instância"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QRCodePopup
        isOpen={qrCodeInstanceId !== null}
        onClose={() => {
          setQrCodeInstanceId(null);
          setQrCodeData(null);
          loadInstances();
        }}
        connectionId={qrCodeInstanceId || ""}
        qrCode={qrCodeData}
        onConnect={async () => {
          setQrCodeInstanceId(null);
          setQrCodeData(null);
          await loadInstances();
        }}
      />

      <InstanceDetailsDialog
        instance={selectedInstance}
        isOpen={detailsDialogOpen}
        onClose={() => {
          setDetailsDialogOpen(false);
          setSelectedInstance(null);
        }}
        onInstanceUpdated={loadInstances}
      />

      <WhatsAppInstanceDetailsSheet
        instance={activeSheetInstance}
        open={sheetInstanceId !== null}
        onOpenChange={(open) => {
          if (!open) setSheetInstanceId(null);
        }}
        generatingQR={sheetInstanceId != null && generatingQR === sheetInstanceId}
        checkingStatus={sheetInstanceId != null && checkingStatus === sheetInstanceId}
        deleting={sheetInstanceId != null && deletingId === sheetInstanceId}
        quickSyncing={sheetInstanceId != null && quickSyncingId === sheetInstanceId}
        canOperateConversations={activeSheetInstance?.can_operate !== false}
        onOpenChat={() => (activeSheetInstance ? handleOpenChat(activeSheetInstance) : undefined)}
        onQuickSync={() => (activeSheetInstance ? handleQuickSync(activeSheetInstance) : undefined)}
        onRefresh={() => (activeSheetInstance ? handleCheckStatus(activeSheetInstance) : undefined)}
        onOpenQR={() => (activeSheetInstance ? handleGenerateQRCode(activeSheetInstance) : undefined)}
        onDisconnect={() => (activeSheetInstance ? handleDeleteClick(activeSheetInstance) : undefined)}
        onInstanceUpdated={loadInstances}
        webhookStatus={activeSheetInstance ? webhookStatusByInstance[activeSheetInstance.id] ?? null : null}
        webhookLoading={activeSheetInstance ? webhookStatusLoadingId === activeSheetInstance.id : false}
        webhookActionLoading={activeSheetInstance ? webhookActionLoadingId === activeSheetInstance.id : false}
        onWebhookRefresh={() => (activeSheetInstance ? void loadWebhookStatus(activeSheetInstance.id) : undefined)}
        onWebhookReconfigure={() =>
          activeSheetInstance ? void handleWebhookReconfigure(activeSheetInstance) : undefined
        }
        onWebhookRepair={() => (activeSheetInstance ? void handleWebhookRepair(activeSheetInstance) : undefined)}
        onWebhookRotateSecret={() =>
          activeSheetInstance ? askRotateWebhookSecret(activeSheetInstance) : undefined
        }
      />

      <AlertDialog open={rotateSecretDialogOpen} onOpenChange={setRotateSecretDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotacionar secret do webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação gera um novo secret e atualiza o callback na UazAPI para a conexão selecionada. A integração pode
              precisar de alguns segundos para propagar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRotateWebhookSecret}>Rotacionar secret</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
