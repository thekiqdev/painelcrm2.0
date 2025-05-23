
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, CheckCircle2, QrCode } from "lucide-react";
import { Connection, ConnectionStatus } from "@/components/whatsapp/useWhatsAppConnection";
import { whatsappService } from "@/services/whatsapp";
import { toast } from "sonner";

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
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDeleteConnection = async (connection: Connection, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!connection.configData?.instanceName) return;
    
    setIsDeleting(connection.id);
    try {
      // Deletar a instância no Evolution API
      await whatsappService.deleteEvolutionInstance(connection.configData.instanceName);
      
      // Remover da lista local
      const updatedConnections = connections.filter(c => c.id !== connection.id);
      localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
      
      // Recarregar a página para atualizar a lista
      window.location.reload();
      
      toast.success("Conexão excluída com sucesso!");
    } catch (error) {
      console.error("Erro ao excluir conexão:", error);
      toast.error("Erro ao excluir conexão", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsDeleting(null);
    }
  };

  const handleGenerateQrCode = async (connection: Connection, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!connection.configData?.instanceName) return;
    
    try {
      await whatsappService.getEvolutionQRCode(connection.configData.instanceName);
      handleConnect(connection);
    } catch (error) {
      console.error("Erro ao gerar QR code:", error);
      toast.error("Erro ao gerar QR code", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  // Render empty state
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
        <Card 
          key={connection.id} 
          className="overflow-hidden hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center justify-between p-4">
            <div>
              <h3 className="font-medium">{connection.name}</h3>
              <p className="text-sm text-muted-foreground">
                Instância: {connection.configData?.instanceName || "N/A"}
              </p>
              <p className="text-sm text-muted-foreground">
                Status: {connection.status === "connected" ? "Conectado" : 
                        connection.status === "connecting" ? "Conectando" : "Desconectado"}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {connection.status === "connected" && (
                <span className="flex items-center text-green-500 text-sm mr-2">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Conectado
                </span>
              )}
              
              {connection.status === "disconnected" && (
                <Button 
                  size="sm" 
                  onClick={(e) => handleGenerateQrCode(connection, e)}
                  disabled={isLoading}
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  Conectar
                </Button>
              )}
              
              {connection.status === "connecting" && (
                <Button size="sm" disabled>Conectando...</Button>
              )}
              
              {connection.status === "connected" && (
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDisconnect();
                  }}
                  disabled={isLoading}
                >
                  Desconectar
                </Button>
              )}
              
              <Button
                size="sm"
                variant="destructive"
                onClick={(e) => handleDeleteConnection(connection, e)}
                disabled={isDeleting === connection.id}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}
      
      <div className="flex justify-center mt-4">
        <Button onClick={onAddConnectionClick} variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Nova Conexão
        </Button>
      </div>
    </div>
  );
};

export default ConnectionsList;
