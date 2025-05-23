
import React from "react";
import { Button } from "@/components/ui/button";
import QRCodeScanner from "@/components/whatsapp/QRCodeScanner";

interface WhatsAppConnectionActionsProps {
  connectionStatus: "disconnected" | "connecting" | "connected";
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
  return (
    <div className="flex justify-center gap-2 mt-4">
      {connectionStatus === "disconnected" && !qrCode ? (
        <div className="flex gap-2">
          <Button 
            onClick={onConnect}
            disabled={!instanceName}
          >
            Criar Instância
          </Button>
          {instanceName && (
            <Button 
              onClick={onGenerateQRCode}
              disabled={!instanceName}
              variant="outline"
            >
              Gerar QR Code
            </Button>
          )}
        </div>
      ) : connectionStatus === "connecting" && qrCode ? (
        <QRCodeScanner 
          qrCode={qrCode} 
          connectionStatus={connectionStatus} 
          onDisconnect={onDisconnect} 
          onConfirmConnection={onConfirmConnection} 
        />
      ) : connectionStatus === "connected" ? (
        <Button variant="destructive" onClick={onDisconnect}>
          Desconectar
        </Button>
      ) : null}
    </div>
  );
};

export default WhatsAppConnectionActions;
