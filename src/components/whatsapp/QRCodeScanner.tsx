
import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Settings } from "lucide-react";
import { ConnectionStatus } from "@/components/settings/types";

interface QRCodeScannerProps {
  qrCode: string | null;
  connectionStatus: ConnectionStatus;
  currentStep?: "create" | "qrcode" | "connect";
  onDisconnect: () => void;
  onConfirmConnection: () => void;
}

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({ 
  qrCode, 
  connectionStatus,
  currentStep = "create",
  onDisconnect,
  onConfirmConnection
}) => {
  
  const renderStepIndicator = () => {
    const steps = [
      { key: "create", label: "Criar Instância", icon: Settings },
      { key: "qrcode", label: "QR Code", icon: CheckCircle },
      { key: "connect", label: "Conectar", icon: CheckCircle }
    ];
    
    return (
      <div className="flex items-center justify-center mb-6">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.key === currentStep;
          const isCompleted = steps.findIndex(s => s.key === currentStep) > index;
          
          return (
            <React.Fragment key={step.key}>
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                isActive 
                  ? 'bg-primary text-primary-foreground' 
                  : isCompleted 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-600'
              }`}>
                {isActive && connectionStatus === "connecting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span>{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-2 ${
                  isCompleted ? 'bg-green-500' : 'bg-gray-300'
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center">
      {/* Indicador de progresso */}
      {connectionStatus === "connecting" && renderStepIndicator()}
      
      {connectionStatus === "connecting" && currentStep === "create" && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="text-center">Criando instância na Evolution API...</p>
          <p className="text-sm text-muted-foreground">Aguarde enquanto configuramos sua conexão</p>
        </div>
      )}
      
      {connectionStatus === "connecting" && currentStep === "qrcode" && !qrCode && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="text-center">Gerando QR code...</p>
          <p className="text-sm text-muted-foreground">Preparando código para escaneamento</p>
        </div>
      )}
      
      {qrCode && connectionStatus === "connecting" && currentStep === "qrcode" && (
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
            <p className="text-sm text-muted-foreground mb-4">
              Abra o WhatsApp no seu celular, toque em Menu ou Configurações e selecione WhatsApp Web. 
              Aponte a câmera do seu celular para esta tela para capturar o código.
            </p>
            <div className="space-y-2">
              <p className="text-xs text-blue-600 font-medium">
                ⏳ Aguardando escaneamento...
              </p>
              <Button 
                variant="outline" 
                onClick={onDisconnect} 
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {connectionStatus === "connecting" && currentStep === "connect" && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="text-center">Estabelecendo conexão...</p>
          <p className="text-sm text-muted-foreground">QR Code escaneado, conectando ao WhatsApp</p>
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
            Sua conexão Evolution API está ativa e pronta para uso.
          </p>
          <Button variant="destructive" onClick={onDisconnect}>Desconectar</Button>
        </div>
      )}
    </div>
  );
};

export default QRCodeScanner;
