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
import AddConnectionDialog from "@/components/whatsapp/AddConnectionDialog";
import { Plus, QrCode } from "lucide-react";
import { Connection, ConnectionStatus as ConnectionStatusType, ConnectionType } from "./types";

export const WhatsAppSection = () => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConnection, setActiveConnection] = useState<Connection | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [connectionMethod, setConnectionMethod] = useState<ConnectionType>("qrcode");
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
  
  const handleAddConnection = (connectionName: string, connectionType: string, configData?: any) => {
    const newConnection: Connection = {
      id: `conn_${Date.now()}`,
      name: connectionName,
      type: connectionType as ConnectionType,
      status: "disconnected",
      configData
    };
    
    setConnections([...connections, newConnection]);
    setIsDialogOpen(false);
    toast.success("Conexão adicionada", { 
      description: `A conexão "${connectionName}" foi adicionada com sucesso.` 
    });
  };
  
  const handleConnect = async (connection: Connection) => {
    try {
      setActiveConnection(connection);
      setIsLoading(true);
      setConnectionStatus("connecting");
      
      toast.info("Iniciando conexão", {
        description: "Por favor, aguarde enquanto processamos sua solicitação...",
      });
      
      let result;
      
      if (connection.type === "evolution") {
        const { apiKey, instanceId } = connection.configData || {};
        result = await whatsappService.connectEvolution(apiKey || "demo-key", instanceId);
      } else if (connection.type === "webjs") {
        result = await whatsappService.connectWebJS();
      } else {
        // Default QR code method
        result = await whatsappService.connect();
      }
      
      if (result.status === "connected") {
        setConnectionStatus("connected");
        setQrCode(null);
        await updateProfile({ whatsapp_connected: true });
        
        // Update connection status in the list
        const updatedConnections = connections.map(c => 
          c.id === connection.id ? { ...c, status: "connected" } : c
        );
        setConnections(updatedConnections);
        
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
      
      // Update connection status in the list if there's an active connection
      if (activeConnection) {
        const updatedConnections = connections.map(c => 
          c.id === activeConnection.id ? { ...c, status: "disconnected" } : c
        );
        setConnections(updatedConnections);
        setActiveConnection(null);
      }
      
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
      
      // Update connection status in the list if there's an active connection
      if (activeConnection) {
        const updatedConnections = connections.map(c => 
          c.id === activeConnection.id ? { ...c, status: "connected" } : c
        );
        setConnections(updatedConnections);
      }
      
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
            
            // Update connection status in the list if there's an active connection
            if (activeConnection) {
              const updatedConnections = connections.map(c => 
                c.id === activeConnection.id ? { ...c, status: "connected" } : c
              );
              setConnections(updatedConnections);
            }
            
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
  }, [connectionStatus, qrCode, activeConnection, connections, updateProfile]);

  const renderConnectionsList = () => {
    if (connections.length === 0) {
      return (
        <div className="text-center p-6 border rounded-md">
          <p className="text-muted-foreground mb-4">
            Você ainda não tem conexões WhatsApp configuradas.
          </p>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Conexão
          </Button>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        {connections.map((connection) => (
          <Card key={connection.id} className="overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div>
                <h3 className="font-medium">{connection.name}</h3>
                <p className="text-sm text-muted-foreground">
                  Tipo: {connection.type === "qrcode" ? "QR Code" : connection.type === "evolution" ? "Evolution API" : "WhatsApp Web.js"}
                </p>
              </div>
              
              <div>
                {connection.status === "disconnected" ? (
                  <Button 
                    size="sm" 
                    onClick={() => handleConnect(connection)}
                    disabled={isLoading}
                  >
                    Conectar
                  </Button>
                ) : connection.status === "connecting" ? (
                  <Button size="sm" disabled>Conectando...</Button>
                ) : (
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    onClick={handleDisconnect}
                    disabled={isLoading}
                  >
                    Desconectar
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        
        <div className="flex justify-center mt-4">
          <Button onClick={() => setIsDialogOpen(true)} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Outra Conexão
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl">WhatsApp</CardTitle>
              <CardDescription>
                Conecte sua conta WhatsApp para gerenciar mensagens e atendimentos
              </CardDescription>
            </div>
            
            {connections.length === 0 && (
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Conexão
              </Button>
            )}
          </CardHeader>
          
          <CardContent>
            {activeConnection && qrCode ? (
              <QRCodeScanner 
                qrCode={qrCode} 
                connectionStatus={connectionStatus} 
                onDisconnect={handleDisconnect}
                onConfirmConnection={handleConfirmConnection}
              />
            ) : (
              renderConnectionsList()
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
            
            {connectionStatus === "disconnected" && !activeConnection && (
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
      
      <AddConnectionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onAddConnection={handleAddConnection}
      />
    </div>
  );
};

export default WhatsAppSection;
