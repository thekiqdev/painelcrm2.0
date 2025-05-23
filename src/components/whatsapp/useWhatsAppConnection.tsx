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
      status: "disconnected" as ConnectionStatus,
      configData
    };
    
    console.log("Adding new connection:", newConnection);
    
    const updatedConnections = [...connections, newConnection];
    setConnections(updatedConnections);
    
    localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
    
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

      // Se for uma conexão Evolution API, deletar na API também
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
  
  // Evolution API - Fluxo completo: Criar -> QR Code -> Conectar
  const handleEvolutionConnect = async (connection: Connection) => {
    try {
      setActiveConnection(connection);
      setIsLoading(true);
      setConnectionStatus("connecting");
      
      const { instanceName } = connection.configData || {};
      
      if (!instanceName) {
        throw new Error("Configurações da Evolution API incompletas. Verifique o Nome da Instância.");
      }
      
      // Passo 1: Criar instância
      setCurrentStep("create");
      toast.info("Passo 1: Criando instância", {
        description: "Criando instância na Evolution API...",
      });
      
      console.log("Iniciando Passo 1: Criando instância");
      await whatsappService.createEvolutionInstance(instanceName);
      
      // Aguardar um pouco para a instância ser criada
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Passo 2: Obter QR Code
      setCurrentStep("qrcode");
      toast.info("Passo 2: Gerando QR Code", {
        description: "Obtendo QR Code para conexão...",
      });
      
      console.log("Iniciando Passo 2: Obtendo QR Code");
      const qrResult = await whatsappService.getEvolutionQRCode(instanceName);
      
      if (qrResult.success && qrResult.qrCode) {
        setQrCode(qrResult.qrCode);
        toast.success("QR Code gerado", {
          description: "Escaneie o QR code com o seu WhatsApp",
        });
        
        // Passo 3: Iniciar polling para verificar conexão
        setCurrentStep("connect");
        startConnectionPolling(instanceName, connection);
      } else {
        throw new Error("Falha ao gerar QR code");
      }
      
    } catch (error) {
      console.error("Erro no fluxo Evolution API:", error);
      toast.error("Erro na conexão", { 
        description: error instanceof Error ? error.message : "Ocorreu um erro ao tentar conectar o WhatsApp." 
      });
      setConnectionStatus("disconnected");
      setCurrentStep("create");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Polling para verificar se a conexão foi estabelecida
  const startConnectionPolling = (instanceName: string, connection: Connection) => {
    const pollInterval = setInterval(async () => {
      try {
        console.log("Verificando status da conexão...");
        const result = await whatsappService.checkEvolutionConnection(instanceName);
        
        if (result.success && result.status === "connected") {
          console.log("Conexão estabelecida com sucesso!");
          
          setConnectionStatus("connected");
          setQrCode(null);
          setCurrentStep("create");
          
          // Atualizar conexão local
          const updatedConnections = connections.map(c => 
            c.id === connection.id ? { ...c, status: "connected" as ConnectionStatus } : c
          );
          setConnections(updatedConnections);
          localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
          
          await updateProfile({ whatsapp_connected: true });
          
          toast.success("Conectado com sucesso!", {
            description: "Sua conta WhatsApp foi conectada via Evolution API",
          });
          
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error("Erro ao verificar conexão:", error);
      }
    }, 5000); // Verificar a cada 5 segundos
    
    // Limpar polling após 5 minutos
    setTimeout(() => {
      clearInterval(pollInterval);
      if (connectionStatus === "connecting") {
        toast.error("Timeout na conexão", {
          description: "QR Code expirou. Tente novamente.",
        });
        setConnectionStatus("disconnected");
        setQrCode(null);
        setCurrentStep("create");
      }
    }, 300000); // 5 minutos
  };
  
  // Função principal de conexão
  const handleConnect = async (connection: Connection) => {
    if (connection.type === "evolution") {
      await handleEvolutionConnect(connection);
    } else {
      // Fluxo para outros tipos de conexão (WebJS, QR Code padrão)
      try {
        setActiveConnection(connection);
        setIsLoading(true);
        setConnectionStatus("connecting");
        
        toast.info("Iniciando conexão", {
          description: "Por favor, aguarde enquanto processamos sua solicitação...",
        });
        
        let result;
        
        if (connection.type === "webjs") {
          result = await whatsappService.connectWebJS();
        } else {
          result = await whatsappService.connect();
        }
        
        if (result.status === "connected") {
          setConnectionStatus("connected");
          setQrCode(null);
          await updateProfile({ whatsapp_connected: true });
          
          const updatedConnections = connections.map(c => 
            c.id === connection.id ? { ...c, status: "connected" as ConnectionStatus } : c
          );
          setConnections(updatedConnections);
          
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
