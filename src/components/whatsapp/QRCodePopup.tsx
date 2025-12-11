import React, { useState, useEffect, useRef } from "react";
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
import { Loader2, RefreshCw, CheckCircle2, InfoIcon, AlertTriangle } from "lucide-react";
import { chatService } from "@/services/chat";
import { toast } from "sonner";

interface QRCodePopupProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  qrCode?: string | null;
  onConnect: () => void;
}

const QRCodePopup: React.FC<QRCodePopupProps> = ({
  isOpen,
  onClose,
  connectionId,
  qrCode: qrCodeProp,
  onConnect,
}) => {
  const [qrCode, setQrCode] = useState<string | null>(qrCodeProp || null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Limpar polling anterior
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    if (isOpen && qrCodeProp) {
      setQrCode(qrCodeProp);
      // Iniciar polling para verificar conexão
      pollIntervalRef.current = startConnectionPolling();
    } else if (isOpen && connectionId && !qrCodeProp) {
      // Se não tem QR code mas tem connectionId, tentar gerar
      generateQRCode();
    }
    
    // Cleanup: parar polling quando fechar ou mudar
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isOpen, connectionId, qrCodeProp]);

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
      console.log("Gerando QR code para instância:", connectionId);
      
      // Conectar instância e obter QR Code via backend
      const connectResponse = await chatService.connectInstance(connectionId);
      
      // O backend retorna o payload da UazAPI
      const qrData = connectResponse?.qrcode?.base64 || connectResponse?.code || connectResponse?.qrcode;
      const pairingCodeData = connectResponse?.pairingCode;
      
      if (connectResponse?.status === "open" || connectResponse?.instance?.state === "open") {
          setIsConnected(true);
          toast.success("Já conectado!", {
            description: "Esta instância já estava conectada",
          });
          return;
        }
        
      if (qrData) {
          // Processar o base64 corretamente
        const processedQRCode = processQRCodeBase64(typeof qrData === 'string' ? qrData : JSON.stringify(qrData));
          
          if (!processedQRCode || processedQRCode.trim() === '') {
            throw new Error("QR Code processado está vazio");
          }
          
          setQrCode(processedQRCode);
          
        if (pairingCodeData) {
          setPairingCode(pairingCodeData);
          }
          
          toast.success("QR Code gerado", {
            description: "Escaneie o QR code com seu WhatsApp",
          });
          
          // Iniciar verificação de conexão
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          pollIntervalRef.current = startConnectionPolling();
      } else {
        throw new Error("QR Code não foi retornado pela API");
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

  const startConnectionPolling = (): NodeJS.Timeout | null => {
    if (!connectionId) return null;
    
    let pollCount = 0;
    const maxPolls = 120; // Máximo de 6 minutos (120 * 3s)
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      // Parar após máximo de tentativas
      if (pollCount > maxPolls) {
        clearInterval(pollInterval);
        if (!isConnected) {
          setErrorMessage("QR Code expirou. Tente gerar novamente.");
          toast.error("QR Code expirado", {
            description: "O QR Code expirou após 6 minutos. Gere um novo."
          });
        }
        return;
      }
      
      try {
        const statusResponse = await chatService.getInstanceStatus(connectionId);
        const instanceData = statusResponse?.instance || statusResponse;
        const state = instanceData?.state || instanceData?.status || statusResponse?.status;
        const connected = statusResponse?.connected || instanceData?.connected;
        const loggedIn = statusResponse?.loggedIn || instanceData?.loggedIn;
        
        // Verificar se está conectado
        if (state === 'open' || state === 'connected' || connected === true || loggedIn === true) {
          setIsConnected(true);
          clearInterval(pollInterval);
          
          toast.success("Conectado com sucesso!", {
            description: "WhatsApp foi conectado com sucesso",
          });
          
          // Auto-fechar após 1 segundo
          setTimeout(() => {
            onConnect();
          }, 1000);
        }
      } catch (error) {
        // Silenciar erros - não logar para reduzir spam
      }
    }, 3000); // Manter 3s para QR code (mais crítico)
    
    return pollInterval;
  };

  const handleRetry = () => {
    setErrorMessage("");
    setIsConnected(false);
    generateQRCode();
  };

  const handleClose = () => {
    setQrCode(null);
    setIsConnected(false);
    setErrorMessage("");
    onClose();
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
          {isLoading && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <p className="text-center">Gerando QR code...</p>
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
              <CheckCircle2 className="h-16 w-16 text-green-500 animate-in fade-in zoom-in duration-300" />
              <p className="text-center text-lg font-medium">WhatsApp Conectado!</p>
              <Alert className="bg-green-50 border-green-200">
                <InfoIcon className="h-4 w-4 mr-2 text-green-600" />
                <AlertDescription className="text-green-800">
                  Conexão estabelecida com sucesso. Fechando...
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
            </div>
          )}
        </div>
        
        <DialogFooter>
          {!isConnected && !isLoading && (
            <Button variant="outline" onClick={handleRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar Novamente
            </Button>
          )}
          
          {isConnected ? (
            <Button onClick={onConnect} className="w-full" disabled>
              Fechando automaticamente...
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
