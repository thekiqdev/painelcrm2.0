
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [isGeneratingQr, setIsGeneratingQr] = useState<string | null>(null);

  const handleDeleteConnection = async (connection: Connection, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!connection.configData?.instanceName) return;
    
    setIsDeleting(connection.id);
    try {
      await whatsappService.deleteEvolutionInstance(connection.configData.instanceName);
      
      const updatedConnections = connections.filter(c => c.id !== connection.id);
      localStorage.setItem('whatsapp_connections', JSON.stringify(updatedConnections));
      
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
    
    setIsGeneratingQr(connection.id);
    try {
      await whatsappService.getEvolutionQRCode(connection.configData.instanceName);
      handleConnect(connection);
    } catch (error) {
      console.error("Erro ao gerar QR code:", error);
      toast.error("Erro ao gerar QR code", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsGeneratingQr(null);
    }
  };

  const connectedConnection = connections.find(c => c.status === "connected");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Card de Conexão WhatsApp */}
      <Card>
        <CardHeader>
          <CardTitle>Conexão WhatsApp</CardTitle>
          <CardDescription>
            Conecte o WhatsApp usando a Evolution API
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {connectedConnection ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center p-3 bg-green-100 text-green-600 rounded-full mb-2">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-medium">WhatsApp conectado</h3>
              <p className="text-sm text-muted-foreground">
                Evolution API: {connectedConnection.configData?.instanceName} está conectada
              </p>
              
              <Button 
                variant="destructive"
                onClick={handleDisconnect}
                disabled={isLoading}
                className="w-full"
              >
                Desconectar WhatsApp
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground mb-4">
                Você ainda não tem conexões WhatsApp configuradas.
              </p>
              <Button onClick={onAddConnectionClick} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Conexão
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card de Status da Conexão */}
      <Card>
        <CardHeader>
          <CardTitle>Status da Conexão</CardTitle>
          <CardDescription>
            Informações sobre a sua conexão atual com WhatsApp
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Status:</span>
              <span className={`px-2 py-1 rounded-full text-xs ${
                connectedConnection 
                  ? "bg-green-100 text-green-800" 
                  : "bg-gray-100 text-gray-800"
              }`}>
                {connectedConnection ? "Conectado" : "Desconectado"}
              </span>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  connectedConnection ? "bg-green-500 w-full" : "bg-gray-400 w-0"
                }`}
              />
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Detalhes</h4>
              <p className="text-sm text-muted-foreground">
                {connectedConnection 
                  ? "WhatsApp conectado e operacional." 
                  : "WhatsApp não está conectado."
                }
              </p>
              
              {connectedConnection && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-sm">
                    <span>Mensagens disponíveis</span>
                    <span className="font-medium">Ilimitadas</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tipo de conexão</span>
                    <span className="font-medium">WhatsApp Web</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Nome da conexão</span>
                    <span className="font-medium">Evolution API: {connectedConnection.configData?.instanceName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tipo de conexão</span>
                    <span className="font-medium">Evolution API</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Lista de Conexões Existentes */}
      {connections.length > 0 && (
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Conexões Disponíveis</CardTitle>
              <CardDescription>
                Conexões disponíveis: {connections.length}
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-3">
                {connections.map((connection) => (
                  <div key={connection.id} className="flex items-center justify-between p-4 border rounded-lg">
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
                          disabled={isGeneratingQr === connection.id}
                        >
                          {isGeneratingQr === connection.id ? (
                            "Gerando..."
                          ) : (
                            <>
                              <QrCode className="h-4 w-4 mr-2" />
                              Conectar
                            </>
                          )}
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
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ConnectionsList;
