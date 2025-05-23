
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

interface InstanceState {
  instanceName: string;
  connectionName: string;
  phoneNumber: string;
  step: DialogStep;
  qrCode?: string;
  created: boolean;
}

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
  
  // Função para extrair apenas os números do telefone
  const extractPhoneNumbers = (phone: string): string => {
    return phone.replace(/\D/g, '');
  };
  
  // Função para salvar estado da instância
  const saveInstanceState = (state: InstanceState) => {
    localStorage.setItem(`instance_state_${state.instanceName}`, JSON.stringify(state));
  };
  
  // Função para carregar estado da instância
  const loadInstanceState = (instanceName: string): InstanceState | null => {
    const saved = localStorage.getItem(`instance_state_${instanceName}`);
    return saved ? JSON.parse(saved) : null;
  };
  
  // Função para limpar estado da instância
  const clearInstanceState = (instanceName: string) => {
    localStorage.removeItem(`instance_state_${instanceName}`);
  };
  
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
    setCurrentStep("qrcode");
    
    try {
      // Extrair apenas números do telefone
      const cleanPhoneNumber = extractPhoneNumbers(phoneNumber);
      
      // Limpar caracteres especiais do nome da conexão para criar o instanceName
      const cleanConnectionName = connectionName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const generatedInstanceName = `${cleanConnectionName}_${cleanPhoneNumber}`;
      setInstanceName(generatedInstanceName);
      
      console.log("Verificando estado existente para instância:", generatedInstanceName);
      
      // Verificar se já existe estado salvo para esta instância
      let savedState = loadInstanceState(generatedInstanceName);
      
      if (savedState && savedState.created) {
        console.log("Instância já foi criada anteriormente, verificando status...");
        
        // Verificar se a instância ainda existe e está ativa
        const config = await evolutionApi.getActiveConfig();
        if (!config) throw new Error("Configuração não encontrada");
        
        evolutionApi.setCredentials(config.api_url, config.global_key);
        
        try {
          const status = await evolutionApi.getInstanceStatus(generatedInstanceName);
          
          if (status.instance.state === "open") {
            // Instância já está conectada
            setCurrentStep("connected");
            toast.success("Instância já conectada!", {
              description: "Esta instância já estava ativa",
            });
            
            // Auto-finalizar após 2 segundos
            setTimeout(() => {
              handleFinishConnection();
            }, 2000);
            return;
          } else {
            console.log("Instância existe mas não está conectada, tentando obter QR code...");
            // Tentar obter QR code da instância existente
            const qrResult = await evolutionApi.connectInstance(generatedInstanceName);
            
            if (qrResult.qrcode?.base64) {
              console.log("QR Code obtido para instância existente");
              setQrCode(qrResult.qrcode.base64);
              
              toast.success("QR Code gerado", {
                description: "Escaneie o QR code com seu WhatsApp",
              });
              
              // Iniciar verificação de conexão
              startConnectionPolling(generatedInstanceName);
              return;
            }
          }
        } catch (statusError) {
          console.log("Instância salva não existe mais, criando nova...");
          // Se chegou aqui, a instância foi deletada, vamos criar uma nova
          clearInstanceState(generatedInstanceName);
          savedState = null;
        }
      }
      
      console.log("Criando nova instância:", generatedInstanceName);
      console.log("Número limpo:", cleanPhoneNumber);
      
      toast.info("Criando instância", {
        description: "Preparando conexão WhatsApp...",
      });
      
      // Criar instância
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Configuração não encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      try {
        const instanceResult = await evolutionApi.createInstance(generatedInstanceName, cleanPhoneNumber);
        console.log("Instância criada:", instanceResult);
        
        // Salvar estado indicando que a instância foi criada
        const newState: InstanceState = {
          instanceName: generatedInstanceName,
          connectionName,
          phoneNumber: cleanPhoneNumber,
          step: "qrcode",
          created: true
        };
        saveInstanceState(newState);
        
        toast.success("Instância criada", {
          description: "Instância criada com sucesso",
        });
        
      } catch (createError: any) {
        // Se o erro for de instância já existente, continuar normalmente
        if (createError.message?.includes("already exists") || createError.message?.includes("já existe")) {
          console.log("Instância já existe, continuando...");
          
          // Salvar estado indicando que a instância existe
          const newState: InstanceState = {
            instanceName: generatedInstanceName,
            connectionName,
            phoneNumber: cleanPhoneNumber,
            step: "qrcode", 
            created: true
          };
          saveInstanceState(newState);
          
          toast.info("Instância encontrada", {
            description: "Usando instância existente",
          });
        } else {
          throw createError;
        }
      }
      
      // Aguardar um pouco antes de tentar obter o QR code
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Tentar obter QR code
      let qrResult;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          console.log(`Tentativa ${attempts + 1} de obter QR code`);
          qrResult = await evolutionApi.connectInstance(generatedInstanceName);
          
          if (qrResult.qrcode?.base64) {
            console.log("QR Code obtido com sucesso");
            setQrCode(qrResult.qrcode.base64);
            
            // Atualizar estado com QR code
            const updatedState: InstanceState = {
              instanceName: generatedInstanceName,
              connectionName,
              phoneNumber: cleanPhoneNumber,
              step: "qrcode",
              qrCode: qrResult.qrcode.base64,
              created: true
            };
            saveInstanceState(updatedState);
            
            toast.success("QR Code gerado", {
              description: "Escaneie o QR code com seu WhatsApp",
            });
            
            // Iniciar verificação de conexão
            startConnectionPolling(generatedInstanceName);
            break;
          } else {
            console.log("QR Code não encontrado na resposta, tentando novamente...");
            attempts++;
            if (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        } catch (error) {
          console.error(`Erro na tentativa ${attempts + 1}:`, error);
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      if (!qrResult?.qrcode?.base64) {
        throw new Error("Não foi possível gerar o QR code após várias tentativas");
      }
      
    } catch (error) {
      console.error("Erro ao criar instância:", error);
      toast.error("Erro ao criar conexão", {
        description: error instanceof Error ? error.message : "Ocorreu um erro"
      });
      setCurrentStep("form");
      setQrCode(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startConnectionPolling = (instanceName: string) => {
    console.log("Iniciando polling para instância:", instanceName);
    
    const pollInterval = setInterval(async () => {
      try {
        const config = await evolutionApi.getActiveConfig();
        if (!config) return;
        
        evolutionApi.setCredentials(config.api_url, config.global_key);
        const status = await evolutionApi.getInstanceStatus(instanceName);
        
        console.log("Status da instância:", status);
        
        if (status.instance.state === "open") {
          setCurrentStep("connected");
          clearInterval(pollInterval);
          
          // Atualizar estado para conectado e limpar QR code
          const finalState: InstanceState = {
            instanceName,
            connectionName,
            phoneNumber: extractPhoneNumbers(phoneNumber),
            step: "connected",
            created: true
          };
          saveInstanceState(finalState);
          
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
      phoneNumber: extractPhoneNumbers(phoneNumber)
    });
    
    // Limpar estado após finalizar conexão com sucesso
    clearInstanceState(instanceName);
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
                disabled={isSubmitting || !connectionName || !phoneNumber || !hasActiveConfig || extractPhoneNumbers(phoneNumber).length < 10}
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
