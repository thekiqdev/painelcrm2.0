import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

interface InstancesListProps {
  onAddInstance: () => void;
  onInstanceCreated?: () => void;
}

export const InstancesList: React.FC<InstancesListProps> = ({ onAddInstance, onInstanceCreated }) => {
  const navigate = useNavigate();
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
  const [sheetInstanceId, setSheetInstanceId] = useState<string | null>(null);

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
      toast.success("Conexão removida");
      await loadInstances();
      onInstanceCreated?.();
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
  };
  const activeSheetInstance = instances.find((inst) => inst.id === sheetInstanceId) ?? null;

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
          </p>
          <Button className="mt-6 h-12 px-8 text-base" onClick={onAddInstance} size="lg">
            <Plus className="mr-2 h-5 w-5" />
            Conectar WhatsApp
          </Button>
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
            />
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar este número?</AlertDialogTitle>
            <AlertDialogDescription>
              A conexão com &ldquo;{instanceToDelete?.name}&rdquo; será removida da plataforma. Esta ação não pode ser
              desfeita. Você poderá conectar de novo com um novo QR Code depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desconectar
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
      />
    </>
  );
};
