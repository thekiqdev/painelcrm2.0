
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { whatsappService } from "@/services/whatsapp";
import { ConnectionType } from "@/components/settings/types";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  status: ConnectionStatus;
  configData?: {
    instanceName?: string;
  };
}

export const useWhatsAppConnection = () => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConnection, setActiveConnection] = useState<Connection | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { user, profile, updateProfile } = useAuth();
  
  // Load saved connections from localStorage on component mount
  useEffect(() => {
    const loadSavedConnections = () => {
      const savedConnectionsJson = localStorage.getItem('whatsapp_connections');
      if (savedConnectionsJson) {
        try {
          const savedConnections = JSON.parse(savedConnectionsJson);
          console.log("Loaded connections from localStorage:", savedConnections);
          setConnections(savedConnections);
        } catch (error) {
          console.error('Error loading saved connections:', error);
        }
      }
    };
    
    loadSavedConnections();
  }, []);

  // Save connections to localStorage whenever they change
  useEffect(() => {
    if (connections.length > 0) {
      console.log("Saving connections to localStorage:", connections);
      localStorage.setItem('whatsapp_connections', JSON.stringify(connections));
    }
  }, [connections]);
  
  // Check current connection status on component mount
  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        if (!user) return;
        
        if (profile?.whatsapp_connected) {
          setConnectionStatus("connected");
          
          if (!activeConnection && connections.length > 0) {
            const connectedConnection = connections.find(c => c.status === "connected");
            if (connectedConnection) {
              setActiveConnection(connectedConnection);
            } else {
              setActiveConnection(connections[0]);
            }
          }
          return;
        }
        
        setConnectionStatus("disconnected");
      } catch (error) {
        console.error("Error checking connection status:", error);
        toast.error("Erro ao verificar status da conexão", { 
          description: "Não foi possível verificar o status da conexão WhatsApp." 
        });
      }
    };
    
    checkConnectionStatus();
  }, [user, profile, updateProfile, activeConnection, connections]);
  
  const handleConnect = async (connection: Connection) => {
    try {
      setActiveConnection(connection);
      setIsLoading(true);
      
      toast.info("Criando instância", {
        description: "Por favor, aguarde enquanto criamos sua instância...",
      });
      
      const { instanceName } = connection.configData || {};
      
      if (!instanceName) {
        throw new Error("Nome da instância não fornecido");
      }
      
      // Primeiro, criar/verificar a instância
      const result = await whatsappService.connectEvolution(instanceName);
      
      if (result.status === "connected") {
        setConnectionStatus("connected");
        setQrCode(null);
        await updateProfile({ whatsapp_connected: true });
        
        const updatedConnections = [...connections.filter(c => c.id !== connection.id), { 
          ...connection, 
          status: "connected" as ConnectionStatus 
        }];
        
        setConnections(updatedConnections);
        localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
        
        toast.success("Conectado com sucesso!", {
          description: "Sua conta WhatsApp foi conectada",
        });
      } else {
        // Instância criada mas não conectada ainda
        setConnectionStatus("disconnected");
        
        // Adicionar conexão à lista se não existir
        if (!connections.some(c => c.id === connection.id)) {
          const updatedConnections = [...connections, { ...connection, status: "disconnected" as ConnectionStatus }];
          setConnections(updatedConnections);
          localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
        }
        
        toast.success("Instância criada!", {
          description: "Agora você pode conectar escaneando o QR code",
        });
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

  const handleGenerateQRCode = async (connection: Connection) => {
    try {
      setIsLoading(true);
      setConnectionStatus("connecting");
      
      toast.info("Gerando QR Code", {
        description: "Por favor, aguarde...",
      });
      
      const { instanceName } = connection.configData || {};
      
      if (!instanceName) {
        throw new Error("Nome da instância não fornecido");
      }
      
      const result = await whatsappService.getEvolutionQRCode(instanceName);
      
      if (result.qrcode?.base64) {
        setQrCode(result.qrcode.base64);
        setActiveConnection(connection);
        
        // Atualizar status da conexão para "connecting"
        const updatedConnections = connections.map(c => 
          c.id === connection.id ? { ...c, status: "connecting" as ConnectionStatus } : c
        );
        setConnections(updatedConnections);
        localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
        
        toast.info("QR Code gerado", {
          description: "Escaneie o QR code com o seu WhatsApp",
        });
      } else {
        throw new Error("Falha ao gerar QR code");
      }
    } catch (error) {
      console.error("Error generating QR code:", error);
      toast.error("Erro ao gerar QR code", { 
        description: error instanceof Error ? error.message : "Ocorreu um erro ao gerar o QR code." 
      });
      setConnectionStatus("disconnected");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDisconnect = async () => {
    try {
      setIsLoading(true);
      
      if (activeConnection?.configData?.instanceName) {
        await whatsappService.disconnectEvolution(activeConnection.configData.instanceName);
      }
      
      setConnectionStatus("disconnected");
      setQrCode(null);
      
      if (activeConnection) {
        const updatedConnections = connections.filter(c => c.id !== activeConnection.id);
        setConnections(updatedConnections);
        localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
        setActiveConnection(null);
      }
      
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
      
      if (activeConnection?.configData?.instanceName) {
        await whatsappService.confirmEvolutionConnection(activeConnection.configData.instanceName);
      }
      
      setConnectionStatus("connected");
      setQrCode(null);
      await updateProfile({ whatsapp_connected: true });
      
      if (activeConnection) {
        const updatedConnections = connections.map(c => 
          c.id === activeConnection.id ? { ...c, status: "connected" as ConnectionStatus } : c
        );
        setConnections(updatedConnections);
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

  // Polling for connection status
  useEffect(() => {
    let intervalId: number;
    
    if (connectionStatus === "connecting" && qrCode && activeConnection?.configData?.instanceName) {
      intervalId = window.setInterval(async () => {
        try {
          const instanceName = activeConnection.configData?.instanceName;
          if (!instanceName) return;
            
          const status = await whatsappService.checkEvolutionStatus(instanceName);
          
          if (status.instance.state === "open") {
            setConnectionStatus("connected");
            setQrCode(null);
            
            if (activeConnection) {
              const updatedConnections = connections.map(c => 
                c.id === activeConnection.id ? { ...c, status: "connected" as ConnectionStatus } : c
              );
              setConnections(updatedConnections);
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
      }, 5000);
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
    handleConnect,
    handleGenerateQRCode,
    handleDisconnect,
    handleConfirmConnection
  };
};

export default useWhatsAppConnection;
