
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { ConnectionType } from "@/components/settings/types";
import { evolutionApi } from "@/services/evolutionApi";
import { toast } from "sonner";
import QRCodeScanner from "./QRCodeScanner";

interface AddConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddConnection: (connectionName: string, connectionType: string, configData?: any) => void;
}

type DialogStep = "form" | "creating" | "qrcode" | "connected" | "error";

const AddConnectionDialog: React.FC<AddConnectionDialogProps> = ({
  isOpen,
  onClose,
  onAddConnection,
}) => {
  const [connectionName, setConnectionName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [currentStep, setCurrentStep] = useState<DialogStep>("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasActiveServer, setHasActiveServer] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  
  // Função para extrair apenas os números do telefone
  const extractPhoneNumbers = (phone: string): string => {
    return phone.replace(/\D/g, '');
  };

  useEffect(() => {
    const checkServer = async () => {
      try {
        const server = await evolutionApi.getActiveServer();
        setHasActiveServer(!!server);
        
        if (server) {
          evolutionApi.setCredentials(server.server_url, server.api_key);
        }
      } catch (error) {
        console.error("Erro ao verificar servidor:", error);
      }
    };
    
    if (isOpen) {
      checkServer();
    }
  }, [isOpen]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setConnectionName("");
      setPhoneNumber("");
      setCurrentStep("form");
      setQrCode(null);
      setInstanceName("");
      setIsSubmitting(false);
      setErrorMessage("");
    }
  }, [isOpen]);
  
  const handleNextStep = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!hasActiveServer) {
      toast.error("Servidor necessário", {
        description: "Configure primeiro um servidor Evolution API em Configurações."
      });
      return;
    }
    
    setIsSubmitting(true);
    setErrorMessage("");
    
    try {
      // Extrair apenas números do telefone
      const cleanPhoneNumber = extractPhoneNumbers(phoneNumber);
      
      // Criar instanceName mais simples
      const timestamp = Date.now().toString().slice(-6);
      const generatedInstanceName = `instance_${cleanPhoneNumber}_${timestamp}`;
      setInstanceName(generatedInstanceName);
      
      console.log("[AddConnection] Processando instância:", generatedInstanceName);
      
      // Ir para tela de criação
      setCurrentStep("creating");
      
      // Obter servidor ativo
      const server = await evolutionApi.getActiveServer();
      if (!server) throw new Error("Servidor não encontrado");
      
      evolutionApi.setCredentials(server.server_url, server.api_key);
      
      // Aguardar 3 segundos na tela de criação para dar tempo da API processar
      setTimeout(async () => {
        try {
          console.log("[AddConnection] Tentando obter QR code...");
          await obtainQRCode(generatedInstanceName);
          
        } catch (error) {
          console.error("[AddConnection] Erro ao obter QR code:", error);
          setErrorMessage(error instanceof Error ? error.message : "Erro ao processar instância");
          setCurrentStep("error");
        }
      }, 3000);
      
    } catch (error) {
      console.error("[AddConnection] Erro inicial:", error);
      setErrorMessage(error instanceof Error ? error.message : "Ocorreu um erro");
      setCurrentStep("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const obtainQRCode = async (instanceName: string) => {
    console.log("[AddConnection] Obtendo QR code para:", instanceName);
    setCurrentStep("qrcode");
    
    try {
      const qrResult = await evolutionApi.getQRCode(instanceName);
      console.log("[AddConnection] Resultado do QR Code:", qrResult);
      
      if (qrResult?.qrcode?.base64) {
        console.log("[AddConnection] QR Code obtido com sucesso!");
        setQrCode(qrResult.qrcode.base64);
        
        // Salvar conexão no localStorage
        const connections = JSON.parse(localStorage.getItem('whatsapp_connections') || '[]');
        const newConnection = {
          id: `conn_${Date.now()}`,
          name: connectionName,
          type: "evolution" as ConnectionType,
          status: "connecting",
          configData: {
            instanceName,
            phoneNumber: extractPhoneNumbers(phoneNumber)
          },
          createdAt: new Date().toISOString()
        };
        
        connections.push(newConnection);
        localStorage.setItem('whatsapp_connections', JSON.stringify(connections));
        
        toast.success("QR Code gerado", {
          description: "Escaneie o QR code com seu WhatsApp",
        });
        
        // Iniciar verificação de conexão
        startConnectionPolling(instanceName);
        return;
      }
      
      throw new Error("QR Code não foi gerado. Verifique a configuração da Evolution API.");
      
    } catch (error) {
      console.error("[AddConnection] Erro ao obter QR code:", error);
      
      if (error instanceof Error && error.message.includes('já está conectada')) {
        setCurrentStep("connected");
        toast.success("Instância já conectada!", {
          description: "Esta instância já estava ativa",
        });
        
        setTimeout(() => {
          handleFinishConnection();
        }, 2000);
        return;
      }
      
      setErrorMessage(error instanceof Error ? error.message : "Erro ao gerar QR code");
      setCurrentStep("error");
    }
  };

  const handleRetryQRCode = async () => {
    if (!instanceName) return;
    
    setErrorMessage("");
    setCurrentStep("qrcode");
    
    try {
      await obtainQRCode(instanceName);
    } catch (error) {
      console.error("[AddConnection] Erro ao tentar novamente:", error);
      setErrorMessage(error instanceof Error ? error.message : "Erro ao tentar novamente");
      setCurrentStep("error");
    }
  };

  const startConnectionPolling = (instanceName: string) => {
    console.log("[AddConnection] Iniciando polling para instância:", instanceName);
    
    const pollInterval = setInterval(async () => {
      try {
        const config = await evolutionApi.getActiveConfig();
        if (!config) return;
        
        evolutionApi.setCredentials(config.api_url, config.global_key);
        const status = await evolutionApi.getInstanceStatus(instanceName);
        
        console.log("[AddConnection] Status da instância:", status);
        
        if (status.instance.state === "open") {
          setCurrentStep("connected");
          clearInterval(pollInterval);
          
          // Atualizar conexão no sistema para status conectado
          const connections = JSON.parse(localStorage.getItem('whatsapp_connections') || '[]');
          const updatedConnections = connections.map((conn: any) => 
            conn.configData?.instanceName === instanceName 
              ? { ...conn, status: "connected" }
              : conn
          );
          localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
          
          toast.success("Conectado com sucesso!", {
            description: "WhatsApp foi conectado com sucesso",
          });
          
          // Auto-finalizar após 2 segundos
          setTimeout(() => {
            handleFinishConnection();
          }, 2000);
        }
      } catch (error) {
        console.error("[AddConnection] Erro ao verificar conexão:", error);
      }
    }, 3000);
    
    // Timeout após 5 minutos
    setTimeout(() => {
      clearInterval(pollInterval);
      if (currentStep === "qrcode") {
        setErrorMessage("QR Code expirou. Tente gerar novamente.");
        setCurrentStep("error");
      }
    }, 300000);
  };

  const handleFinishConnection = () => {
    onAddConnection(connectionName, "evolution", {
      instanceName,
      phoneNumber: extractPhoneNumbers(phoneNumber)
    });
    
    onClose();
  };

  const handleBack = () => {
    if (currentStep === "qrcode" || currentStep === "error") {
      setCurrentStep("form");
      setQrCode(null);
      setErrorMessage("");
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case "form":
        return "Nova Conexão WhatsApp";
      case "creating":
        return "Criando Instância";
      case "qrcode":
        return "Escaneie o QR Code";
      case "connected":
        return "Conectado com Sucesso!";
      case "error":
        return "Erro na Conexão";
      default:
        return "Nova Conexão WhatsApp";
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case "form":
        return "Insira os dados para criar uma nova conexão WhatsApp";
      case "creating":
        return "Preparando sua instância no servidor Evolution API...";
      case "qrcode":
        return "Use seu celular para escanear o QR code e conectar o WhatsApp";
      case "connected":
        return "Sua conta WhatsApp foi conectada com sucesso";
      case "error":
        return "Ocorreu um erro durante o processo de conexão";
      default:
        return "Crie uma nova conexão WhatsApp";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getStepTitle()}</DialogTitle>
          <DialogDescription>
            {getStepDescription()}
          </DialogDescription>
        </DialogHeader>
        
        {currentStep === "form" && (
          <form onSubmit={handleNextStep}>
            <div className="grid gap-4 py-4">
              {!hasActiveServer && (
                <Alert variant="destructive">
                  <InfoIcon className="h-4 w-4 mr-2" />
                  <AlertDescription>
                    Você precisa configurar um servidor Evolution API primeiro em Configurações {">"} WhatsApp {">"} Configurações Avançadas.
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="grid gap-2">
                <Label htmlFor="connectionName">Nome da Conexão</Label>
                <Input
                  id="connectionName"
                  placeholder="Ex: WhatsApp Principal"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  required
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="phoneNumber">Número do WhatsApp</Label>
                <PhoneInput
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Digite o número no formato (XX) 9 XXXX-XXXX. O código do país (+55) será adicionado automaticamente.
                </p>
              </div>
              
              <Alert>
                <InfoIcon className="h-4 w-4 mr-2" />
                <AlertDescription>
                  Uma instância será criada automaticamente com webhook configurado para receber atualizações de status
                </AlertDescription>
              </Alert>
            </div>
            
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onClose}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !connectionName || !phoneNumber || !hasActiveServer || extractPhoneNumbers(phoneNumber).length < 10}
              >
                {isSubmitting ? "Processando..." : "Próximo"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {currentStep === "creating" && (
          <div className="py-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
              <h3 className="text-lg font-semibold">Criando instância...</h3>
              <p className="text-muted-foreground">
                Configurando webhook e preparando conexão com a Evolution API
              </p>
            </div>
          </div>
        )}

        {currentStep === "qrcode" && (
          <div className="py-4">
            <QRCodeScanner 
              qrCode={qrCode} 
              connectionStatus="connecting" 
              onDisconnect={() => {}} 
              onConfirmConnection={() => {}}
            />
            
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={handleBack}>
                Voltar
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        )}

        {currentStep === "error" && (
          <div className="py-8 text-center">
            <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Erro na Conexão</h3>
            <p className="text-muted-foreground mb-6">
              {errorMessage || "Ocorreu um erro inesperado"}
            </p>
            
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4 mr-2" />
              <AlertDescription>
                {errorMessage}
              </AlertDescription>
            </Alert>
            
            <DialogFooter className="flex-col gap-2">
              <Button onClick={handleRetryQRCode} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar Gerar QR Code Novamente
              </Button>
              <div className="flex gap-2 w-full">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  Voltar
                </Button>
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancelar
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}

        {currentStep === "connected" && (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Conexão Estabelecida!</h3>
            <p className="text-muted-foreground mb-6">
              Seu WhatsApp foi conectado com sucesso e está pronto para uso.
            </p>
            
            <Alert className="mb-4">
              <InfoIcon className="h-4 w-4 mr-2" />
              <AlertDescription>
                A conexão será finalizada automaticamente em alguns segundos.
              </AlertDescription>
            </Alert>
            
            <DialogFooter>
              <Button onClick={handleFinishConnection} className="w-full">
                Finalizar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddConnectionDialog;
