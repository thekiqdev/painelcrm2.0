import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PhoneCall, QrCode, MessageSquare, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import QRCodeScanner from "@/components/whatsapp/QRCodeScanner";
import ConnectionStatus from "@/components/whatsapp/ConnectionStatus";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { whatsappService } from "@/services/whatsapp";
import { chatService } from "@/services/chat";

interface ConnectionConfig {
  instanceName?: string;
  webhookUrl?: string;
}

const WhatsAppConnection = () => {
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [apiProvider, setApiProvider] = useState<"default" | "evolution" | "webjs">("default");
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
      if (apiProvider === "evolution" && instanceName) {
        toast({
          title: "Conectando via Evolution API",
          description: "Usando as credenciais fornecidas para conectar...",
        });
        
        // Usar o método correto: createEvolutionInstance em vez de connectEvolution
        const result = await chatService.createInstance({ name: instanceName });
        
        if (webhookUrl) {
          await chatService.configureWebhook(result.id, { url: webhookUrl });
        }
        
        if (result) {
          // Após criar instância, obter QR code
          const connectResponse = await chatService.connectInstance(result.id);
          // O backend retorna o payload da UazAPI, que pode ter qrcode.base64, code (base64) ou pairingCode
          const qrData = connectResponse?.qrcode?.base64 || connectResponse?.code || connectResponse?.qrcode;
          
          if (qrData) {
            setQrCode(typeof qrData === 'string' ? qrData : JSON.stringify(qrData));
            toast({
              title: "QR Code gerado",
              description: "Escaneie o QR code com o seu WhatsApp",
            });
            
            // Iniciar polling para verificar conexão
            startConnectionPolling(result.id);
          }
        }
      } else if (apiProvider === "webjs") {
        toast({
          title: "Conectando via WhatsApp Web.js",
          description: "Gerando QR code para conexão...",
        });
        
        const result = await whatsappService.connectWebJS();
        
        if (result.status === "connecting" && result.qrCode) {
          setQrCode(result.qrCode);
          toast({
            title: "QR Code gerado",
            description: "Escaneie o QR code com o seu WhatsApp",
          });
        } else if (result.status === "connected") {
          setConnectionStatus("connected");
          setQrCode(null);
          toast({
            title: "Conectado com sucesso!",
            description: "Sua conta WhatsApp foi conectada via WhatsApp Web.js",
          });
        }
      } else {
        const result = await whatsappService.connect({ provider: apiProvider });
        
        if (result.status === "connecting" && result.qrCode) {
          setQrCode(result.qrCode);
          toast({
            title: "QR Code gerado",
            description: "Escaneie o QR code com o seu WhatsApp",
          });
        } else if (result.status === "connected") {
          setConnectionStatus("connected");
          setQrCode(null);
          toast({
            title: "Conectado com sucesso!",
            description: "Sua conta WhatsApp foi conectada",
          });
        } else {
          throw new Error("Resposta inesperada do servidor");
        }
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
  
  const handleDisconnect = async () => {
    try {
      await whatsappService.disconnect();
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
      await whatsappService.confirmConnection();
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
      type: apiProvider,
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
    
    setApiProvider(connection.type as any);
    setInstanceName(connection.config.instanceName || "");
    setWebhookUrl(connection.config.webhookUrl || "");
    setSelectedConnection(id);
    setIsEditing(true);
  };
  
  const handleConnectSaved = (id: string) => {
    const connection = savedConnections.find(conn => conn.id === id);
    if (!connection) return;
    
    setApiProvider(connection.type as any);
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

  const startConnectionPolling = (instanceIdOrName: string) => {
    const pollInterval = setInterval(async () => {
      try {
        // Se for ID (UUID), é via chatService. Se for nome, é legacy
        const isUuid = /^[0-9a-fA-F-]{36}$/.test(instanceIdOrName);
        
        if (isUuid) {
          const response = await chatService.getInstanceStatus(instanceIdOrName);
          // O formato da resposta depende da UazAPI, geralmente { instance: { state: 'open' } }
          const state = response?.instance?.state || response?.status;
          
          if (state === 'open' || state === 'connected') {
            setConnectionStatus("connected");
            setQrCode(null);
            clearInterval(pollInterval);
            toast({ title: "Conectado com sucesso!", description: "Conectado via Evolution API" });
          }
        } else {
          const result = await whatsappService.checkEvolutionConnection(instanceIdOrName);
          if (result.success && result.status === "connected") {
            setConnectionStatus("connected");
            setQrCode(null);
            clearInterval(pollInterval);
            toast({ title: "Conectado com sucesso!", description: "Conectado via Evolution API" });
          }
        }
      } catch (error) {
        console.error("Erro ao verificar conexão:", error);
      }
    }, 5000);
    
    setTimeout(() => {
      clearInterval(pollInterval);
      if (connectionStatus === "connecting") {
        toast({ title: "Timeout na conexão", description: "QR Code expirou.", variant: "destructive" });
        setConnectionStatus("disconnected");
        setQrCode(null);
      }
    }, 300000);
  };

  useEffect(() => {
    if (qrCode && connectionStatus === "connecting") {
      const timer = setTimeout(async () => {
        try {
          const status = await whatsappService.getStatus();
          if (status.connected || status.status === "connected") {
            setConnectionStatus("connected");
            setQrCode(null);
            toast({
              title: "Conectado com sucesso!",
              description: "Sua conta WhatsApp foi conectada",
            });
          }
        } catch (error) {
          console.error("Erro ao verificar status:", error);
        }
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [qrCode, connectionStatus, toast]);

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
              Conecte sua conta WhatsApp para começar a gerenciar mensagens e atendimentos
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Tabs defaultValue="qrcode" className="mb-6">
              <TabsList className="mb-4">
                <TabsTrigger value="qrcode">Via QR Code</TabsTrigger>
                <TabsTrigger value="webjs">Via WhatsApp Web.js</TabsTrigger>
                <TabsTrigger value="evolution">Via Evolution API</TabsTrigger>
              </TabsList>
              
              <TabsContent value="qrcode">
                <div className="flex flex-col items-center justify-center min-h-[300px]">
                  {connectionStatus === "disconnected" ? (
                    <div className="flex flex-col items-center gap-4">
                      <QrCode className="h-24 w-24 text-muted-foreground" />
                      <p className="text-center text-muted-foreground mb-4">
                        Clique no botão abaixo para gerar um QR code e conectar o seu WhatsApp
                      </p>
                      <Button 
                        onClick={() => {
                          setApiProvider("default");
                          handleConnect();
                        }}
                      >
                        Conectar WhatsApp
                      </Button>
                    </div>
                  ) : (
                    <QRCodeScanner 
                      qrCode={qrCode} 
                      connectionStatus={connectionStatus} 
                      onDisconnect={handleDisconnect} 
                      onConfirmConnection={handleConfirmConnection} 
                    />
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="webjs">
                <div className="flex flex-col gap-4">
                  <div className="space-y-4">
                    <Alert className="mt-2">
                      <AlertDescription>
                        O WhatsApp Web.js é uma biblioteca cliente para WhatsApp Web que não requer uma API externa.
                      </AlertDescription>
                    </Alert>
                    
                    <div className="flex justify-center mt-4">
                      {connectionStatus === "disconnected" ? (
                        <Button 
                          onClick={() => {
                            setApiProvider("webjs");
                            handleConnect();
                          }}
                        >
                          Conectar via WhatsApp Web.js
                        </Button>
                      ) : connectionStatus === "connecting" ? (
                        <QRCodeScanner 
                          qrCode={qrCode} 
                          connectionStatus={connectionStatus} 
                          onDisconnect={handleDisconnect} 
                          onConfirmConnection={handleConfirmConnection} 
                        />
                      ) : (
                        <Button variant="destructive" onClick={handleDisconnect}>
                          Desconectar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="evolution">
                <div className="flex flex-col gap-4">
                  {savedConnections.filter(conn => conn.type === "evolution").length > 0 && (
                    <div className="space-y-4 mb-4">
                      <h3 className="font-medium text-lg">Conexões salvas</h3>
                      <div className="space-y-2">
                        {savedConnections
                          .filter(conn => conn.type === "evolution")
                          .map(conn => (
                            <div 
                              key={conn.id} 
                              className="border rounded-md p-4 cursor-pointer hover:bg-accent transition-colors"
                              onClick={() => handleEditConnection(conn.id)}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{conn.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {conn.config.instanceName ? `Instância: ${conn.config.instanceName}` : "Sem instância"}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditConnection(conn.id);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleConnectSaved(conn.id);
                                    }}
                                  >
                                    Conectar
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h3 className="font-medium text-lg">
                      {isEditing ? "Editar conexão" : "Nova conexão"}
                    </h3>
                    
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
                      {isEditing ? (
                        <>
                          <Button 
                            variant="outline"
                            onClick={clearConnectionForm}
                          >
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleUpdateConnection}
                            disabled={!instanceName}
                          >
                            Atualizar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button 
                            onClick={handleSaveConnection}
                            variant="outline"
                            disabled={!instanceName}
                          >
                            Salvar Credenciais
                          </Button>
                          <Button 
                            onClick={handleConnect}
                            disabled={!instanceName}
                          >
                            Conectar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
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
