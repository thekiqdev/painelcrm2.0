import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PhoneCall, QrCode, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import QRCodeScanner from "@/components/whatsapp/QRCodeScanner";
import ConnectionStatus from "@/components/whatsapp/ConnectionStatus";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { whatsappService } from "@/services/whatsapp";

interface ConnectionConfig {
  instanceName?: string;
  webhookUrl?: string;
}

const WhatsAppConnection = () => {
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [savedConnections, setSavedConnections] = useState<Array<{
    id: string;
    name: string;
    type: string;
    config: ConnectionConfig;
  }>>([]);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    const savedData = localStorage.getItem("whatsapp_connections");
    if (savedData) {
      try {
        setSavedConnections(JSON.parse(savedData));
      } catch (e) {
        console.error("Error loading saved connections:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (savedConnections.length > 0) {
      localStorage.setItem("whatsapp_connections", JSON.stringify(savedConnections));
    }
  }, [savedConnections]);
  
  const handleConnect = async () => {
    setConnectionStatus("connecting");
    toast({
      title: "Iniciando conexão",
      description: "Por favor, aguarde enquanto processamos sua solicitação...",
    });
    
    try {
      if (instanceName) {
        toast({
          title: "Criando instância",
          description: "Criando instância na Evolution API...",
        });
        
        const result = await whatsappService.connectEvolution(instanceName);
        
        if (result.status === "connected") {
          setConnectionStatus("connected");
          toast({
            title: "Conectado com sucesso!",
            description: "Sua conta WhatsApp foi conectada via Evolution API",
          });
        } else if (result.status === "disconnected") {
          // Instância criada mas não conectada, now generate QR code
          setConnectionStatus("disconnected");
          toast({
            title: "Instância criada!",
            description: "Agora clique em 'Gerar QR Code' para conectar",
          });
        }
      } else {
        throw new Error("Nome da instância é obrigatório");
      }
    } catch (error) {
      console.error("Erro ao conectar:", error);
      setConnectionStatus("disconnected");
      toast({
        title: "Erro na conexão",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao tentar conectar",
        variant: "destructive",
      });
    }
  };

  const handleGenerateQRCode = async () => {
    try {
      setConnectionStatus("connecting");
      toast({
        title: "Gerando QR Code",
        description: "Por favor, aguarde...",
      });
      
      const result = await whatsappService.getEvolutionQRCode(instanceName);
      
      if (result.qrcode?.base64) {
        setQrCode(result.qrcode.base64);
        toast({
          title: "QR Code gerado",
          description: "Escaneie o QR code com o seu WhatsApp",
        });
      } else {
        throw new Error("Falha ao gerar QR code");
      }
    } catch (error) {
      console.error("Erro ao gerar QR code:", error);
      setConnectionStatus("disconnected");
      toast({
        title: "Erro ao gerar QR code",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao gerar o QR code.",
        variant: "destructive",
      });
    }
  };
  
  const handleDisconnect = async () => {
    try {
      if (instanceName) {
        await whatsappService.disconnectEvolution(instanceName);
      }
      setConnectionStatus("disconnected");
      setQrCode(null);
      toast({
        title: "Desconectado",
        description: "Conexão WhatsApp encerrada com sucesso",
      });
    } catch (error) {
      console.error("Erro ao desconectar:", error);
      toast({
        title: "Erro ao desconectar",
        description: "Ocorreu um erro ao tentar desconectar o WhatsApp.",
        variant: "destructive",
      });
    }
  };

  const handleConfirmConnection = async () => {
    try {
      if (instanceName) {
        await whatsappService.confirmEvolutionConnection(instanceName);
      }
      setConnectionStatus("connected");
      setQrCode(null);
      toast({
        title: "Conectado com sucesso!",
        description: "Sua conta WhatsApp foi confirmada manualmente",
      });
    } catch (error) {
      console.error("Erro ao confirmar conexão:", error);
      toast({
        title: "Erro na confirmação",
        description: "Ocorreu um erro ao tentar confirmar a conexão WhatsApp.",
        variant: "destructive",
      });
    }
  };

  const handleSaveConnection = () => {
    const newConnection = {
      id: Date.now().toString(),
      name: instanceName || "Evolution API Connection",
      type: "evolution",
      config: {
        instanceName,
        webhookUrl
      }
    };
    
    const updatedConnections = [...savedConnections, newConnection];
    setSavedConnections(updatedConnections);
    
    toast({
      title: "Conexão salva",
      description: "As credenciais de conexão foram salvas",
    });
    
    clearConnectionForm();
  };
  
  const handleUpdateConnection = () => {
    if (!selectedConnection) return;
    
    const updatedConnections = savedConnections.map(conn => {
      if (conn.id === selectedConnection) {
        return {
          ...conn,
          name: instanceName || conn.name,
          config: {
            instanceName,
            webhookUrl
          }
        };
      }
      return conn;
    });
    
    setSavedConnections(updatedConnections);
    setSelectedConnection(null);
    setIsEditing(false);
    
    toast({
      title: "Conexão atualizada",
      description: "As credenciais de conexão foram atualizadas",
    });
    
    clearConnectionForm();
  };
  
  const handleDeleteConnection = (id: string) => {
    const updatedConnections = savedConnections.filter(conn => conn.id !== id);
    setSavedConnections(updatedConnections);
    
    toast({
      title: "Conexão removida",
      description: "A conexão foi removida com sucesso",
    });
    
    if (selectedConnection === id) {
      setSelectedConnection(null);
      clearConnectionForm();
    }
  };
  
  const handleEditConnection = (id: string) => {
    const connection = savedConnections.find(conn => conn.id === id);
    if (!connection) return;
    
    setInstanceName(connection.config.instanceName || "");
    setWebhookUrl(connection.config.webhookUrl || "");
    setSelectedConnection(id);
    setIsEditing(true);
  };
  
  const handleConnectSaved = (id: string) => {
    const connection = savedConnections.find(conn => conn.id === id);
    if (!connection) return;
    
    setInstanceName(connection.config.instanceName || "");
    setWebhookUrl(connection.config.webhookUrl || "");
    
    handleConnect();
  };

  const clearConnectionForm = () => {
    setInstanceName("");
    setWebhookUrl("");
    setIsEditing(false);
    setSelectedConnection(null);
  };

  useEffect(() => {
    if (qrCode && connectionStatus === "connecting") {
      const timer = setTimeout(async () => {
        try {
          if (instanceName) {
            const status = await whatsappService.checkEvolutionStatus(instanceName);
            if (status.instance.state === "open") {
              setConnectionStatus("connected");
              setQrCode(null);
              toast({
                title: "Conectado com sucesso!",
                description: "Sua conta WhatsApp foi conectada",
              });
            }
          }
        } catch (error) {
          console.error("Erro ao verificar status:", error);
        }
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [qrCode, connectionStatus, toast, instanceName]);

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Integração WhatsApp</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              <span>Conectar WhatsApp</span>
            </CardTitle>
            <CardDescription>
              Conecte sua conta WhatsApp usando a Evolution API
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="instanceName">Nome da Instância</Label>
                <Input 
                  id="instanceName" 
                  placeholder="Nome da sua instância Evolution" 
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">URL do Webhook (opcional)</Label>
                <Input 
                  id="webhookUrl" 
                  placeholder="URL para receber notificações da Evolution API" 
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
              </div>
              
              <Alert className="mt-2">
                <AlertDescription>
                  Para usar a Evolution API, configure primeiro as credenciais em Configurações {">"} WhatsApp {">"} Evolution API.
                </AlertDescription>
              </Alert>
              
              <div className="flex justify-center gap-2 mt-4">
                {connectionStatus === "disconnected" && !qrCode ? (
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleConnect}
                      disabled={!instanceName}
                    >
                      Criar Instância
                    </Button>
                    {instanceName && (
                      <Button 
                        onClick={handleGenerateQRCode}
                        disabled={!instanceName}
                        variant="outline"
                      >
                        Gerar QR Code
                      </Button>
                    )}
                  </div>
                ) : connectionStatus === "connecting" && qrCode ? (
                  <QRCodeScanner 
                    qrCode={qrCode} 
                    connectionStatus={connectionStatus} 
                    onDisconnect={handleDisconnect} 
                    onConfirmConnection={handleConfirmConnection} 
                  />
                ) : connectionStatus === "connected" ? (
                  <Button variant="destructive" onClick={handleDisconnect}>
                    Desconectar
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Status da Conexão</CardTitle>
            <CardDescription>
              Informações sobre a sua conexão atual com WhatsApp
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <ConnectionStatus status={connectionStatus} />
            
            {connectionStatus === "connected" && (
              <Alert className="mt-4">
                <AlertDescription>
                  Para manter sua sessão ativa, não desconecte o WhatsApp Web do seu dispositivo móvel.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
      
      {connectionStatus === "connected" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recursos Disponíveis</CardTitle>
            <CardDescription>
              Gerencie suas conversas e atendimentos via WhatsApp
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Tabs defaultValue="messages">
              <TabsList className="mb-4">
                <TabsTrigger value="messages">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Mensagens
                </TabsTrigger>
                <TabsTrigger value="calls">
                  <PhoneCall className="h-4 w-4 mr-2" />
                  Chamadas
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="messages">
                <div className="p-6 text-center border rounded-md">
                  <p className="text-muted-foreground">
                    As mensagens do WhatsApp aparecerão aqui após a conexão completa com a API.
                  </p>
                </div>
              </TabsContent>
              
              <TabsContent value="calls">
                <div className="p-6 text-center border rounded-md">
                  <p className="text-muted-foreground">
                    O histórico de chamadas aparecerá aqui quando a integração estiver completa.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WhatsAppConnection;
