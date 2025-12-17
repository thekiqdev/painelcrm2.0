import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  QrCode, 
  RefreshCw, 
  Trash2, 
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Calendar,
  Hash
} from "lucide-react";
import { chatService, ChatInstance } from "@/services/chat";
import { toast } from "sonner";
import QRCodePopup from "./QRCodePopup";
import { InstanceDetailsDialog } from "./InstanceDetailsDialog";

interface InstancesListProps {
  onAddInstance: () => void;
  onInstanceCreated?: () => void;
}

export const InstancesList: React.FC<InstancesListProps> = ({ 
  onAddInstance,
  onInstanceCreated 
}) => {
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
  const instancesRef = useRef<ChatInstance[]>([]);

  const loadInstances = async () => {
    try {
      setLoading(true);
      const data = await chatService.listInstances();
      setInstances(data);
      instancesRef.current = data; // Atualizar ref
    } catch (error) {
      console.error("Erro ao carregar instâncias:", error);
      toast.error("Erro ao carregar instâncias", {
        description: error instanceof Error ? error.message : "Ocorreu um erro"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstances();
  }, []);

  // Polling otimizado - apenas para instâncias que realmente precisam (conectando ou com QR code aberto)
  useEffect(() => {
    const needsPolling = instances.filter(inst => 
      inst.status === 'connecting' || qrCodeInstanceId === inst.id
    );
    
    if (needsPolling.length === 0) return;
    
    // Intervalo maior para reduzir requisições
    const statusInterval = setInterval(async () => {
      try {
        // Atualizar apenas instâncias que precisam
        const updates = await Promise.all(
          needsPolling.map(async (instance) => {
          try {
            const status = await chatService.getInstanceStatus(instance.id);
            const instanceData = status?.instance || status;
            const state = instanceData?.state || instanceData?.status || status?.status;
            const connected = status?.connected || instanceData?.connected;
            const loggedIn = status?.loggedIn || instanceData?.loggedIn;
            
            if (state === 'open' || state === 'connected' || connected === true || loggedIn === true) {
                return { id: instance.id, status: 'connected' };
              }
          } catch (error) {
              // Silenciar erros
            }
            return null;
        })
      );
      
        // Aplicar atualizações apenas se houver mudanças
        const validUpdates = updates.filter(u => u !== null);
        if (validUpdates.length > 0) {
          setInstances(prev => prev.map(inst => {
            const update = validUpdates.find(u => u?.id === inst.id);
            return update ? { ...inst, status: update.status } : inst;
          }));
          // Recarregar se alguma instância conectou
          if (validUpdates.some(u => u?.status === 'connected')) {
            loadInstances();
          }
        }
      } catch (error) {
        // Silenciar erros no polling
      }
    }, 15000); // A cada 15 segundos (reduzido de 10s)
    
    return () => clearInterval(statusInterval);
  }, [instances.length, qrCodeInstanceId]); // Incluir qrCodeInstanceId nas dependências

  const handleGenerateQRCode = async (instance: ChatInstance) => {
    setGeneratingQR(instance.id);
    try {
      const connectResponse = await chatService.connectInstance(instance.id);
      
      const instanceData = connectResponse?.instance || {};
      const qrData = instanceData?.qrcode || connectResponse?.qrcode || connectResponse?.code;
      const pairingCode = instanceData?.paircode || connectResponse?.paircode || connectResponse?.pairingCode;
      
      if (qrData) {
        const processedQR = qrData.startsWith('data:image') 
          ? qrData 
          : `data:image/png;base64,${qrData}`;
        
        setQrCodeData(processedQR);
        setQrCodeInstanceId(instance.id);
        toast.success("QR Code gerado com sucesso!");
      } else if (pairingCode) {
        toast.info("Código de pareamento disponível", {
          description: `Use o código: ${pairingCode}`
        });
      } else if (connectResponse?.connected || connectResponse?.loggedIn || instanceData?.status === 'open') {
        toast.success("Instância já está conectada!");
        await loadInstances();
      } else {
        throw new Error("QR Code não disponível na resposta");
      }
    } catch (error: any) {
      console.error("Erro ao gerar QR code:", error);
      
      // Tratar erro 409 de forma mais clara
      const errorMessage = error?.message || '';
      if (errorMessage.includes('409') || errorMessage.includes('Conflict') || errorMessage.includes('já está conectada')) {
        toast.error("Instância já conectada", {
          description: "A instância já está conectada. O sistema tentará desconectar automaticamente. Aguarde alguns segundos e tente novamente.",
          duration: 5000,
        });
        // Recarregar instâncias após 2 segundos para verificar se desconectou
        setTimeout(() => {
          loadInstances();
        }, 2000);
      } else {
      toast.error("Erro ao gerar QR Code", {
          description: errorMessage || "Ocorreu um erro. Tente novamente.",
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
      
      // Determinar status final
      let newStatus = 'disconnected';
      if (state === 'open' || state === 'connected' || connected === true || loggedIn === true) {
        newStatus = 'connected';
      } else if (state === 'connecting') {
        newStatus = 'connecting';
      } else if (state) {
        newStatus = state;
      }
      
      // Atualizar status na lista
      setInstances(prev => prev.map(inst => 
        inst.id === instance.id 
          ? { ...inst, status: newStatus }
          : inst
      ));
      
      toast.success("Status atualizado", {
        description: `Status: ${newStatus === 'connected' ? 'Conectado' : newStatus === 'connecting' ? 'Conectando' : 'Desconectado'}`
      });
    } catch (error) {
      console.error("Erro ao verificar status:", error);
      toast.error("Erro ao verificar status", {
        description: error instanceof Error ? error.message : "Ocorreu um erro"
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
      toast.success("Instância deletada com sucesso!");
      await loadInstances();
    } catch (error) {
      console.error("Erro ao deletar instância:", error);
      toast.error("Erro ao deletar instância", {
        description: error instanceof Error ? error.message : "Ocorreu um erro"
      });
    } finally {
      setDeletingId(null);
      setDeleteDialogOpen(false);
      setInstanceToDelete(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'connected' || statusLower === 'open') {
      return <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white border-0 text-xs font-medium px-2 py-0.5">Conectado</Badge>;
    } else if (statusLower === 'connecting') {
      return <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-white border-0 text-xs font-medium px-2 py-0.5">Conectando</Badge>;
    } else {
      return <Badge variant="secondary" className="text-xs font-medium px-2 py-0.5">Desconectado</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'connected' || statusLower === 'open') {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    } else if (statusLower === 'connecting') {
      return <Clock className="h-4 w-4 text-yellow-500" />;
    } else {
      return <XCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Instâncias WhatsApp</CardTitle>
              <CardDescription>
                Gerencie suas instâncias do WhatsApp conectadas via UazAPI
              </CardDescription>
            </div>
            <Button onClick={onAddInstance} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nova Instância
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                Nenhuma instância criada ainda.
              </p>
              <Button onClick={onAddInstance} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeira Instância
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {instances.map((instance) => (
                <Card 
                  key={instance.id} 
                  className="relative hover:shadow-lg transition-all duration-200 border-border/50 cursor-pointer"
                  onClick={() => {
                    setSelectedInstance(instance);
                    setDetailsDialogOpen(true);
                  }}
                >
                  <CardHeader className="pb-3 space-y-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base font-semibold truncate mb-1">
                          {instance.name}
                        </CardTitle>
                        {instance.external_instance_name && (
                          <CardDescription className="text-xs truncate">
                            {instance.external_instance_name}
                          </CardDescription>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {getStatusIcon(instance.status)}
                      </div>
                    </div>
                    <div className="flex items-center">
                      {getStatusBadge(instance.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-0">
                    <div className="flex flex-col gap-2.5 text-xs text-muted-foreground mb-4">
                      {instance.created_at && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                          <span className="truncate">
                            {new Date(instance.created_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Hash className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                        <span className="font-mono text-xs truncate opacity-80">
                          {instance.id.substring(0, 8)}...
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1 h-9 text-xs font-medium"
                        onClick={() => handleGenerateQRCode(instance)}
                        disabled={generatingQR === instance.id}
                      >
                        {generatingQR === instance.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Gerando...
                          </>
                        ) : (
                          <>
                            <QrCode className="h-3.5 w-3.5 mr-1.5" />
                            QR Code
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 p-0 hover:bg-accent"
                        onClick={() => handleCheckStatus(instance)}
                        disabled={checkingStatus === instance.id}
                        title="Atualizar status"
                      >
                        {checkingStatus === instance.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 p-0 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                        onClick={() => handleDeleteClick(instance)}
                        disabled={deletingId === instance.id}
                        title="Deletar instância"
                      >
                        {deletingId === instance.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar Instância</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar a instância "{instanceToDelete?.name}"?
              Esta ação não pode ser desfeita e a instância será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QRCodePopup
        isOpen={qrCodeInstanceId !== null}
        onClose={() => {
          setQrCodeInstanceId(null);
          setQrCodeData(null);
          loadInstances(); // Recarregar após fechar
        }}
        connectionId={qrCodeInstanceId || ''}
        qrCode={qrCodeData}
        onConnect={async () => {
          setQrCodeInstanceId(null);
          setQrCodeData(null);
          // Recarregar instâncias para atualizar status
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
    </>
  );
};

