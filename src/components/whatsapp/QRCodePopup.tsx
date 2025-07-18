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
  const [pairingCode, setPairingCode] = useState<string | null>(null);
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

  // Função para processar o base64 do QR Code
  const processQRCodeBase64 = (base64Data: string): string => {
    console.info("🔍 QRCodePopup: ===== PROCESSAMENTO BASE64 =====");
    console.info("🔍 QRCodePopup: Base64 recebido (bruto):", base64Data);
    console.info("🔍 QRCodePopup: Tipo do dado:", typeof base64Data);
    console.info("🔍 QRCodePopup: Tamanho original:", base64Data?.length || 0);
    
    if (!base64Data || base64Data.trim() === '') {
      console.error("❌ QRCodePopup: Base64 vazio ou undefined");
      return '';
    }

    // Análise detalhada dos caracteres
    console.info("🔍 QRCodePopup: ===== ANÁLISE DE CARACTERES =====");
    console.info("🔍 QRCodePopup: Primeiros 100 chars:", base64Data.substring(0, 100));
    console.info("🔍 QRCodePopup: Últimos 100 chars:", base64Data.substring(base64Data.length - 100));
    console.info("🔍 QRCodePopup: Contém espaços?", base64Data.includes(' '));
    console.info("🔍 QRCodePopup: Contém quebras de linha?", base64Data.includes('\n') || base64Data.includes('\r'));
    console.info("🔍 QRCodePopup: Contém tabs?", base64Data.includes('\t'));

    // Limpar o base64
    let cleanBase64 = base64Data.trim().replace(/[\r\n\t\s]/g, '');
    console.info("🔍 QRCodePopup: Base64 após limpeza:", cleanBase64);
    console.info("🔍 QRCodePopup: Tamanho após limpeza:", cleanBase64.length);
    console.info("🔍 QRCodePopup: Primeiros 200 caracteres limpos:", cleanBase64.substring(0, 200));
    console.info("🔍 QRCodePopup: Últimos 50 caracteres limpos:", cleanBase64.slice(-50));
    
    // Verificar padrões conhecidos
    console.info("🔍 QRCodePopup: ===== VERIFICAÇÃO DE PADRÕES =====");
    console.info("🔍 QRCodePopup: Começa com 'data:image/'?", cleanBase64.startsWith('data:image/'));
    console.info("🔍 QRCodePopup: Começa com número@?", /^\d+@/.test(cleanBase64));
    console.info("🔍 QRCodePopup: Contém '@'?", cleanBase64.includes('@'));
    console.info("🔍 QRCodePopup: Contém '='?", cleanBase64.includes('='));
    console.info("🔍 QRCodePopup: Contém ','?", cleanBase64.includes(','));
    console.info("🔍 QRCodePopup: É formato WhatsApp (número@)?", /^\d+@.*/.test(cleanBase64));
    
    // Verificar se é Base64 válido ou dados WhatsApp
    const isValidBase64 = /^[A-Za-z0-9+/]*=*$/.test(cleanBase64);
    const isWhatsAppData = /^[A-Za-z0-9+/=@,]+$/.test(cleanBase64);
    console.info("🔍 QRCodePopup: É base64 tradicional?", isValidBase64);
    console.info("🔍 QRCodePopup: É dados WhatsApp válidos?", isWhatsAppData);
    
    // Se já tem prefixo data:image, retornar como está
    if (cleanBase64.startsWith('data:image/')) {
      console.info("✅ QRCodePopup: Base64 já tem prefixo data:image");
      return cleanBase64;
    }
    
    // IMPORTANTE: Não adicionar prefixo data:image se for dados do WhatsApp
    if (cleanBase64.includes('@') && !cleanBase64.startsWith('data:')) {
      console.info("🔍 QRCodePopup: Detectados dados do WhatsApp (contém @)");
      console.info("🔍 QRCodePopup: ⚠️ ESTE NÃO É UM BASE64 DE IMAGEM!");
      console.info("🔍 QRCodePopup: ⚠️ São dados de sessão do WhatsApp que devem ser convertidos em QR Code");
      
      // Para dados do WhatsApp, precisamos gerar um QR Code a partir dos dados
      console.error("❌ QRCodePopup: Dados recebidos são de sessão WhatsApp, não uma imagem");
      return '';
    }
    
    // Verificar se parece com Base64 de imagem
    if (isValidBase64 && cleanBase64.length > 100) {
      console.info("✅ QRCodePopup: Parece ser Base64 de imagem válido");
      console.info("✅ QRCodePopup: Adicionando prefixo data:image/png;base64");
      
      // Tentar detectar o tipo de imagem pelos primeiros bytes
      try {
        const firstBytes = atob(cleanBase64.substring(0, 12));
        let imageType = 'png'; // padrão
        
        if (firstBytes.startsWith('\x89PNG')) {
          imageType = 'png';
          console.info("🔍 QRCodePopup: Tipo detectado: PNG");
        } else if (firstBytes.startsWith('\xFF\xD8\xFF')) {
          imageType = 'jpeg';
          console.info("🔍 QRCodePopup: Tipo detectado: JPEG");
        } else if (firstBytes.startsWith('GIF8')) {
          imageType = 'gif';
          console.info("🔍 QRCodePopup: Tipo detectado: GIF");
        } else {
          console.info("🔍 QRCodePopup: Tipo não detectado, usando PNG como padrão");
        }
        
        const finalBase64 = `data:image/${imageType};base64,${cleanBase64}`;
        console.info("🔍 QRCodePopup: Base64 final:", finalBase64.substring(0, 100) + "...");
        console.info("🔍 QRCodePopup: Tamanho final:", finalBase64.length);
        return finalBase64;
        
      } catch (e) {
        console.warn("⚠️ QRCodePopup: Erro ao detectar tipo de imagem, usando PNG:", e);
        const finalBase64 = `data:image/png;base64,${cleanBase64}`;
        console.info("🔍 QRCodePopup: Base64 final (PNG padrão):", finalBase64.substring(0, 100) + "...");
        return finalBase64;
      }
    }
    
    console.error("❌ QRCodePopup: Não foi possível processar o base64");
    console.error("❌ QRCodePopup: Dados não reconhecidos como Base64 de imagem válido");
    return '';
  };

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
        const connectivityTest = await evolutionApi.testApiConnectivity();
        diagnostics += `${connectivityTest.success ? '✓' : '✗'} Conectividade com API: ${connectivityTest.success ? 'OK' : connectivityTest.error}\n`;
        
        if (!connectivityTest.success) {
          diagnostics += `  Erro: API não está respondendo corretamente\n`;
          diagnostics += `  Verificar se a URL ${config.api_url} está correta\n`;
        }
      } catch (error) {
        diagnostics += `✗ Erro de conectividade: ${error}\n`;
      }

      // Teste 2: Verificar se consegue listar instâncias
      try {
        const instances = await evolutionApi.fetchInstances();
        console.log("🔍 DIAGNÓSTICO: Todas as instâncias encontradas:", instances);
        
        // Logs detalhados de cada instância
        instances.forEach((instance, index) => {
          console.log(`🔍 DIAGNÓSTICO: Instância ${index + 1}:`, {
            instanceName: instance.instance?.instanceName || instance.instanceName,
            name: instance.name,
            state: instance.instance?.state || instance.state,
            status: instance.status,
            objetoCompleto: instance
          });
        });
        
        const instanceExists = instances.some((instance: any) => {
          const instanceName1 = instance.instance?.instanceName;
          const instanceName2 = instance.instanceName;
          const instanceName3 = instance.name;
          
          console.log(`🔍 DIAGNÓSTICO: Comparando '${instanceName}' com:`, {
            instanceName1,
            instanceName2,
            instanceName3,
            match1: instanceName1 === instanceName,
            match2: instanceName2 === instanceName,
            match3: instanceName3 === instanceName
          });
          
          return instanceName1 === instanceName || 
                 instanceName2 === instanceName || 
                 instanceName3 === instanceName;
        });
        
        diagnostics += `${instanceExists ? '✓' : '✗'} Instância encontrada na lista: ${instanceExists ? 'SIM' : 'NÃO'}\n`;
        diagnostics += `  Total de instâncias na API: ${instances.length}\n`;
        
        if (instanceExists) {
          const instanceData = instances.find((instance: any) => 
            instance.instance?.instanceName === instanceName || 
            instance.instanceName === instanceName ||
            instance.name === instanceName
          );
          diagnostics += `  Estado: ${instanceData?.instance?.state || instanceData?.state || 'indefinido'}\n`;
          diagnostics += `  Status: ${instanceData?.status || 'indefinido'}\n`;
        } else {
          diagnostics += `  ⚠️  A instância '${instanceName}' não foi encontrada!\n`;
          diagnostics += `  Verificar se o nome está correto ou se precisa ser criada\n`;
          diagnostics += `  Nomes encontrados na API:\n`;
          instances.forEach((instance) => {
            diagnostics += `    - ${instance.instance?.instanceName || instance.instanceName || instance.name || 'sem nome'}\n`;
          });
        }
      } catch (error) {
        diagnostics += `✗ Erro ao listar instâncias: ${error}\n`;
        if (error instanceof Error && error.message.includes('404')) {
          diagnostics += `  ⚠️  Endpoint de listagem não encontrado\n`;
          diagnostics += `  Verificar se a URL da API está correta\n`;
        }
      }

      // Teste 3: Verificar status específico da instância
      try {
        const status = await evolutionApi.getInstanceStatus(instanceName);
        diagnostics += `✓ Status específico obtido:\n`;
        diagnostics += `  Estado: ${status?.instance?.state || 'indefinido'}\n`;
        diagnostics += `  Status geral: ${status?.status || 'indefinido'}\n`;
        setInstanceStatus(status);
      } catch (error) {
        diagnostics += `✗ Erro ao obter status: ${error}\n`;
        if (error instanceof Error && error.message.includes('404')) {
          diagnostics += `  ⚠️  Instância não responde - pode estar inativa\n`;
        }
      }

      // Teste 4: Verificar se consegue gerar QR Code (usando endpoint correto)
      try {
        console.log("🔍 DIAGNÓSTICO: ===== TESTANDO GERAÇÃO DE QR CODE =====");
        const qrResult = await evolutionApi.getQRCode(instanceName);
        console.log("🔍 DIAGNÓSTICO: Resultado completo do QR Code:", qrResult);
        
        if (qrResult.success) {
          diagnostics += `✓ QR Code (endpoint /instance/connect): ${qrResult.status === 'connected' ? 'Já conectado' : 'Gerado com sucesso'}\n`;
          
          // IMPORTANTE: Se o QR Code foi gerado com sucesso, a instância DEVE existir
          if (qrResult.status !== 'connected') {
            diagnostics += `  ⚠️  INCONSISTÊNCIA DETECTADA!\n`;
            diagnostics += `  ⚠️  QR Code gerado com sucesso, mas instância não foi encontrada na listagem\n`;
            diagnostics += `  ⚠️  Isso indica que:\n`;
            diagnostics += `  ⚠️  1. A instância existe e está funcionando\n`;
            diagnostics += `  ⚠️  2. O endpoint de listagem pode estar retornando dados incompletos\n`;
            diagnostics += `  ⚠️  3. O nome da instância pode estar em formato diferente na listagem\n`;
          }
          
          if (qrResult.pairingCode) {
            diagnostics += `  Código de Emparelhamento: ${qrResult.pairingCode}\n`;
          }
        } else {
          diagnostics += `✗ QR Code: ${qrResult.error || 'Erro desconhecido'}\n`;
        }
      } catch (error) {
        diagnostics += `✗ Erro ao obter QR Code: ${error}\n`;
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
      
      // Usar URL normalizada para evitar problemas de barras duplas
      const url = `${config.api_url.replace(/\/+$/, '')}/instance/restart/${instanceName}`;
      
      const restartResponse = await fetch(url, {
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
    setPairingCode(null);
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
      
      console.log("Resultado completo do evolutionQRService:", result);
      
      if (result.success) {
        if (result.qrCode === "already_connected" || result.status === "connected") {
          setIsConnected(true);
          toast.success("Já conectado!", {
            description: "Esta instância já estava conectada",
          });
          return;
        }
        
        if (result.qrCode) {
          console.log("QR Code recebido do service:", result.qrCode);
          
          // Processar o base64 corretamente
          const processedQRCode = processQRCodeBase64(result.qrCode);
          
          if (!processedQRCode || processedQRCode.trim() === '') {
            throw new Error("QR Code processado está vazio");
          }
          
          console.log("QR Code processado para exibição:", processedQRCode.substring(0, 100) + "...");
          
          setQrCode(processedQRCode);
          
          // Definir o código de emparelhamento se disponível
          if (result.pairingCode) {
            setPairingCode(result.pairingCode);
          }
          
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
              <div className="border-4 border-white rounded-lg shadow-lg bg-white p-2">
                <img 
                  src={qrCode} 
                  alt="QR Code para conexão WhatsApp" 
                  className="w-[200px] h-[200px] object-contain" 
                  onError={(e) => {
                    console.error("Erro ao carregar imagem do QR Code:", e);
                    console.error("URL da imagem que falhou:", qrCode);
                    console.error("Primeiros 200 caracteres:", qrCode?.substring(0, 200));
                    setErrorMessage("Erro ao carregar a imagem do QR Code. Tente gerar novamente.");
                  }}
                  onLoad={() => {
                    console.log("QR Code carregado com sucesso!");
                    console.log("Tamanho da URL:", qrCode?.length);
                  }}
                />
              </div>
              <div className="text-center max-w-sm">
                <p className="text-sm text-muted-foreground">
                  Abra o WhatsApp no seu celular, toque em Menu ou Configurações e selecione WhatsApp Web. 
                  Aponte a câmera do seu celular para esta tela para capturar o código.
                </p>
                {pairingCode && (
                  <Alert className="mt-4">
                    <InfoIcon className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Código de Emparelhamento:</strong> {pairingCode}
                      <br />
                      <span className="text-xs">Use este código se não conseguir escanear o QR code</span>
                    </AlertDescription>
                  </Alert>
                )}
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
