
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ConnectionsList from "@/components/whatsapp/ConnectionsList";
import QRCodeScanner from "@/components/whatsapp/QRCodeScanner";
import { Connection, ConnectionStatus } from "@/components/settings/types";

interface ConnectionPanelProps {
  connections: Connection[];
  activeConnection: Connection | null;
  qrCode: string | null;
  connectionStatus: ConnectionStatus;
  currentStep: "create" | "qrcode" | "connect";
  isLoading: boolean;
  onAddConnectionClick: () => void;
  handleConnect: (connection: Connection) => void;
  handleDisconnect: () => void;
  handleDeleteConnection: (connectionId: string) => void;
  handleConfirmConnection: () => void;
}

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  connections,
  activeConnection,
  qrCode,
  connectionStatus,
  currentStep,
  isLoading,
  onAddConnectionClick,
  handleConnect,
  handleDisconnect,
  handleDeleteConnection,
  handleConfirmConnection
}) => {
  const showQRScanner = qrCode && (connectionStatus === "connecting" || currentStep === "qrcode");

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>Conexões WhatsApp</CardTitle>
        <CardDescription>
          Gerencie suas conexões WhatsApp para começar a receber e enviar mensagens
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {showQRScanner ? (
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
            handleDeleteConnection={handleDeleteConnection}
            onAddConnectionClick={onAddConnectionClick}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default ConnectionPanel;
