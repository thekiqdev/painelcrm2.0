
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
      console.info('🔍 useWhatsAppConnection: ===== VERIFICAÇÃO DE STATUS =====');
      console.info('🔍 useWhatsAppConnection: User presente?', !!user);
      console.info('🔍 useWhatsAppConnection: Total de conexões:', connections.length);
      
      try {
        if (!user) {
          console.info('🔍 useWhatsAppConnection: Usuário não autenticado, pulando verificação');
          return;
        }
        
        if (profile?.whatsapp_connected) {
          console.info('🔍 useWhatsAppConnection: Profile indica WhatsApp conectado');
          setConnectionStatus("connected");
          return;
        }
        
        // Verificar cada conexão individualmente
        for (const connection of connections) {
          console.info('🔍 useWhatsAppConnection: ===== VERIFICANDO CONEXÃO =====');
          console.info('🔍 useWhatsAppConnection: Dados da conexão:', {
            id: connection.id,
            name: connection.name,
            type: connection.type,
            currentStatus: connection.status,
            configData: connection.configData
          });

          // Verificar qual nome está sendo usado para a API
          const instanceName = connection.configData?.instanceName || connection.name;
          console.info('🔍 useWhatsAppConnection: Nome para API:', instanceName);

          try {
            console.info('🔍 useWhatsAppConnection: Chamando getStatus para:', instanceName);
            const status = await whatsappService.getStatus();
            console.info('🔍 useWhatsAppConnection: Status recebido:', {
              connectionName: connection.name,
              instanceName: instanceName,
              status: status
            });
            
            if (status?.connected) {
              console.info('🔍 useWhatsAppConnection: Conexão ativa encontrada');
              setConnectionStatus("connected");
              if (!profile?.whatsapp_connected) {
                await updateProfile({ whatsapp_connected: true });
              }
              break; // Para no primeiro conectado
            }
          } catch (error) {
            console.error('❌ useWhatsAppConnection: Erro ao verificar status da conexão:', {
              connectionName: connection.name,
              instanceName: instanceName,
              _type: 'Error',
              value: error
            });
            
            // Se o erro for 404, pode indicar problema de nome da instância
            if (error instanceof Error && error.message.includes('404')) {
              console.error('❌ useWhatsAppConnection: ERRO 404 - INSTÂNCIA NÃO ENCONTRADA!');
              console.error('❌ useWhatsAppConnection: Possíveis causas:', {
                incorrectName: 'Nome da instância pode estar incorreto',
                nameMismatch: 'Diferença entre nome armazenado e nome real na API',
                instanceDeleted: 'Instância pode ter sido deletada',
                suggestion: 'Verificar lista de instâncias via fetchInstances'
              });
            }
          }
        }
        
        // Se nenhuma conexão estava ativa
        if (connections.length === 0) {
          console.info('🔍 useWhatsAppConnection: Nenhuma conexão cadastrada');
          setConnectionStatus("disconnected");
        }
        
      } catch (error) {
        console.error("❌ useWhatsAppConnection: Erro geral na verificação:", error);
        toast.error("Erro ao verificar status da conexão", { 
          description: "Não foi possível verificar o status da conexão WhatsApp." 
        });
      }
    };
    
    checkConnectionStatus();
  }, [user, profile, updateProfile, connections]);
  
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
