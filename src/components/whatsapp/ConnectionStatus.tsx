
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface ConnectionStatusProps {
  status: "disconnected" | "connecting" | "connected";
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  const getStatusDetails = () => {
    switch (status) {
      case "connected":
        return {
          label: "Conectado",
          color: "bg-green-500",
          textColor: "text-green-500",
          progress: 100,
          description: "WhatsApp conectado e operacional."
        };
      case "connecting":
        return {
          label: "Conectando",
          color: "bg-yellow-500",
          textColor: "text-yellow-500",
          progress: 50,
          description: "Aguardando escaneamento do QR code."
        };
      default:
        return {
          label: "Desconectado",
          color: "bg-gray-400",
          textColor: "text-gray-400",
          progress: 0,
          description: "WhatsApp não está conectado."
        };
    }
  };

  const details = getStatusDetails();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">Status:</span>
        <Badge 
          variant="outline" 
          className={`${details.textColor} border-current`}
        >
          {details.label}
        </Badge>
      </div>
      
      <Progress value={details.progress} className="h-2" />
      
      <div className="pt-2">
        <h4 className="font-medium mb-1">Detalhes</h4>
        <p className="text-sm text-muted-foreground">
          {details.description}
        </p>
        
        {status === "connected" && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Mensagens disponíveis</span>
              <span className="font-medium">Ilimitadas</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Tipo de conexão</span>
              <span className="font-medium">WhatsApp Web</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;
