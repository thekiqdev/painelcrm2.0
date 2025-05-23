
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, CheckCircle2 } from "lucide-react";
import { ConnectionType } from "@/components/settings/types";
import { evolutionApi } from "@/services/evolutionApi";
import { toast } from "sonner";
import QRCodeScanner from "./QRCodeScanner";

interface AddConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddConnection: (connectionName: string, connectionType: string, configData?: any) => void;
}

type DialogStep = "form" | "qrcode" | "connected";

const AddConnectionDialog: React.FC<AddConnectionDialogProps> = ({
  isOpen,
  onClose,
  onAddConnection,
}) => {
  const [connectionName, setConnectionName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [currentStep, setCurrentStep] = useState<DialogStep>("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasActiveConfig, setHasActiveConfig] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState("");
  
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const config = await evolutionApi.getActiveConfig();
        setHasActiveConfig(!!config);
      } catch (error) {
        console.error("Erro ao verificar configuração:", error);
      }
    };
    
    if (isOpen) {
      checkConfig();
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
    }
  }, [isOpen]);
  
  const handleNextStep = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!hasActiveConfig) {
      toast.error("Configuração necessária", {
        description: "Configure primeiro a Evolution API em Configurações."
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Gerar nome da instância baseado no número
      const generatedInstanceName = `whatsapp_${phoneNumber.replace(/\D/g, '')}`;
      setInstanceName(generatedInstanceName);
      
      toast.info("Criando instância", {
        description: "Preparando conexão WhatsApp...",
      });
      
      // Criar instância
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Configuração não encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      await evolutionApi.createInstance(generatedInstanceName, phoneNumber);
      
      // Aguardar um pouco e obter QR code
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const qrResult = await evolutionApi.connectInstance(generatedInstanceName);
      
      if (qrResult.qrcode?.base64) {
        setQrCode(qrResult.qrcode.base64);
        setCurrentStep("qrcode");
        
        toast.success("QR Code gerado", {
          description: "Escaneie o QR code com seu WhatsApp",
        });
        
        // Iniciar verificação de conexão
        startConnectionPolling(generatedInstanceName);
      } else {
        throw new Error("Falha ao gerar QR code");
      }
    } catch (error) {
      console.error("Erro ao criar instância:", error);
      toast.error("Erro ao criar conexão", {
        description: error instanceof Error ? error.message : "Ocorreu um erro"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const startConnectionPolling = (instanceName: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const config = await evolutionApi.getActiveConfig();
        if (!config) return;
        
        evolutionApi.setCredentials(config.api_url, config.global_key);
        const status = await evolutionApi.getInstanceStatus(instanceName);
        
        if (status.instance.state === "open") {
          setCurrentStep("connected");
          clearInterval(pollInterval);
          
          toast.success("Conectado com sucesso!", {
            description: "WhatsApp foi conectado com sucesso",
          });
          
          // Auto-finalizar após 2 segundos
          setTimeout(() => {
            handleFinishConnection();
          }, 2000);
        }
      } catch (error) {
        console.error("Erro ao verificar conexão:", error);
      }
    }, 3000);
    
    // Timeout após 5 minutos
    setTimeout(() => {
      clearInterval(pollInterval);
      if (currentStep === "qrcode") {
        toast.error("Timeout na conexão", {
          description: "QR Code expirou. Tente novamente.",
        });
        setCurrentStep("form");
        setQrCode(null);
      }
    }, 300000);
  };

  const handleFinishConnection = () => {
    onAddConnection(connectionName, "evolution", {
      instanceName,
      phoneNumber
    });
    onClose();
  };

  const handleBack = () => {
    if (currentStep === "qrcode") {
      setCurrentStep("form");
      setQrCode(null);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case "form":
        return "Nova Conexão WhatsApp";
      case "qrcode":
        return "Escaneie o QR Code";
      case "connected":
        return "Conectado com Sucesso!";
      default:
        return "Nova Conexão WhatsApp";
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case "form":
        return "Insira os dados para criar uma nova conexão WhatsApp";
      case "qrcode":
        return "Use seu celular para escanear o QR code e conectar o WhatsApp";
      case "connected":
        return "Sua conta WhatsApp foi conectada com sucesso";
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
              {!hasActiveConfig && (
                <Alert variant="destructive">
                  <InfoIcon className="h-4 w-4 mr-2" />
                  <AlertDescription>
                    Você precisa configurar a Evolution API primeiro em Configurações {">"} WhatsApp {">"} Configurações Avançadas.
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
                <Input
                  id="phoneNumber"
                  placeholder="Ex: 11999999999"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Insira o número sem código do país (será adicionado automaticamente o +55)
                </p>
              </div>
              
              <Alert>
                <InfoIcon className="h-4 w-4 mr-2" />
                <AlertDescription>
                  Uma instância será criada automaticamente para esta conexão
                </AlertDescription>
              </Alert>
            </div>
            
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onClose}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !connectionName || !phoneNumber || !hasActiveConfig}
              >
                {isSubmitting ? "Criando..." : "Próximo"}
              </Button>
            </DialogFooter>
          </form>
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
