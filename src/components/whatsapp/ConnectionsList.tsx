
import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { Connection, ConnectionStatus } from "@/components/settings/types";

interface ConnectionsListProps {
  connections: Connection[];
  isLoading: boolean;
  handleConnect: (connection: Connection) => void;
  handleDisconnect: () => void;
  onAddConnectionClick: () => void;
}

const ConnectionsList: React.FC<ConnectionsListProps> = ({
  connections,
  isLoading,
  handleConnect,
  handleDisconnect,
  onAddConnectionClick,
}) => {
  if (connections.length === 0) {
    return (
      <div className="text-center p-6 border rounded-md">
        <p className="text-muted-foreground mb-4">
          Você ainda não tem conexões WhatsApp configuradas.
        </p>
        <Button onClick={onAddConnectionClick}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Conexão
        </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {connections.map((connection) => (
        <Card key={connection.id} className="overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <div>
              <h3 className="font-medium">{connection.name}</h3>
              <p className="text-sm text-muted-foreground">
                Tipo: {connection.type === "qrcode" ? "QR Code" : connection.type === "evolution" ? "Evolution API" : "WhatsApp Web.js"}
              </p>
            </div>
            
            <div>
              {connection.status === "disconnected" ? (
                <Button 
                  size="sm" 
                  onClick={() => handleConnect(connection)}
                  disabled={isLoading}
                >
                  Conectar
                </Button>
              ) : connection.status === "connecting" ? (
                <Button size="sm" disabled>Conectando...</Button>
              ) : (
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={handleDisconnect}
                  disabled={isLoading}
                >
                  Desconectar
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
      
      <div className="flex justify-center mt-4">
        <Button onClick={onAddConnectionClick} variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Outra Conexão
        </Button>
      </div>
    </div>
  );
};

export default ConnectionsList;
