
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

const WhatsAppConnection = () => {
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>("");
  const [instanceId, setInstanceId] = useState<string>("");
  const [apiProvider, setApiProvider] = useState<"default" | "evolution">("default");
  const { toast } = useToast();
  
  const handleConnect = async () => {
    setConnectionStatus("connecting");
    toast({
      title: "Iniciando conexão",
      description: "Por favor, aguarde enquanto geramos o QR code...",
    });
    
    if (apiProvider === "evolution" && apiKey) {
      // Simulação da conexão com a Evolution API
      toast({
        title: "Conectando via Evolution API",
        description: "Usando as credenciais fornecidas para conectar...",
      });
      
      // Em uma implementação real, chamaríamos a Evolution API aqui
      setTimeout(() => {
        setConnectionStatus("connected");
        toast({
          title: "Conectado com sucesso!",
          description: "Sua conta WhatsApp foi conectada via Evolution API",
        });
      }, 2000);
    } else {
      // Modo de simulação para demonstração
      setTimeout(() => {
        // Base64 de um QR code de exemplo
        const sampleQRCode = "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";
        setQrCode(sampleQRCode);
        toast({
          title: "QR Code gerado",
          description: "Escaneie o QR code com o seu WhatsApp",
        });
      }, 2000);
    }
  };
  
  const handleDisconnect = () => {
    setConnectionStatus("disconnected");
    setQrCode(null);
    toast({
      title: "Desconectado",
      description: "Conexão WhatsApp encerrada com sucesso",
    });
  };

  const handleConfirmConnection = () => {
    setConnectionStatus("connected");
    setQrCode(null);
    toast({
      title: "Conectado com sucesso!",
      description: "Sua conta WhatsApp foi conectada manualmente",
    });
  };

  // Simulate successful connection after QR code is shown
  useEffect(() => {
    if (qrCode && connectionStatus === "connecting") {
      const timer = setTimeout(() => {
        setConnectionStatus("connected");
        toast({
          title: "Conectado com sucesso!",
          description: "Sua conta WhatsApp foi conectada",
        });
      }, 10000); // Simulate 10 second connection time
      
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
                      <Button onClick={handleConnect}>
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
