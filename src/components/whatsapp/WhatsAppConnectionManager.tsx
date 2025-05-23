
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { whatsappService } from "@/services/whatsapp";

interface ConnectionConfig {
  instanceName?: string;
  webhookUrl?: string;
}

export const useWhatsAppConnectionManager = () => {
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [savedConnections, setSavedConnections] = useState<Array<{
    id: string;
    name: string;
    type: string;
    config: ConnectionConfig;
  }>>([]);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  
  useEffect(() => {
    const savedData = localStorage.getItem("whatsapp_connections");
    if (savedData) {
      try {
        setSavedConnections(JSON.parse(savedData));
      } catch (e) {
        console.error("Error loading saved connections:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (savedConnections.length > 0) {
      localStorage.setItem("whatsapp_connections", JSON.stringify(savedConnections));
    }
  }, [savedConnections]);
  
  // Função para limpar o polling quando necessário
  const clearPolling = () => {
    if (pollingInterval !== null) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
      setIsPolling(false);
    }
  };

  // Cleanup interval when component unmounts
  useEffect(() => {
    return () => clearPolling();
  }, []);
  
  const handleConnect = async () => {
    try {
      setConnectionStatus("connecting");
      setError(null);
      
      toast.info("Iniciando conexão", {
        description: "Por favor, aguarde enquanto processamos sua solicitação...",
      });
      
      if (!instanceName.trim()) {
        throw new Error("Nome da instância é obrigatório");
      }
      
      console.log("Criando instância:", instanceName);
      
      // Etapa 1: Criar a instância
      const result = await whatsappService.connectEvolution(instanceName);
      
      console.log("Resultado da criação da instância:", result);
      
      if (result.status === "connected") {
        setConnectionStatus("connected");
        setQrCode(null);
        toast.success("Conectado com sucesso!", {
          description: "Sua conta WhatsApp foi conectada via Evolution API",
        });
      } else if (result.status === "disconnected") {
        setConnectionStatus("disconnected");
        toast.success("Instância criada!", {
          description: "Agora clique em 'Gerar QR Code' para conectar",
        });
      }
    } catch (error) {
      console.error("Erro ao conectar:", error);
      setConnectionStatus("disconnected");
      setError(error instanceof Error ? error.message : "Ocorreu um erro ao tentar conectar");
      toast.error("Erro na conexão", {
        description: error instanceof Error ? error.message : "Ocorreu um erro ao tentar conectar",
      });
    }
  };

  // Função modificada para gerar QR Code com melhor tratamento de erros
  const handleGenerateQRCode = async () => {
    try {
      setConnectionStatus("connecting");
      setError(null);
      clearPolling(); // Limpar qualquer polling anterior
      
      toast.info("Gerando QR Code", {
        description: "Por favor, aguarde...",
      });
      
      if (!instanceName.trim()) {
        throw new Error("Nome da instância é obrigatório");
      }
      
      console.log("Gerando QR code para instância:", instanceName);
      
      const result = await whatsappService.getEvolutionQRCode(instanceName);
      
      console.log("Resultado do QR code:", result);
      
      if (result.qrcode?.base64) {
        setQrCode(result.qrcode.base64);
        toast.success("QR Code gerado", {
          description: "Escaneie o QR code com o seu WhatsApp",
        });
        
        // Iniciar polling para verificar quando o QR code for escaneado
        startStatusPolling(instanceName);
      } else {
        throw new Error("Falha ao gerar QR code: resposta inválida da API");
      }
    } catch (error) {
      console.error("Erro ao gerar QR code:", error);
      setConnectionStatus("disconnected");
      setError(error instanceof Error ? error.message : "Ocorreu um erro ao gerar o QR code");
      toast.error("Erro ao gerar QR code", {
        description: error instanceof Error ? error.message : "Ocorreu um erro ao gerar o QR code",
      });
    }
  };
  
  // Função para iniciar o polling de status
  const startStatusPolling = (instanceNameToCheck: string) => {
    if (isPolling) return;
    
    console.log("Iniciando polling de status para:", instanceNameToCheck);
    setIsPolling(true);
    
    // Verificar a cada 3 segundos
    const interval = window.setInterval(async () => {
      try {
        console.log("Verificando status da conexão para:", instanceNameToCheck);
        const status = await whatsappService.checkEvolutionStatus(instanceNameToCheck);
        console.log("Status atual:", status);
        
        if (status.instance?.state === "open") {
          console.log("Conexão detectada como aberta/conectada!");
          setConnectionStatus("connected");
          setQrCode(null);
          clearPolling();
          
          toast.success("Conectado com sucesso!", {
            description: "Sua conta WhatsApp foi conectada",
          });
        }
      } catch (error) {
        console.error("Erro ao verificar status:", error);
      }
    }, 3000);
    
    setPollingInterval(interval);
  };
  
  const handleDisconnect = async () => {
    try {
      clearPolling();
      
      if (instanceName) {
        await whatsappService.disconnectEvolution(instanceName);
      }
      setConnectionStatus("disconnected");
      setQrCode(null);
      toast.success("Desconectado", {
        description: "Conexão WhatsApp encerrada com sucesso",
      });
    } catch (error) {
      console.error("Erro ao desconectar:", error);
      toast.error("Erro ao desconectar", {
        description: "Ocorreu um erro ao tentar desconectar o WhatsApp",
      });
    }
  };

  const handleConfirmConnection = async () => {
    try {
      clearPolling();
      
      if (instanceName) {
        await whatsappService.confirmEvolutionConnection(instanceName);
      }
      setConnectionStatus("connected");
      setQrCode(null);
      toast.success("Conectado com sucesso!", {
        description: "Sua conta WhatsApp foi confirmada manualmente",
      });
    } catch (error) {
      console.error("Erro ao confirmar conexão:", error);
      toast.error("Erro na confirmação", {
        description: "Ocorreu um erro ao tentar confirmar a conexão WhatsApp",
      });
    }
  };

  const handleSaveConnection = () => {
    const newConnection = {
      id: Date.now().toString(),
      name: instanceName || "Evolution API Connection",
      type: "evolution",
      config: {
        instanceName,
        webhookUrl
      }
    };
    
    const updatedConnections = [...savedConnections, newConnection];
    setSavedConnections(updatedConnections);
    
    toast.success("Conexão salva", {
      description: "As credenciais de conexão foram salvas",
    });
    
    clearConnectionForm();
  };
  
  const handleUpdateConnection = () => {
    if (!selectedConnection) return;
    
    const updatedConnections = savedConnections.map(conn => {
      if (conn.id === selectedConnection) {
        return {
          ...conn,
          name: instanceName || conn.name,
          config: {
            instanceName,
            webhookUrl
          }
        };
      }
      return conn;
    });
    
    setSavedConnections(updatedConnections);
    setSelectedConnection(null);
    setIsEditing(false);
    
    toast.success("Conexão atualizada", {
      description: "As credenciais de conexão foram atualizadas",
    });
    
    clearConnectionForm();
  };
  
  const handleDeleteConnection = (id: string) => {
    const updatedConnections = savedConnections.filter(conn => conn.id !== id);
    setSavedConnections(updatedConnections);
    
    toast.success("Conexão removida", {
      description: "A conexão foi removida com sucesso",
    });
    
    if (selectedConnection === id) {
      setSelectedConnection(null);
      clearConnectionForm();
    }
  };
  
  const handleEditConnection = (id: string) => {
    const connection = savedConnections.find(conn => conn.id === id);
    if (!connection) return;
    
    setInstanceName(connection.config.instanceName || "");
    setWebhookUrl(connection.config.webhookUrl || "");
    setSelectedConnection(id);
    setIsEditing(true);
  };
  
  const handleConnectSaved = (id: string) => {
    const connection = savedConnections.find(conn => conn.id === id);
    if (!connection) return;
    
    setInstanceName(connection.config.instanceName || "");
    setWebhookUrl(connection.config.webhookUrl || "");
    
    handleConnect();
  };

  const clearConnectionForm = () => {
    setInstanceName("");
    setWebhookUrl("");
    setIsEditing(false);
    setSelectedConnection(null);
  };

  return {
    connectionStatus,
    qrCode,
    instanceName,
    webhookUrl,
    isEditing,
    savedConnections,
    selectedConnection,
    error,
    setInstanceName,
    setWebhookUrl,
    handleConnect,
    handleGenerateQRCode,
    handleDisconnect,
    handleConfirmConnection,
    handleSaveConnection,
    handleUpdateConnection,
    handleDeleteConnection,
    handleEditConnection,
    handleConnectSaved,
    clearConnectionForm
  };
};
