
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import QRCodeScanner from "@/components/whatsapp/QRCodeScanner";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type ConnectionStatus = "disconnected" | "connecting" | "connected";

interface WhatsAppConnectionActionsProps {
  connectionStatus: ConnectionStatus;
  qrCode: string | null;
  instanceName: string;
  onConnect: () => void;
  onGenerateQRCode: () => void;
  onDisconnect: () => void;
  onConfirmConnection: () => void;
}

const WhatsAppConnectionActions: React.FC<WhatsAppConnectionActionsProps> = ({
  connectionStatus,
  qrCode,
  instanceName,
  onConnect,
  onGenerateQRCode,
  onDisconnect,
  onConfirmConnection
}) => {
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const handleGenerateQRCode = async () => {
    try {
      setIsGeneratingQR(true);
      setQrError(null);
      await onGenerateQRCode();
    } catch (error) {
      console.error("Erro ao gerar QR code:", error);
      setQrError(error instanceof Error ? error.message : "Erro desconhecido ao gerar QR code");
      toast.error("Erro ao gerar QR code", {
        description: "Houve um problema ao tentar gerar o QR code"
      });
    } finally {
      setIsGeneratingQR(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 mt-4">
      {connectionStatus === "disconnected" && !qrCode && (
        <div className="flex gap-2">
          <Button 
            onClick={onConnect}
            disabled={!instanceName}
          >
            Criar Instância
          </Button>
          {instanceName && (
            <Button 
              onClick={handleGenerateQRCode}
              disabled={!instanceName || isGeneratingQR}
              variant="outline"
            >
              {isGeneratingQR ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando QR Code...
                </>
              ) : (
                "Gerar QR Code"
              )}
            </Button>
          )}
        </div>
      )}
      
      {connectionStatus === "connecting" && qrCode && (
        <QRCodeScanner 
          qrCode={qrCode} 
          connectionStatus={connectionStatus} 
          onDisconnect={onDisconnect} 
          onConfirmConnection={onConfirmConnection} 
        />
      )}
      
      {connectionStatus === "connected" && (
        <Button variant="destructive" onClick={onDisconnect}>
          Desconectar
        </Button>
      )}
      
      {connectionStatus === "connecting" && !qrCode && isGeneratingQR && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p>Gerando QR code, aguarde...</p>
        </div>
      )}
      
      {qrError && (
        <div className="flex flex-col items-center gap-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-800">
            <h4 className="font-medium mb-1">Erro ao gerar QR code</h4>
            <p className="text-sm">{qrError}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2" 
              onClick={handleGenerateQRCode}
            >
              Tentar novamente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppConnectionActions;
