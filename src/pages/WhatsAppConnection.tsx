
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

const WhatsAppConnection = () => {
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>("");
  const [instanceId, setInstanceId] = useState<string>("");
  const [apiProvider, setApiProvider] = useState<"default" | "evolution" | "webjs">("default");
  const { toast } = useToast();
  
  const handleConnect = async () => {
    setConnectionStatus("connecting");
    toast({
      title: "Iniciando conexão",
      description: "Por favor, aguarde enquanto processamos sua solicitação...",
    });
    
    try {
      if (apiProvider === "evolution" && apiKey) {
        toast({
          title: "Conectando via Evolution API",
          description: "Usando as credenciais fornecidas para conectar...",
        });
        
        const result = await whatsappService.connectEvolution(apiKey, instanceId);
        
        if (result.status === "connected") {
          setConnectionStatus("connected");
          toast({
            title: "Conectado com sucesso!",
            description: "Sua conta WhatsApp foi conectada via Evolution API",
          });
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
        // Conexão padrão via QR Code
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

  // Simulate successful connection after QR code is shown
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
      }, 10000); // Verifica a cada 10 segundos
      
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
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="apiKey">API Key da Evolution</Label>
                      <Input 
                        id="apiKey" 
                        placeholder="Insira sua chave API da Evolution" 
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="instanceId">ID da Instância</Label>
                      <Input 
                        id="instanceId" 
                        placeholder="ID da sua instância (se aplicável)" 
                        value={instanceId}
                        onChange={(e) => setInstanceId(e.target.value)}
                      />
                    </div>
                    
                    <Alert className="mt-2">
                      <AlertDescription>
                        Para obter suas credenciais da Evolution API, você precisa ter uma conta ativa no serviço.
                      </AlertDescription>
                    </Alert>
                    
                    <div className="flex justify-center mt-4">
                      {connectionStatus === "disconnected" ? (
                        <Button 
                          onClick={() => {
                            setApiProvider("evolution");
                            handleConnect();
                          }}
                          disabled={!apiKey}
                        >
                          Conectar via Evolution API
                        </Button>
                      ) : connectionStatus === "connecting" ? (
                        <Button disabled>
                          Conectando...
                        </Button>
                      ) : (
                        <Button variant="destructive" onClick={handleDisconnect}>
                          Desconectar
                        </Button>
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
