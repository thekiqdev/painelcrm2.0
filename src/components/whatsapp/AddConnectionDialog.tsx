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
  const [errorMessage, setErrorMessage] = useState("");
  
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

  // Função para salvar conexão no sistema
  const saveConnectionToSystem = (instanceData: any) => {
    const connections = JSON.parse(localStorage.getItem('whatsapp_connections') || '[]');
    const newConnection = {
      id: `conn_${Date.now()}`,
      name: connectionName,
      type: "evolution" as ConnectionType,
      status: "connecting",
      configData: {
        instanceName,
        phoneNumber: extractPhoneNumbers(phoneNumber),
        ...instanceData
      },
      createdAt: new Date().toISOString()
    };
    
    // Verificar se já existe uma conexão com o mesmo instanceName
    const existingIndex = connections.findIndex((conn: any) => 
      conn.configData?.instanceName === instanceName
    );
    
    if (existingIndex >= 0) {
      connections[existingIndex] = { ...connections[existingIndex], ...newConnection };
    } else {
      connections.push(newConnection);
    }
    
    localStorage.setItem('whatsapp_connections', JSON.stringify(connections));
    console.log("Conexão salva no sistema:", newConnection);
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
      setErrorMessage("");
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
      // Extrair apenas números do telefone
      const cleanPhoneNumber = extractPhoneNumbers(phoneNumber);
      
      // Limpar caracteres especiais do nome da conexão para criar o instanceName
      const cleanConnectionName = connectionName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const generatedInstanceName = `${cleanConnectionName}_${cleanPhoneNumber}`;
      setInstanceName(generatedInstanceName);
      
      console.log("Processando instância:", generatedInstanceName);
      
      // Obter configuração ativa
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Configuração não encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      // Verificar se já existe estado salvo para esta instância
      let savedState = loadInstanceState(generatedInstanceName);
      
      if (savedState && savedState.created) {
        console.log("Instância já criada anteriormente, verificando status...");
        
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
            console.log("Instância existe mas não está conectada, indo para QR code...");
            // Se instância já existe, ir direto para QR code sem mostrar tela de criação
            await obtainQRCodeDirectly(generatedInstanceName, config);
            return;
          }
        } catch (statusError) {
          console.log("Instância salva não existe mais, criando nova...");
          clearInstanceState(generatedInstanceName);
          savedState = null;
        }
      }
      
      // Verificar se a instância já existe na API antes de tentar criar
      try {
        console.log("Verificando se instância já existe na API...");
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
          // Instância existe mas não está conectada, ir direto para QR code
          console.log("Instância já existe na API, indo para QR code...");
          
          // Salvar estado indicando que a instância foi encontrada
          const newState: InstanceState = {
            instanceName: generatedInstanceName,
            connectionName,
            phoneNumber: cleanPhoneNumber,
            step: "qrcode",
            created: true
          };
          saveInstanceState(newState);
          
          // Salvar conexão no sistema
          saveConnectionToSystem({ instanceName: generatedInstanceName });
          
          await obtainQRCodeDirectly(generatedInstanceName, config);
          return;
        }
      } catch (statusError) {
        console.log("Instância não existe na API, criando nova...");
      }
      
      // Se chegou aqui, precisa criar nova instância
      console.log("Criando nova instância:", generatedInstanceName);
      setCurrentStep("creating");
      
      let instanceResult;
      try {
        instanceResult = await evolutionApi.createInstance(generatedInstanceName, cleanPhoneNumber);
        console.log("Instância criada:", instanceResult);
        
      } catch (createError: any) {
        // Se o erro for de instância já existente, continuar normalmente
        if (createError.message?.includes("already exists") || createError.message?.includes("já existe")) {
          console.log("Instância já existe, continuando...");
          instanceResult = { instanceName: generatedInstanceName };
        } else {
          throw createError;
        }
      }
      
      // Salvar estado indicando que a instância foi criada/encontrada
      const newState: InstanceState = {
        instanceName: generatedInstanceName,
        connectionName,
        phoneNumber: cleanPhoneNumber,
        step: "creating",
        created: true
      };
      saveInstanceState(newState);
      
      // Salvar conexão no sistema
      saveConnectionToSystem(instanceResult);
      
      // Aguardar 2 segundos na tela de criação e depois ir para QR code
      setTimeout(() => {
        obtainQRCodeDirectly(generatedInstanceName, config);
      }, 2000);
      
    } catch (error) {
      console.error("Erro ao processar instância:", error);
      setErrorMessage(error instanceof Error ? error.message : "Ocorreu um erro");
      setCurrentStep("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const obtainQRCodeDirectly = async (instanceName: string, config: any) => {
    console.log("Obtendo QR code diretamente para:", instanceName);
    setCurrentStep("qrcode");
    
    try {
      // Usar a nova implementação correta
      const qrResult = await evolutionApi.getQRCode(instanceName);
      console.log("Resultado do QR Code:", qrResult);
      
      if (qrResult?.qrcode?.base64) {
        console.log("QR Code obtido com sucesso!");
        setQrCode(qrResult.qrcode.base64);
        
        // Atualizar estado com QR code
        const updatedState: InstanceState = {
          instanceName,
          connectionName,
          phoneNumber: extractPhoneNumbers(phoneNumber),
          step: "qrcode",
          qrCode: qrResult.qrcode.base64,
          created: true
        };
        saveInstanceState(updatedState);
        
        toast.success("QR Code gerado", {
          description: "Escaneie o QR code com seu WhatsApp",
        });
        
        // Iniciar verificação de conexão
        startConnectionPolling(instanceName);
        return;
      }
      
      // Se chegou aqui, verificar se a instância já está conectada
      const status = await evolutionApi.getInstanceStatus(instanceName);
      console.log("Status da instância:", status);
      
      if (status.instance.state === "open") {
        console.log("Instância já está conectada!");
        setCurrentStep("connected");
        toast.success("Instância já conectada!", {
          description: "Esta instância já estava ativa",
        });
        
        // Auto-finalizar após 2 segundos
        setTimeout(() => {
          handleFinishConnection();
        }, 2000);
        return;
      }
      
      throw new Error("Não foi possível gerar o QR code. Verifique se a instância foi criada corretamente.");
      
    } catch (error) {
      console.error("Erro ao obter QR code:", error);
      setErrorMessage(error instanceof Error ? error.message : "Erro ao gerar QR code");
      setCurrentStep("error");
    }
  };

  const handleRetryQRCode = async () => {
    if (!instanceName) return;
    
    setErrorMessage("");
    setCurrentStep("qrcode");
    
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Configuração não encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      await obtainQRCodeDirectly(instanceName, config);
    } catch (error) {
      console.error("Erro ao tentar novamente:", error);
      setErrorMessage(error instanceof Error ? error.message : "Erro ao tentar novamente");
      setCurrentStep("error");
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
        console.error("Erro ao verificar conexão:", error);
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
    
    // Limpar estado após finalizar conexão com sucesso
    clearInstanceState(instanceName);
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
        return "Preparando sua instância no servidor...";
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
                  Uma instância será criada automaticamente para esta conexão e salva no sistema
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
                Preparando sua conexão no servidor Evolution API
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
