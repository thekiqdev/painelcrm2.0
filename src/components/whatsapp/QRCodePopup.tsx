
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, CheckCircle2, InfoIcon, AlertTriangle, Settings } from "lucide-react";
import { connectionDatabaseService } from "@/services/whatsapp/connectionDatabaseService";
import { evolutionQRService } from "@/services/whatsapp/evolutionQRService";
import { evolutionApi } from "@/services/evolutionApi";
import { toast } from "sonner";

interface QRCodePopupProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  onConnect: () => void;
}

const QRCodePopup: React.FC<QRCodePopupProps> = ({
  isOpen,
  onClose,
  connectionId,
  onConnect,
}) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [instanceStatus, setInstanceStatus] = useState<any>(null);
  const [diagnosticInfo, setDiagnosticInfo] = useState<string>("");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  useEffect(() => {
    if (isOpen && connectionId) {
      console.log("QRCodePopup aberto para conexão:", connectionId);
      generateQRCode();
    }
  }, [isOpen, connectionId]);

  const runDiagnostics = async (instanceName: string) => {
    try {
      console.log("Executando diagnósticos para:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Configuração não encontrada");
      }

      let diagnostics = `=== DIAGNÓSTICO DA INSTÂNCIA ===\n`;
      diagnostics += `Instância: ${instanceName}\n`;
      diagnostics += `API URL: ${config.api_url}\n`;
      diagnostics += `Hora: ${new Date().toLocaleString()}\n\n`;

      // Teste 1: Verificar conectividade com a API
      try {
        const healthResponse = await fetch(`${config.api_url}/`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        diagnostics += `${healthResponse.ok ? '✓' : '✗'} Conectividade com API: ${healthResponse.status}\n`;
        
        if (!healthResponse.ok) {
          diagnostics += `  Erro: API não está respondendo corretamente\n`;
        }
      } catch (error) {
        diagnostics += `✗ Erro de conectividade: ${error}\n`;
      }

      // Teste 2: Verificar se a instância existe na lista
      try {
        const listResponse = await fetch(`${config.api_url}/instance/fetchInstances`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.global_key || ''
          }
        });
        
        if (listResponse.ok) {
          const instances = await listResponse.json();
          const instanceExists = instances.some((instance: any) => 
            instance.instance?.instanceName === instanceName || 
            instance.instanceName === instanceName
          );
          
          diagnostics += `${instanceExists ? '✓' : '✗'} Instância encontrada na lista: ${instanceExists ? 'SIM' : 'NÃO'}\n`;
          diagnostics += `  Total de instâncias na API: ${instances.length}\n`;
          
          if (instanceExists) {
            const instanceData = instances.find((instance: any) => 
              instance.instance?.instanceName === instanceName || 
              instance.instanceName === instanceName
            );
            diagnostics += `  Estado: ${instanceData?.instance?.state || instanceData?.state || 'indefinido'}\n`;
            diagnostics += `  Status: ${instanceData?.status || 'indefinido'}\n`;
          }
        } else {
          diagnostics += `✗ Erro ao listar instâncias: ${listResponse.status}\n`;
          const errorText = await listResponse.text();
          diagnostics += `  Detalhes: ${errorText}\n`;
        }
      } catch (error) {
        diagnostics += `✗ Erro ao listar instâncias: ${error}\n`;
      }

      // Teste 3: Verificar status específico
      try {
        const status = await evolutionApi.getInstanceStatus(instanceName);
        diagnostics += `✓ Status específico obtido:\n`;
        diagnostics += `  Estado: ${status?.instance?.state || 'indefinido'}\n`;
        diagnostics += `  Status geral: ${status?.status || 'indefinido'}\n`;
        setInstanceStatus(status);
      } catch (error) {
        diagnostics += `✗ Erro ao obter status: ${error}\n`;
      }

      setDiagnosticInfo(diagnostics);
      setShowDiagnostics(true);

    } catch (error) {
      console.error("Erro nos diagnósticos:", error);
      setDiagnosticInfo(`Erro ao executar diagnósticos: ${error}`);
      setShowDiagnostics(true);
    }
  };

  const restartInstance = async (instanceName: string) => {
    try {
      setIsRestarting(true);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Configuração não encontrada");
      }

      console.log("Reiniciando instância:", instanceName);
      
      const restartResponse = await fetch(`${config.api_url}/instance/restart/${instanceName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.global_key || ''
        }
      });

      if (restartResponse.ok) {
        const result = await restartResponse.json();
        console.log("Instância reiniciada:", result);
        
        toast.success("Instância reiniciada", {
          description: "Aguardando reinicialização completa...",
        });

        // Aguardar alguns segundos antes de tentar novamente
        setTimeout(() => {
          setIsRestarting(false);
          setErrorMessage("");
          setShowDiagnostics(false);
          generateQRCode();
        }, 5000);
        
      } else {
        const errorText = await restartResponse.text();
        throw new Error(`Erro ao reiniciar: ${restartResponse.status} - ${errorText}`);
      }
      
    } catch (error) {
      console.error("Erro ao reiniciar instância:", error);
      setIsRestarting(false);
      
      toast.error("Erro ao reiniciar", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  const generateQRCode = async () => {
    if (!connectionId) {
      setErrorMessage("ID da conexão não fornecido");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setQrCode(null);
    setShowDiagnostics(false);
    
    try {
      console.log("Gerando QR code para conexão:", connectionId);
      
      // Buscar a conexão no banco de dados
      const connections = await connectionDatabaseService.getConnections();
      const connection = connections.find(c => c.id === connectionId);
      
      if (!connection) {
        throw new Error("Conexão não encontrada no banco de dados");
      }
      
      console.log("Dados da conexão encontrada:", connection);
      
      // Verificar se tem instance_name
      if (!connection.instance_name) {
        throw new Error("Nome da instância não encontrado na conexão. Verifique se a instância foi criada corretamente na Evolution API.");
      }
      
      console.log("Chamando evolutionQRService com instance_name:", connection.instance_name);
      
      const result = await evolutionQRService.getEvolutionQRCode(connection.instance_name);
      
      console.log("Resultado do evolutionQRService:", result);
      
      if (result.success) {
        if (result.qrCode === "already_connected" || result.status === "connected") {
          setIsConnected(true);
          toast.success("Já conectado!", {
            description: "Esta instância já estava conectada",
          });
          return;
        }
        
        if (result.qrCode) {
          setQrCode(result.qrCode);
          toast.success("QR Code gerado", {
            description: "Escaneie o QR code com seu WhatsApp",
          });
          
          // Iniciar verificação de conexão
          startConnectionPolling(connection.instance_name);
        } else {
          throw new Error("QR Code não foi retornado pela API");
        }
      } else {
        throw new Error(result.message || "Erro ao gerar QR code");
      }
      
    } catch (error) {
      console.error("Erro detalhado ao gerar QR code:", error);
      const errorMsg = error instanceof Error ? error.message : "Erro desconhecido ao gerar QR code";
      setErrorMessage(errorMsg);
      
      toast.error("Erro ao gerar QR Code", {
        description: errorMsg
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startConnectionPolling = async (instanceName: string) => {
    const pollInterval = setInterval(async () => {
      try {
        console.log("Verificando status da conexão para:", instanceName);
        
        const result = await evolutionQRService.getEvolutionQRCode(instanceName);
        
        if (result.success && result.status === "connected") {
          console.log("Conexão estabelecida!");
          setIsConnected(true);
          clearInterval(pollInterval);
          
          // Atualizar status no banco
          const connections = await connectionDatabaseService.getConnections();
          const connection = connections.find(c => c.instance_name === instanceName);
          
          if (connection) {
            await connectionDatabaseService.updateConnection(connection.id, {
              status: "connected",
              qr_code: null
            });
          }
          
          toast.success("Conectado com sucesso!", {
            description: "WhatsApp foi conectado com sucesso",
          });
          
          // Auto-conectar após 2 segundos
          setTimeout(() => {
            onConnect();
          }, 2000);
        }
      } catch (error) {
        console.error("Erro ao verificar conexão:", error);
      }
    }, 3000);
    
    // Timeout após 5 minutos
    setTimeout(() => {
      clearInterval(pollInterval);
      if (!isConnected) {
        setErrorMessage("QR Code expirou. Tente gerar novamente.");
        toast.error("QR Code expirado", {
          description: "O QR Code expirou após 5 minutos. Gere um novo."
        });
      }
    }, 300000);
  };

  const handleRetry = () => {
    setErrorMessage("");
    setIsConnected(false);
    setShowDiagnostics(false);
    generateQRCode();
  };

  const handleClose = () => {
    setQrCode(null);
    setIsConnected(false);
    setErrorMessage("");
    setShowDiagnostics(false);
    onClose();
  };

  const handleDiagnostics = async () => {
    const connections = await connectionDatabaseService.getConnections();
    const connection = connections.find(c => c.id === connectionId);
    
    if (connection?.instance_name) {
      await runDiagnostics(connection.instance_name);
    }
  };

  const handleRestart = async () => {
    const connections = await connectionDatabaseService.getConnections();
    const connection = connections.find(c => c.id === connectionId);
    
    if (connection?.instance_name) {
      await restartInstance(connection.instance_name);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isConnected ? "Conectado!" : "Escaneie o QR Code"}
          </DialogTitle>
          <DialogDescription>
            {isConnected 
              ? "Sua conta WhatsApp foi conectada com sucesso"
              : "Use seu celular para escanear o QR code e conectar o WhatsApp"
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center py-6 space-y-4">
          {isLoading && !isRestarting && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <p className="text-center">Gerando QR code...</p>
            </div>
          )}

          {isRestarting && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-16 w-16 animate-spin text-orange-500" />
              <p className="text-center">Reiniciando instância...</p>
              <p className="text-sm text-muted-foreground text-center">
                Aguarde enquanto a instância é reiniciada
              </p>
            </div>
          )}
          
          {qrCode && !isConnected && (
            <div className="flex flex-col items-center gap-4">
              <div className="border-4 border-white rounded-lg shadow-lg">
                <img 
                  src={`data:image/png;base64,${qrCode}`} 
                  alt="QR Code para conexão WhatsApp" 
                  className="w-[200px] h-[200px]" 
                />
              </div>
              <div className="text-center max-w-sm">
                <p className="text-sm text-muted-foreground">
                  Abra o WhatsApp no seu celular, toque em Menu ou Configurações e selecione WhatsApp Web. 
                  Aponte a câmera do seu celular para esta tela para capturar o código.
                </p>
                <p className="text-xs text-blue-600 font-medium mt-2">
                  ⏳ Aguardando escaneamento...
                </p>
              </div>
            </div>
          )}
          
          {isConnected && (
            <div className="flex flex-col items-center gap-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <p className="text-center text-lg font-medium">WhatsApp Conectado!</p>
              <Alert>
                <InfoIcon className="h-4 w-4 mr-2" />
                <AlertDescription>
                  A conexão será finalizada automaticamente em alguns segundos.
                </AlertDescription>
              </Alert>
            </div>
          )}
          
          {errorMessage && (
            <div className="flex flex-col items-center gap-4 w-full">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {errorMessage}
                </AlertDescription>
              </Alert>
              
              <div className="flex flex-col gap-2 w-full">
                <p className="text-sm text-muted-foreground text-center">
                  Opções de recuperação disponíveis:
                </p>
                
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDiagnostics}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Diagnóstico
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRestart}
                    disabled={isRestarting}
                  >
                    {isRestarting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Reiniciar
                  </Button>
                </div>
              </div>

              {showDiagnostics && (
                <div className="w-full">
                  <Alert>
                    <InfoIcon className="h-4 w-4" />
                    <AlertDescription>
                      <pre className="whitespace-pre-wrap text-xs mt-2 max-h-40 overflow-y-auto">
                        {diagnosticInfo}
                      </pre>
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter>
          {!isConnected && !isLoading && !isRestarting && (
            <Button variant="outline" onClick={handleRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar Novamente
            </Button>
          )}
          
          {isConnected ? (
            <Button onClick={onConnect} className="w-full">
              Finalizar Conexão
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QRCodePopup;
