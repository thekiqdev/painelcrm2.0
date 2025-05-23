
import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
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
  const { toast } = useToast();
  
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
  
  const handleConnect = async () => {
    setConnectionStatus("connecting");
    toast({
      title: "Iniciando conexão",
      description: "Por favor, aguarde enquanto processamos sua solicitação...",
    });
    
    try {
      if (instanceName) {
        toast({
          title: "Criando instância",
          description: "Criando instância na Evolution API...",
        });
        
        const result = await whatsappService.connectEvolution(instanceName);
        
        if (result.status === "connected") {
          setConnectionStatus("connected");
          toast({
            title: "Conectado com sucesso!",
            description: "Sua conta WhatsApp foi conectada via Evolution API",
          });
        } else if (result.status === "disconnected") {
          setConnectionStatus("disconnected");
          toast({
            title: "Instância criada!",
            description: "Agora clique em 'Gerar QR Code' para conectar",
          });
        }
      } else {
        throw new Error("Nome da instância é obrigatório");
      }
    } catch (error) {
      console.error("Erro ao conectar:", error);
      setConnectionStatus("disconnected");
      toast({
        title: "Erro na conexão",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao tentar conectar",
        variant: "destructive",
      });
    }
  };

  const handleGenerateQRCode = async () => {
    try {
      setConnectionStatus("connecting");
      toast({
        title: "Gerando QR Code",
        description: "Por favor, aguarde...",
      });
      
      const result = await whatsappService.getEvolutionQRCode(instanceName);
      
      if (result.qrcode?.base64) {
        setQrCode(result.qrcode.base64);
        toast({
          title: "QR Code gerado",
          description: "Escaneie o QR code com o seu WhatsApp",
        });
      } else {
        throw new Error("Falha ao gerar QR code");
      }
    } catch (error) {
      console.error("Erro ao gerar QR code:", error);
      setConnectionStatus("disconnected");
      toast({
        title: "Erro ao gerar QR code",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao gerar o QR code.",
        variant: "destructive",
      });
    }
  };
  
  const handleDisconnect = async () => {
    try {
      if (instanceName) {
        await whatsappService.disconnectEvolution(instanceName);
      }
      setConnectionStatus("disconnected");
      setQrCode(null);
      toast({
        title: "Desconectado",
        description: "Conexão WhatsApp encerrada com sucesso",
      });
    } catch (error) {
      console.error("Erro ao desconectar:", error);
      toast({
        title: "Erro ao desconectar",
        description: "Ocorreu um erro ao tentar desconectar o WhatsApp.",
        variant: "destructive",
      });
    }
  };

  const handleConfirmConnection = async () => {
    try {
      if (instanceName) {
        await whatsappService.confirmEvolutionConnection(instanceName);
      }
      setConnectionStatus("connected");
      setQrCode(null);
      toast({
        title: "Conectado com sucesso!",
        description: "Sua conta WhatsApp foi confirmada manualmente",
      });
    } catch (error) {
      console.error("Erro ao confirmar conexão:", error);
      toast({
        title: "Erro na confirmação",
        description: "Ocorreu um erro ao tentar confirmar a conexão WhatsApp.",
        variant: "destructive",
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
    
    toast({
      title: "Conexão salva",
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
    
    toast({
      title: "Conexão atualizada",
      description: "As credenciais de conexão foram atualizadas",
    });
    
    clearConnectionForm();
  };
  
  const handleDeleteConnection = (id: string) => {
    const updatedConnections = savedConnections.filter(conn => conn.id !== id);
    setSavedConnections(updatedConnections);
    
    toast({
      title: "Conexão removida",
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

  // Polling for connection status
  useEffect(() => {
    if (qrCode && connectionStatus === "connecting") {
      const timer = setTimeout(async () => {
        try {
          if (instanceName) {
            const status = await whatsappService.checkEvolutionStatus(instanceName);
            if (status.instance.state === "open") {
              setConnectionStatus("connected");
              setQrCode(null);
              toast({
                title: "Conectado com sucesso!",
                description: "Sua conta WhatsApp foi conectada",
              });
            }
          }
        } catch (error) {
          console.error("Erro ao verificar status:", error);
        }
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [qrCode, connectionStatus, toast, instanceName]);

  return {
    connectionStatus,
    qrCode,
    instanceName,
    webhookUrl,
    isEditing,
    savedConnections,
    selectedConnection,
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
