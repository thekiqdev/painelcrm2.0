
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ConnectionStatus from "@/components/whatsapp/ConnectionStatus";
import { ConnectionStatus as ConnectionStatusType, Connection } from "@/components/settings/types";

interface StatusPanelProps {
  connectionStatus: ConnectionStatusType;
  activeConnection: Connection | null;
}

const StatusPanel: React.FC<StatusPanelProps> = ({ 
  connectionStatus,
  activeConnection
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status da Conexão</CardTitle>
        <CardDescription>
          Informações sobre a sua conexão atual com WhatsApp
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <ConnectionStatus status={connectionStatus} />
        
        {connectionStatus === "connected" && activeConnection && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Nome da conexão</span>
              <span className="font-medium">{activeConnection.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Tipo de conexão</span>
              <span className="font-medium">
                {activeConnection.type === "evolution" 
                  ? "Evolution API" 
                  : activeConnection.type === "webjs"
                    ? "WhatsApp Web.js"
                    : "QR Code"}
              </span>
            </div>
            <Alert className="mt-4">
              <AlertDescription>
                Para manter sua sessão ativa, não desconecte o WhatsApp Web do seu dispositivo móvel.
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        {connectionStatus === "disconnected" && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              WhatsApp não está conectado.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StatusPanel;
