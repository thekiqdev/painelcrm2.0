
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Edit, CheckCircle2, Trash2, QrCode, RefreshCw } from "lucide-react";
import { Connection, ConnectionStatus } from "@/components/settings/types";
import { toast } from "@/components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConnectionsListProps {
  connections: Connection[];
  isLoading: boolean;
  handleConnect: (connection: Connection) => void;
  handleDisconnect: () => void;
  handleDeleteConnection: (connectionId: string) => void;
  onAddConnectionClick: () => void;
  onOpenQRPopup: (connectionId: string) => void;
}

const ConnectionsList: React.FC<ConnectionsListProps> = ({
  connections,
  isLoading,
  handleConnect,
  handleDisconnect,
  handleDeleteConnection,
  onAddConnectionClick,
  onOpenQRPopup,
}) => {
  const [editingConnection, setEditingConnection] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<string | null>(null);

  // Function to handle editing a connection
  const handleEditClick = (connectionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingConnection(connectionId);
    onAddConnectionClick();
  };

  // Function to handle delete confirmation
  const handleDeleteClick = (connectionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setConnectionToDelete(connectionId);
    setDeleteDialogOpen(true);
  };

  // Function to confirm deletion
  const confirmDelete = () => {
    if (connectionToDelete) {
      handleDeleteConnection(connectionToDelete);
      setConnectionToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  // Function to get display name for connection type
  const getConnectionTypeDisplay = (type: string) => {
    switch (type) {
      case "evolution":
        return "WhatsApp Web";
      case "qrcode":
        return "QR Code";
      case "webjs":
        return "WhatsApp Web.js";
      default:
        return "WhatsApp";
    }
  };

  const handleReconnectClick = (connectionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    console.log("Clicado em reconectar para conexão:", connectionId);
    onOpenQRPopup(connectionId);
  };

  // Function to get status display in Portuguese
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "created":
        return "Criada";
      case "awaiting_scan":
        return "Aguardando QR";
      case "connected":
        return "Conectada";
      case "disconnected":
        return "Desconectada";
      case "connecting":
        return "Conectando";
      default:
        return status;
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
    <>
      <div className="space-y-4">
        {connections.map((connection) => (
          <Card 
            key={connection.id} 
            className="overflow-hidden cursor-pointer hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center justify-between p-4">
              <div>
                <h3 className="font-medium">{connection.name}</h3>
                <p className="text-sm text-muted-foreground">
                  Tipo: {getConnectionTypeDisplay(connection.type)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Status: {getStatusDisplay(connection.status)}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                {connection.status === "connected" && (
                  <span className="flex items-center text-green-500 text-sm mr-2">
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Conectado
                  </span>
                )}
                
                {/* Botão para gerar QR Code para conexões criadas, desconectadas ou aguardando QR */}
                {(connection.status === "created" || 
                  connection.status === "disconnected" || 
                  connection.status === "awaiting_scan") && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={(e) => handleReconnectClick(connection.id, e)}
                    disabled={isLoading}
                  >
                    <QrCode className="h-4 w-4 mr-1" />
                    Conectar
                  </Button>
                )}
                
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={(e) => handleEditClick(connection.id, e)}
                >
                  <Edit className="h-4 w-4" />
                </Button>

                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={(e) => handleDeleteClick(connection.id, e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                
                {connection.status === "connecting" ? (
                  <Button size="sm" disabled>Conectando...</Button>
                ) : connection.status === "connected" ? (
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
                ) : null}
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Conexão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta conexão? Esta ação também removerá a instância da API e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ConnectionsList;
