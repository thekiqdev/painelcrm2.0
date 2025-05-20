
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { whatsappService } from "@/services/whatsapp";
import { Connection, ConnectionStatus, ConnectionType } from "@/components/settings/types";

export const useWhatsAppConnection = () => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConnection, setActiveConnection] = useState<Connection | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { user, profile, updateProfile } = useAuth();
  
  // Load saved connections from localStorage on component mount
  useEffect(() => {
    const savedConnectionsJson = localStorage.getItem('whatsapp_connections');
    if (savedConnectionsJson) {
      try {
        const savedConnections = JSON.parse(savedConnectionsJson);
        setConnections(savedConnections);
      } catch (error) {
        console.error('Error loading saved connections:', error);
      }
    }
  }, []);

  // Save connections to localStorage whenever they change
  useEffect(() => {
    if (connections.length > 0) {
      localStorage.setItem('whatsapp_connections', JSON.stringify(connections));
    }
  }, [connections]);
  
  // Check current connection status on component mount
  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        if (!user) return;
        
        // Check if profile has whatsapp_connected set to true
        if (profile?.whatsapp_connected) {
          setConnectionStatus("connected");
          
          // If we have a connected status but no active connection,
          // try to find the last used connection from saved connections
          if (!activeConnection && connections.length > 0) {
            const connectedConnection = connections.find(c => c.status === "connected");
            if (connectedConnection) {
              setActiveConnection(connectedConnection);
            } else {
              // If no connection is marked as connected, use the first one
              setActiveConnection(connections[0]);
            }
          }
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
          
          // Set active connection if available
          if (!activeConnection && connections.length > 0) {
            const connectedConnection = connections.find(c => c.status === "connected");
            if (connectedConnection) {
              setActiveConnection(connectedConnection);
            }
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
  }, [user, profile, updateProfile, activeConnection, connections]);
  
  const handleAddConnection = (connectionName: string, connectionType: string, configData?: any) => {
    const newConnection: Connection = {
      id: `conn_${Date.now()}`,
      name: connectionName,
      type: connectionType as ConnectionType,
      status: "disconnected" as ConnectionStatus,
      configData
    };
    
    // Add new connection to the list
    const updatedConnections = [...connections, newConnection];
    setConnections(updatedConnections);
    
    // Save to localStorage
    localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
    
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
        const { apiKey, instanceId, instanceName, webhookUrl } = connection.configData || {};
        
        if (!apiKey || !instanceId || !instanceName) {
          throw new Error("Configurações da Evolution API incompletas. Verifique API Key, ID e Nome da Instância.");
        }
        
        result = await whatsappService.connectEvolution(
          apiKey, 
          instanceId, 
          instanceName, 
          webhookUrl
        );
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
          c.id === connection.id ? { ...c, status: "connected" as ConnectionStatus } : c
        );
        setConnections(updatedConnections);
        
        // Save updated connections to localStorage
        localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
        
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
        description: error instanceof Error ? error.message : "Ocorreu um erro ao tentar conectar o WhatsApp." 
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
          c.id === activeConnection.id ? { ...c, status: "disconnected" as ConnectionStatus } : c
        );
        setConnections(updatedConnections);
        
        // Save updated connections to localStorage
        localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
        
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
          c.id === activeConnection.id ? { ...c, status: "connected" as ConnectionStatus } : c
        );
        setConnections(updatedConnections);
        
        // Save updated connections to localStorage
        localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
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
                c.id === activeConnection.id ? { ...c, status: "connected" as ConnectionStatus } : c
              );
              setConnections(updatedConnections);
              
              // Save updated connections to localStorage
              localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
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

  return {
    connections,
    activeConnection,
    connectionStatus,
    qrCode,
    isLoading,
    isDialogOpen,
    setIsDialogOpen,
    handleAddConnection,
    handleConnect,
    handleDisconnect,
    handleConfirmConnection
  };
};

export default useWhatsAppConnection;
