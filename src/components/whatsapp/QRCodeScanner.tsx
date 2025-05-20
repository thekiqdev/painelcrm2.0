
import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface QRCodeScannerProps {
  qrCode: string | null;
  connectionStatus: "disconnected" | "connecting" | "connected";
  onDisconnect: () => void;
}

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({ 
  qrCode, 
  connectionStatus,
  onDisconnect
}) => {
  return (
    <div className="flex flex-col items-center">
      {connectionStatus === "connecting" && !qrCode && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p>Gerando QR code, aguarde...</p>
        </div>
      )}
      
      {qrCode && connectionStatus === "connecting" && (
        <div className="flex flex-col items-center gap-6">
          <div className="border-8 border-white rounded-lg shadow-lg">
            <img 
              src={`data:image/png;base64,${qrCode}`} 
              alt="QR Code para conexão WhatsApp" 
              className="w-[250px] h-[250px]" 
            />
          </div>
          <div className="text-center max-w-sm">
            <h3 className="font-medium mb-2">Escaneie o código QR</h3>
            <p className="text-sm text-muted-foreground">
              Abra o WhatsApp no seu celular, toque em Menu ou Configurações e selecione WhatsApp Web. 
              Aponte a câmera do seu celular para esta tela para capturar o código.
            </p>
          </div>
          <Button variant="outline" onClick={onDisconnect}>Cancelar</Button>
        </div>
      )}
      
      {connectionStatus === "connected" && (
        <div className="flex flex-col items-center gap-4">
          <div className="bg-green-100 text-green-800 rounded-full p-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h2 className="text-xl font-medium">WhatsApp Conectado</h2>
          <p className="text-center text-muted-foreground mb-4">
            Seu WhatsApp está conectado e pronto para uso.
          </p>
          <Button variant="destructive" onClick={onDisconnect}>Desconectar</Button>
        </div>
      )}
    </div>
  );
};

export default QRCodeScanner;
