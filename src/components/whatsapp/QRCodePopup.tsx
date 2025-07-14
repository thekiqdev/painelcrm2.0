
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
import { Loader2, RefreshCw, CheckCircle2, InfoIcon } from "lucide-react";
import { connectionDatabaseService } from "@/services/whatsapp/connectionDatabaseService";
import { evolutionQRService } from "@/services/whatsapp/evolutionQRService";
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

  useEffect(() => {
    if (isOpen && connectionId) {
      generateQRCode();
    }
  }, [isOpen, connectionId]);

  const generateQRCode = async () => {
    setIsLoading(true);
    setErrorMessage("");
    setQrCode(null);
    
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
        throw new Error("Nome da instância não encontrado na conexão");
      }
      
      console.log("Chamando evolutionQRService com instance_name:", connection.instance_name);
      
      const result = await evolutionQRService.getEvolutionQRCode(connection.instance_name);
      
      if (result.success) {
        if (result.qrCode === "already_connected") {
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
        }
      } else {
        throw new Error(result.error || "Erro ao gerar QR code");
      }
      
    } catch (error) {
      console.error("Erro ao gerar QR code:", error);
      setErrorMessage(error instanceof Error ? error.message : "Erro ao gerar QR code");
    } finally {
      setIsLoading(false);
    }
  };

  const startConnectionPolling = async (instanceName: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const connections = await connectionDatabaseService.getConnections();
        const connection = connections.find(c => c.instance_name === instanceName);
        
        if (!connection) {
          console.error("Conexão não encontrada durante polling");
          return;
        }
        
        const result = await evolutionQRService.getEvolutionQRCode(instanceName);
        
        if (result.success && result.status === "connected") {
          setIsConnected(true);
          clearInterval(pollInterval);
          
          // Atualizar status no banco
          await connectionDatabaseService.updateConnection(connection.id, {
            status: "connected",
            qr_code: null
          });
          
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
      }
    }, 300000);
  };

  const handleRetry = () => {
    generateQRCode();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[450px]">
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
        
        <div className="flex flex-col items-center py-6">
          {isLoading && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <p className="text-center">Gerando QR code...</p>
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
            <div className="flex flex-col items-center gap-4">
              <Alert variant="destructive">
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
              Gerar Novo QR Code
            </Button>
          )}
          
          {isConnected ? (
            <Button onClick={onConnect} className="w-full">
              Finalizar Conexão
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QRCodePopup;
