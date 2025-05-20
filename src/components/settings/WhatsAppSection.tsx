
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import QRCodeScanner from "@/components/whatsapp/QRCodeScanner";
import ConnectionStatus from "@/components/whatsapp/ConnectionStatus";
import { supabase } from "@/integrations/supabase/client";

export const WhatsAppSection = () => {
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const { user, profile, updateProfile } = useAuth();
  
  // Check current connection status on component mount
  React.useEffect(() => {
    if (profile?.whatsapp_connected) {
      setConnectionStatus("connected");
    }
  }, [profile]);
  
  const handleConnect = async () => {
    setConnectionStatus("connecting");
    toast.info("Iniciando conexão", {
      description: "Por favor, aguarde enquanto geramos o QR code...",
    });
    
    // In a real implementation, this would call a backend API that uses Baileys
    // For now, we'll simulate the QR code generation
    setTimeout(() => {
      setQrCode("https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=WhatsAppConnectionSimulated");
      toast.info("QR Code gerado", {
        description: "Escaneie o QR code com o seu WhatsApp",
      });
    }, 2000);
  };
  
  const handleDisconnect = async () => {
    setConnectionStatus("disconnected");
    setQrCode(null);
    
    // Update user profile to indicate WhatsApp is disconnected
    if (user) {
      try {
        await updateProfile({ whatsapp_connected: false });
      } catch (error) {
        console.error("Error updating WhatsApp connection status:", error);
      }
    }
    
    toast.success("Desconectado", {
      description: "Conexão WhatsApp encerrada com sucesso",
    });
  };

  // Simulate successful connection after QR code is shown
  React.useEffect(() => {
    if (qrCode && connectionStatus === "connecting") {
      const timer = setTimeout(async () => {
        setConnectionStatus("connected");
        
        // Update user profile to indicate WhatsApp is connected
        if (user) {
          try {
            await updateProfile({ whatsapp_connected: true });
          } catch (error) {
            console.error("Error updating WhatsApp connection status:", error);
          }
        }
        
        toast.success("Conectado com sucesso!", {
          description: "Sua conta WhatsApp foi conectada",
        });
      }, 10000); // Simulate 10 second connection time
      
      return () => clearTimeout(timer);
    }
  }, [qrCode, connectionStatus, user, updateProfile]);

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
          
          <CardContent className="flex flex-col items-center justify-center min-h-[300px]">
            {connectionStatus === "disconnected" ? (
              <div className="flex flex-col items-center gap-4">
                <div className="h-24 w-24 text-muted-foreground flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/>
                  </svg>
                </div>
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
