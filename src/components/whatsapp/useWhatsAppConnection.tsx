
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
  const [currentStep, setCurrentStep] = useState<"create" | "qrcode" | "connect">("create");
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
        
        const status = await whatsappService.getStatus();
        if (status.connected) {
          setConnectionStatus("connected");
          if (!profile?.whatsapp_connected) {
            await updateProfile({ whatsapp_connected: true });
          }
          
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
      status: "connected" as ConnectionStatus, // Já vem conectado do novo fluxo
      configData
    };
    
    console.log("Adding new connection:", newConnection);
    
    const updatedConnections = [...connections, newConnection];
    setConnections(updatedConnections);
    setActiveConnection(newConnection);
    setConnectionStatus("connected");
    
    localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
    
    // Atualizar perfil
    if (user) {
      updateProfile({ whatsapp_connected: true });
    }
    
    setIsDialogOpen(false);
    toast.success("Conexão adicionada", { 
      description: `A conexão "${connectionName}" foi adicionada com sucesso.` 
    });
  };

  const handleDeleteConnection = async (connectionId: string) => {
    try {
      setIsLoading(true);
      
      const connectionToDelete = connections.find(c => c.id === connectionId);
      if (!connectionToDelete) {
        throw new Error("Conexão não encontrada");
      }

      // Se for uma conexão evolution, deletar na API também
      if (connectionToDelete.type === "evolution" && connectionToDelete.configData?.instanceName) {
        await whatsappService.deleteEvolutionInstance(connectionToDelete.configData.instanceName);
      }

      // Remover da lista local
      const updatedConnections = connections.filter(c => c.id !== connectionId);
      setConnections(updatedConnections);
      
      // Atualizar localStorage
      localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
      
      // Se a conexão ativa foi deletada, limpar
      if (activeConnection?.id === connectionId) {
        setActiveConnection(null);
        setConnectionStatus("disconnected");
        setQrCode(null);
        
        if (user) {
          await updateProfile({ whatsapp_connected: false });
        }
      }

      toast.success("Conexão excluída", {
        description: "A conexão foi removida com sucesso da plataforma e da API",
      });
    } catch (error) {
      console.error("Error deleting connection:", error);
      toast.error("Erro ao excluir", {
        description: error instanceof Error ? error.message : "Ocorreu um erro ao excluir a conexão"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Função principal de conexão (para conexões já existentes)
  const handleConnect = async (connection: Connection) => {
    try {
      setActiveConnection(connection);
      setIsLoading(true);
      setConnectionStatus("connecting");
      
      toast.info("Conectando", {
        description: "Verificando status da conexão...",
      });
      
      // Para conexões evolution, verificar se já está conectada
      if (connection.type === "evolution" && connection.configData?.instanceName) {
        const result = await whatsappService.checkEvolutionConnection(connection.configData.instanceName);
        
        if (result.success && result.status === "connected") {
          setConnectionStatus("connected");
          await updateProfile({ whatsapp_connected: true });
          
          const updatedConnections = connections.map(c => 
            c.id === connection.id ? { ...c, status: "connected" as ConnectionStatus } : c
          );
          setConnections(updatedConnections);
          localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
          
          toast.success("Já conectado!", {
            description: "Esta conexão já estava ativa",
          });
        } else {
          throw new Error("Conexão não está ativa. Crie uma nova conexão.");
        }
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
      setCurrentStep("create");
      
      if (activeConnection) {
        const updatedConnections = connections.map(c => 
          c.id === activeConnection.id ? { ...c, status: "disconnected" as ConnectionStatus } : c
        );
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
      
      await whatsappService.confirmConnection();
      setConnectionStatus("connected");
      setQrCode(null);
      setCurrentStep("create");
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

  return {
    connections,
    activeConnection,
    connectionStatus,
    qrCode,
    isLoading,
    isDialogOpen,
    currentStep,
    setIsDialogOpen,
    handleAddConnection,
    handleConnect,
    handleDisconnect,
    handleDeleteConnection,
    handleConfirmConnection
  };
};

export default useWhatsAppConnection;
