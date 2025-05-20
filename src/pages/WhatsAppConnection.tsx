
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PhoneCall, QrCode, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import QRCodeScanner from "@/components/whatsapp/QRCodeScanner";
import ConnectionStatus from "@/components/whatsapp/ConnectionStatus";

const WhatsAppConnection = () => {
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const { toast } = useToast();
  
  const handleConnect = async () => {
    setConnectionStatus("connecting");
    toast({
      title: "Iniciando conexão",
      description: "Por favor, aguarde enquanto geramos o QR code...",
    });
    
    // In a real implementation, this would call a backend API that uses Baileys
    // For now, we'll simulate the QR code generation
    setTimeout(() => {
      setQrCode("https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=WhatsAppConnectionSimulated");
      toast({
        title: "QR Code gerado",
        description: "Escaneie o QR code com o seu WhatsApp",
      });
    }, 2000);
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
          
          <CardContent className="flex flex-col items-center justify-center min-h-[300px]">
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
