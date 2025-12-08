import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  QrCode,
  RefreshCw,
  Calendar,
  Hash,
  Phone,
  MessageSquare,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { chatService, ChatInstance, ChatConversation } from "@/services/chat";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import QRCodePopup from "./QRCodePopup";

interface InstanceDetailsDialogProps {
  instance: ChatInstance | null;
  isOpen: boolean;
  onClose: () => void;
  onInstanceUpdated?: () => void;
}

export const InstanceDetailsDialog: React.FC<InstanceDetailsDialogProps> = ({
  instance,
  isOpen,
  onClose,
  onInstanceUpdated,
}) => {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrCodeOpen, setQrCodeOpen] = useState(false);
  const [period, setPeriod] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  useEffect(() => {
    if (isOpen && instance) {
      loadConversations();
    } else {
      setConversations([]);
      setPeriod("all");
      setStartDate("");
      setEndDate("");
    }
  }, [isOpen, instance]);

  const loadConversations = async () => {
    if (!instance) return;

    try {
      setLoadingConversations(true);
      
      let filters: { instanceId: string; startDate?: string; endDate?: string } = {
        instanceId: instance.id,
      };

      // Aplicar filtro de período
      if (period === "today") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        filters.startDate = today.toISOString();
        filters.endDate = new Date().toISOString();
      } else if (period === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);
        filters.startDate = weekAgo.toISOString();
        filters.endDate = new Date().toISOString();
      } else if (period === "month") {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        monthAgo.setHours(0, 0, 0, 0);
        filters.startDate = monthAgo.toISOString();
        filters.endDate = new Date().toISOString();
      } else if (period === "custom" && startDate && endDate) {
        filters.startDate = new Date(startDate).toISOString();
        filters.endDate = new Date(endDate).toISOString();
      }

      const data = await chatService.getConversations(filters);
      setConversations(data || []);
    } catch (error) {
      console.error("Erro ao carregar conversas:", error);
      toast.error("Erro ao carregar conversas", {
        description: error instanceof Error ? error.message : "Ocorreu um erro",
      });
    } finally {
      setLoadingConversations(false);
    }
  };

  const handleGenerateQRCode = async () => {
    if (!instance) return;

    setGeneratingQR(true);
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
        setQrCodeOpen(true);
        toast.success("QR Code gerado com sucesso!");
      } else if (pairingCode) {
        toast.info("Código de pareamento disponível", {
          description: `Use o código: ${pairingCode}`
        });
      } else if (connectResponse?.connected || connectResponse?.loggedIn || instanceData?.status === 'open') {
        toast.success("Instância já está conectada!");
        onInstanceUpdated?.();
      } else {
        throw new Error("QR Code não disponível na resposta");
      }
    } catch (error) {
      console.error("Erro ao gerar QR code:", error);
      toast.error("Erro ao gerar QR Code", {
        description: error instanceof Error ? error.message : "Ocorreu um erro"
      });
    } finally {
      setGeneratingQR(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'connected' || statusLower === 'open') {
      return <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white border-0">Conectado</Badge>;
    } else if (statusLower === 'connecting') {
      return <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-white border-0">Conectando</Badge>;
    } else {
      return <Badge variant="secondary">Desconectado</Badge>;
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

  // Extrair número do telefone do metadata ou external_instance_name
  const getPhoneNumber = () => {
    if (!instance) return null;
    
    // Tentar extrair do external_instance_name (formato: nome_numero)
    if (instance.external_instance_name) {
      const match = instance.external_instance_name.match(/(\d+)$/);
      if (match) {
        return match[1];
      }
    }
    
    // Tentar extrair do metadata
    if (instance.metadata && typeof instance.metadata === 'object') {
      const metadata = instance.metadata as any;
      return metadata.phone || metadata.phoneNumber || metadata.number || null;
    }
    
    return null;
  };

  if (!instance) return null;

  const phoneNumber = getPhoneNumber();

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getStatusIcon(instance.status)}
              Detalhes da Instância
            </DialogTitle>
            <DialogDescription>
              Informações detalhadas e gerenciamento da instância WhatsApp
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Informações da Instância */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informações Gerais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nome da Instância</Label>
                    <p className="text-sm font-medium">{instance.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <div className="mt-1">
                      {getStatusBadge(instance.status)}
                    </div>
                  </div>
                  {instance.external_instance_name && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Nome Externo</Label>
                      <p className="text-sm font-medium">{instance.external_instance_name}</p>
                    </div>
                  )}
                  {phoneNumber && (
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        Número Conectado
                      </Label>
                      <p className="text-sm font-medium">{phoneNumber}</p>
                    </div>
                  )}
                  {instance.created_at && (
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Data de Criação
                      </Label>
                      <p className="text-sm font-medium">
                        {format(new Date(instance.created_at), "dd 'de' MMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      ID da Instância
                    </Label>
                    <p className="text-sm font-mono text-xs">{instance.id}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ações */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ações</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleGenerateQRCode}
                  disabled={generatingQR}
                  className="w-full"
                >
                  {generatingQR ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando QR Code...
                    </>
                  ) : (
                    <>
                      <QrCode className="h-4 w-4 mr-2" />
                      Gerar QR Code para Conectar
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Conversas */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Conversas do WhatsApp
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadConversations}
                    disabled={loadingConversations}
                  >
                    {loadingConversations ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filtros de Período */}
                <div className="space-y-3">
                  <Label>Filtrar por Período</Label>
                  <Select value={period} onValueChange={(value: any) => setPeriod(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as conversas</SelectItem>
                      <SelectItem value="today">Hoje</SelectItem>
                      <SelectItem value="week">Últimos 7 dias</SelectItem>
                      <SelectItem value="month">Últimos 30 dias</SelectItem>
                      <SelectItem value="custom">Período personalizado</SelectItem>
                    </SelectContent>
                  </Select>

                  {period === "custom" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Data Inicial</Label>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Data Final</Label>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={loadConversations}
                    disabled={loadingConversations || (period === "custom" && (!startDate || !endDate))}
                    size="sm"
                    className="w-full"
                  >
                    {loadingConversations ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Carregando...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Buscar Conversas
                      </>
                    )}
                  </Button>
                </div>

                {/* Lista de Conversas */}
                {loadingConversations ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhuma conversa encontrada para este período
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {conversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className="p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {conversation.contactName || conversation.profileName || conversation.phoneNumber || "Sem nome"}
                            </p>
                            {conversation.phoneNumber && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {conversation.phoneNumber}
                              </p>
                            )}
                            {conversation.lastMessagePreview && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">
                                {conversation.lastMessagePreview}
                              </p>
                            )}
                            {conversation.lastMessageAt && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(new Date(conversation.lastMessageAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </p>
                            )}
                          </div>
                          {conversation.unreadCount > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {conversation.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <QRCodePopup
        isOpen={qrCodeOpen}
        onClose={() => {
          setQrCodeOpen(false);
          setQrCodeData(null);
          onInstanceUpdated?.();
        }}
        connectionId={instance.id}
        qrCode={qrCodeData}
        onConnect={async () => {
          setQrCodeOpen(false);
          setQrCodeData(null);
          onInstanceUpdated?.();
        }}
      />
    </>
  );
};

