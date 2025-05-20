
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import QRCodeScanner from "@/components/whatsapp/QRCodeScanner";
import ConnectionStatus from "@/components/whatsapp/ConnectionStatus";
import { whatsappService } from "@/services/whatsapp";

export const WhatsAppSection = () => {
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionMethod, setConnectionMethod] = useState<"qrcode" | "evolution" | "webjs">("qrcode");
  const { user, profile, updateProfile } = useAuth();
  
  // Check current connection status on component mount
  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        if (!user) return;
        
        // Check if profile has whatsapp_connected set to true
        if (profile?.whatsapp_connected) {
          setConnectionStatus("connected");
          return;
        }
        
        // Double check with the API
        const status = await whatsappService.getStatus();
        if (status.connected) {
          setConnectionStatus("connected");
          // Update local profile state if API says connected but profile doesn't reflect it
          if (!profile?.whatsapp_connected) {
            await updateProfile({ whatsapp_connected: true });
          }
        } else {
          setConnectionStatus("disconnected");
        }
      } catch (error) {
        console.error("Error checking connection status:", error);
        toast.error("Erro ao verificar status da conexão", { 
          description: "Não foi possível verificar o status da conexão WhatsApp." 
        });
      }
    };
    
    checkConnectionStatus();
  }, [user, profile, updateProfile]);
  
  const handleConnect = async () => {
    try {
      setIsLoading(true);
      setConnectionStatus("connecting");
      
      toast.info("Iniciando conexão", {
        description: "Por favor, aguarde enquanto processamos sua solicitação...",
      });
      
      let result;
      
      if (connectionMethod === "evolution") {
        // This would be implemented with actual API key integration
        result = await whatsappService.connectEvolution("demo-key");
      } else if (connectionMethod === "webjs") {
        result = await whatsappService.connectWebJS();
      } else {
        // Default QR code method
        result = await whatsappService.connect();
      }
      
      if (result.status === "connected") {
        setConnectionStatus("connected");
        setQrCode(null);
        await updateProfile({ whatsapp_connected: true });
        toast.success("Conectado com sucesso!", {
          description: "Sua conta WhatsApp foi conectada",
        });
      } else if (result.qrCode) {
        setQrCode(result.qrCode);
        toast.info("QR Code gerado", {
          description: "Escaneie o QR code com o seu WhatsApp",
        });
      } else {
        throw new Error("Falha ao gerar QR code");
      }
    } catch (error) {
      console.error("Error connecting WhatsApp:", error);
      toast.error("Erro na conexão", { 
        description: "Ocorreu um erro ao tentar conectar o WhatsApp." 
      });
      setConnectionStatus("disconnected");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDisconnect = async () => {
    try {
      setIsLoading(true);
      
      await whatsappService.disconnect();
      setConnectionStatus("disconnected");
      setQrCode(null);
      
      // Update user profile to indicate WhatsApp is disconnected
      if (user) {
        await updateProfile({ whatsapp_connected: false });
      }
      
      toast.success("Desconectado", {
        description: "Conexão WhatsApp encerrada com sucesso",
      });
    } catch (error) {
      console.error("Error disconnecting WhatsApp:", error);
      toast.error("Erro ao desconectar", {
        description: "Ocorreu um erro ao tentar desconectar o WhatsApp."
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmConnection = async () => {
    try {
      setIsLoading(true);
      toast.info("Confirmando conexão", {
        description: "Por favor, aguarde enquanto confirmamos sua conexão...",
      });
      
      await whatsappService.confirmConnection();
      setConnectionStatus("connected");
      setQrCode(null);
      await updateProfile({ whatsapp_connected: true });
      
      toast.success("Conectado com sucesso!", {
        description: "Sua conta WhatsApp foi confirmada manualmente",
      });
    } catch (error) {
      console.error("Error confirming WhatsApp connection:", error);
      toast.error("Erro na confirmação", { 
        description: "Ocorreu um erro ao tentar confirmar a conexão WhatsApp." 
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Poll for status changes when QR code is shown
  useEffect(() => {
    let intervalId: number;
    
    if (connectionStatus === "connecting" && qrCode) {
      intervalId = window.setInterval(async () => {
        try {
          const status = await whatsappService.getStatus();
          
          if (status.connected || status.status === "connected") {
            setConnectionStatus("connected");
            setQrCode(null);
            await updateProfile({ whatsapp_connected: true });
            toast.success("Conectado com sucesso!", {
              description: "Sua conta WhatsApp foi conectada",
            });
            clearInterval(intervalId);
          }
        } catch (error) {
          console.error("Error polling status:", error);
        }
      }, 5000); // Check every 5 seconds
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [connectionStatus, qrCode, updateProfile]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">WhatsApp</CardTitle>
            <CardDescription>
              Conecte sua conta WhatsApp para gerenciar mensagens e atendimentos
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {connectionStatus === "disconnected" ? (
              <div className="space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-24 w-24 text-muted-foreground flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/>
                    </svg>
                  </div>
                  <p className="text-center text-muted-foreground mb-4">
                    Clique no botão abaixo para gerar um QR code e conectar o seu WhatsApp
                  </p>
                </div>
                
                <Tabs defaultValue="qrcode" className="w-full" onValueChange={(value) => setConnectionMethod(value as any)}>
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="qrcode">Via QR Code</TabsTrigger>
                    <TabsTrigger value="webjs">Via WhatsApp Web.js</TabsTrigger>
                    <TabsTrigger value="evolution">Via Evolution API</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="qrcode" className="pt-4">
                    <p className="mb-4 text-sm text-center">
                      Conecte escaneando um QR code com seu celular
                    </p>
                  </TabsContent>
                  
                  <TabsContent value="webjs" className="pt-4">
                    <p className="mb-4 text-sm text-center">
                      Use a biblioteca WhatsApp Web.js para conectar
                    </p>
                  </TabsContent>
                  
                  <TabsContent value="evolution" className="pt-4">
                    <p className="mb-4 text-sm text-center">
                      Conecte usando a Evolution API (requer credenciais separadas)
                    </p>
                  </TabsContent>
                </Tabs>
                
                <div className="flex justify-center mt-4">
                  <Button onClick={handleConnect} disabled={isLoading} className="bg-[#1a202c] hover:bg-[#2d3748]">
                    {isLoading ? "Conectando..." : "Conectar WhatsApp"}
                  </Button>
                </div>
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
            
            {connectionStatus === "disconnected" && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                  WhatsApp não está conectado.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {connectionStatus === "connected" && (
        <Card>
          <CardHeader>
            <CardTitle>Configurações Avançadas</CardTitle>
            <CardDescription>
              Configurações adicionais para sua integração WhatsApp
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Tabs defaultValue="templates">
              <TabsList className="mb-4">
                <TabsTrigger value="templates">Templates</TabsTrigger>
                <TabsTrigger value="autoresponder">Respostas Automáticas</TabsTrigger>
                <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
              </TabsList>
              
              <TabsContent value="templates">
                <div className="p-6 text-center border rounded-md">
                  <p className="text-muted-foreground">
                    Configure templates de mensagens para enviar aos seus clientes.
                  </p>
                </div>
              </TabsContent>
              
              <TabsContent value="autoresponder">
                <div className="p-6 text-center border rounded-md">
                  <p className="text-muted-foreground">
                    Configure respostas automáticas para mensagens recebidas.
                  </p>
                </div>
              </TabsContent>
              
              <TabsContent value="webhooks">
                <div className="p-6 text-center border rounded-md">
                  <p className="text-muted-foreground">
                    Configure webhooks para receber notificações de novas mensagens.
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

export default WhatsAppSection;
