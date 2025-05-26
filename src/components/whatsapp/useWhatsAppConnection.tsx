
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { whatsappService } from "@/services/whatsapp";
import { connectionDatabaseService, DatabaseConnection } from "@/services/whatsapp/connectionDatabaseService";
import { Connection, ConnectionStatus, ConnectionType } from "@/components/settings/types";

// Função para converter DatabaseConnection para Connection
const convertDatabaseToConnection = (dbConnection: DatabaseConnection): Connection => {
  return {
    id: dbConnection.id,
    name: dbConnection.name,
    type: dbConnection.type as ConnectionType,
    status: dbConnection.status as ConnectionStatus,
    configData: {
      instanceName: dbConnection.instance_name,
      phoneNumber: dbConnection.phone_number,
      serverUrl: dbConnection.webhook_url,
      ...dbConnection.config_data
    }
  };
};

export const useWhatsAppConnection = () => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConnection, setActiveConnection] = useState<Connection | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<"create" | "qrcode" | "connect">("create");
  const { user, profile, updateProfile } = useAuth();
  
  // Carregar conexões do banco de dados
  const loadConnectionsFromDatabase = async () => {
    try {
      if (!user) return;
      
      const dbConnections = await connectionDatabaseService.getConnections();
      const convertedConnections = dbConnections.map(convertDatabaseToConnection);
      console.log("Conexões carregadas do banco:", convertedConnections);
      setConnections(convertedConnections);
      
      // Se houver uma conexão ativa, definir como ativa
      const connectedConnection = convertedConnections.find(c => c.status === "connected");
      if (connectedConnection && !activeConnection) {
        setActiveConnection(connectedConnection);
        setConnectionStatus("connected");
      }
    } catch (error) {
      console.error("Erro ao carregar conexões do banco:", error);
    }
  };

  // Carregar conexões quando o usuário estiver autenticado
  useEffect(() => {
    if (user) {
      loadConnectionsFromDatabase();
    }
  }, [user]);
  
  // Verificar status da conexão atual
  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        if (!user) return;
        
        if (profile?.whatsapp_connected) {
          setConnectionStatus("connected");
          return;
        }
        
        const status = await whatsappService.getStatus();
        if (status.connected) {
          setConnectionStatus("connected");
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
  
  const handleAddConnection = async (connectionName: string, connectionType: string, configData?: any) => {
    try {
      setIsLoading(true);
      
      // Salvar conexão no banco de dados
      const savedConnection = await connectionDatabaseService.saveConnection({
        name: connectionName,
        type: connectionType,
        status: "connected",
        instance_name: configData?.instanceName,
        phone_number: configData?.phoneNumber,
        webhook_url: configData?.serverUrl,
        config_data: configData || {}
      });
      
      if (savedConnection) {
        const newConnection = convertDatabaseToConnection(savedConnection);
        
        console.log("Conexão salva no banco:", newConnection);
        
        // Recarregar conexões do banco
        await loadConnectionsFromDatabase();
        
        setActiveConnection(newConnection);
        setConnectionStatus("connected");
        
        // Atualizar perfil
        if (user) {
          await updateProfile({ whatsapp_connected: true });
        }
        
        setIsDialogOpen(false);
        toast.success("Conexão adicionada", { 
          description: `A conexão "${connectionName}" foi adicionada com sucesso.` 
        });
      }
    } catch (error) {
      console.error("Erro ao adicionar conexão:", error);
      toast.error("Erro ao adicionar conexão", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsLoading(false);
    }
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

      // Deletar do banco de dados
      await connectionDatabaseService.deleteConnection(connectionId);
      
      // Recarregar conexões do banco
      await loadConnectionsFromDatabase();
      
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
          
          // Atualizar status no banco
          await connectionDatabaseService.updateConnection(connection.id, {
            status: "connected"
          });
          
          // Recarregar conexões
          await loadConnectionsFromDatabase();
          
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
        // Atualizar status no banco
        await connectionDatabaseService.updateConnection(activeConnection.id, {
          status: "disconnected"
        });
        
        // Recarregar conexões
        await loadConnectionsFromDatabase();
        
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
        // Atualizar status no banco
        await connectionDatabaseService.updateConnection(activeConnection.id, {
          status: "connected"
        });
        
        // Recarregar conexões
        await loadConnectionsFromDatabase();
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
    handleConfirmConnection,
    loadConnectionsFromDatabase
  };
};

export default useWhatsAppConnection;
