
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ConnectionStatus as ConnectionStatusType } from "@/components/settings/types";

interface ConnectionStatusProps {
  status: ConnectionStatusType;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  const getStatusDetails = () => {
    switch (status) {
      case "connected":
        return {
          label: "Conectado",
          color: "bg-emerald-500",
          textColor: "text-emerald-700 dark:text-emerald-300",
          progress: 100,
          description: "WhatsApp conectado e operacional.",
        };
      case "connecting":
        return {
          label: "Conectando",
          color: "bg-amber-500",
          textColor: "text-amber-700 dark:text-amber-300",
          progress: 50,
          description: "Aguardando escaneamento do QR code.",
        };
      case "awaiting_scan":
        return {
          label: "Aguardando QR",
          color: "bg-orange-500",
          textColor: "text-orange-700 dark:text-orange-300",
          progress: 75,
          description: "QR Code gerado, aguardando escaneamento.",
        };
      case "created":
        return {
          label: "Criada",
          color: "bg-primary",
          textColor: "text-primary",
          progress: 25,
          description: "Instância criada, aguardando geração do QR code.",
        };
      default:
        return {
          label: "Desconectado",
          color: "bg-muted-foreground/40",
          textColor: "text-muted-foreground",
          progress: 0,
          description: "WhatsApp não está conectado.",
        };
    }
  };

  const details = getStatusDetails();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">Status:</span>
        <Badge variant="outline" className={`${details.textColor} border-border`}>
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
