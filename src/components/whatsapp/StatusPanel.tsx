
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ConnectionStatus from "@/components/whatsapp/ConnectionStatus";
import { ConnectionStatusType } from "@/components/settings/types";

interface StatusPanelProps {
  connectionStatus: ConnectionStatusType;
  activeConnection: any | null;
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
        
        {connectionStatus === "connected" && (
          <Alert className="mt-4">
            <AlertDescription>
              Para manter sua sessão ativa, não desconecte o WhatsApp Web do seu dispositivo móvel.
            </AlertDescription>
          </Alert>
        )}
        
        {connectionStatus === "disconnected" && !activeConnection && (
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
