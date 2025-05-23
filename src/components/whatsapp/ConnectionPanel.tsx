
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Connection, ConnectionStatus } from "@/components/settings/types";
import QRCodeScanner from "@/components/whatsapp/QRCodeScanner";
import ConnectionsList from "@/components/whatsapp/ConnectionsList";

interface ConnectionPanelProps {
  connections: Connection[];
  activeConnection: Connection | null;
  qrCode: string | null;
  connectionStatus: ConnectionStatus;
  isLoading: boolean;
  onAddConnectionClick: () => void;
  handleConnect: (connection: Connection) => void;
  handleDisconnect: () => void;
  handleConfirmConnection: () => void;
}

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  connections,
  activeConnection,
  qrCode,
  connectionStatus,
  isLoading,
  onAddConnectionClick,
  handleConnect,
  handleDisconnect,
  handleConfirmConnection,
}) => {
  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl">WhatsApp</CardTitle>
          <CardDescription>
            Conecte sua conta WhatsApp para gerenciar mensagens e atendimentos
          </CardDescription>
        </div>
        
        {connections.length === 0 && (
          <Button onClick={onAddConnectionClick}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Conexão
          </Button>
        )}
      </CardHeader>
      
      <CardContent>
        {activeConnection && qrCode ? (
          <QRCodeScanner 
            qrCode={qrCode} 
            connectionStatus={connectionStatus} 
            onDisconnect={handleDisconnect}
            onConfirmConnection={handleConfirmConnection}
          />
        ) : (
          <ConnectionsList 
            connections={connections}
            isLoading={isLoading}
            handleConnect={handleConnect}
            handleDisconnect={handleDisconnect}
            onAddConnectionClick={onAddConnectionClick}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default ConnectionPanel;
