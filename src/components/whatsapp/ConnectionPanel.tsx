
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, QrCode, Trash2 } from "lucide-react";
import { Connection, ConnectionStatus } from "@/components/whatsapp/useWhatsAppConnection";
import { toast } from "sonner";
import { whatsappService } from "@/services/whatsapp";

interface ConnectionPanelProps {
  connections: Connection[];
  activeConnection: Connection | null;
  qrCode: string | null;
  connectionStatus: ConnectionStatus;
  isLoading: boolean;
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
  handleConnect,
  handleDisconnect,
  handleConfirmConnection
}) => {
  const [instanceName, setInstanceName] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);

  const handleSubmitNewConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceName.trim()) return;
    
    const newConnection: Connection = {
      id: `conn_${Date.now()}`,
      name: `WhatsApp: ${instanceName}`,
      type: "evolution",
      status: "disconnected",
      configData: {
        instanceName
      }
    };
    
    handleConnect(newConnection);
    setInstanceName("");
  };

  const handleDeleteConnection = async (connection: Connection) => {
    if (!connection.configData?.instanceName) return;
    
    setIsDeleting(connection.id);
    try {
      const config = await whatsappService.getEvolutionConfig();
      if (!config) {
        throw new Error("Configuração da Evolution API não encontrada");
      }
      
      // Tentar deletar a instância no Evolution API
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

  const handleGenerateQrCode = async (connection: Connection) => {
    if (!connection.configData?.instanceName) return;
    
    setIsGeneratingQr(true);
    try {
      const qrResult = await whatsappService.getEvolutionQRCode(connection.configData.instanceName);
      if (qrResult.qrcode?.base64) {
        // Atualizar o estado do QR code no componente pai
        handleConnect(connection);
      }
    } catch (error) {
      console.error("Erro ao gerar QR code:", error);
      toast.error("Erro ao gerar QR code", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsGeneratingQr(false);
    }
  };
  
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Conexões WhatsApp</CardTitle>
        <CardDescription>
          Gerencie suas conexões com a Evolution API
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-grow">
        {connectionStatus === "connected" ? (
          <div className="space-y-4">
            <div className="p-4 border rounded-lg text-center">
              <div className="inline-flex items-center justify-center p-2 bg-green-100 text-green-600 rounded-full mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3 className="text-base font-medium">WhatsApp conectado</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {activeConnection?.name || "Evolution API"} está conectada
              </p>
            </div>
            
            <div className="flex justify-center">
              <Button 
                variant="destructive"
                onClick={handleDisconnect}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Desconectando...
                  </>
                ) : (
                  "Desconectar WhatsApp"
                )}
              </Button>
            </div>
          </div>
        ) : connectionStatus === "connecting" && qrCode ? (
          <div className="space-y-4 text-center">
            <h3 className="text-sm font-medium">Escaneie o QR code com seu WhatsApp</h3>
            <div className="flex justify-center">
              <div className="border rounded-md p-3">
                <img 
                  src={`data:image/png;base64,${qrCode}`} 
                  alt="QR Code para conectar WhatsApp" 
                  className="w-48 h-48"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Abra o WhatsApp no seu celular, toque em "Três pontos" &gt; "Dispositivos vinculados" &gt; "Vincular um dispositivo".
            </p>
            <div className="flex justify-center mt-4">
              <Button 
                variant="secondary"
                onClick={handleConfirmConnection}
                disabled={isLoading}
                className="mr-2"
              >
                Conectado manualmente
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDisconnect}
                disabled={isLoading}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Formulário para nova conexão */}
            <form onSubmit={handleSubmitNewConnection} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="instanceName">Nome da Instância</Label>
                <Input
                  id="instanceName"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Ex: minha-instancia"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Forneça um nome único para sua instância do WhatsApp
                </p>
              </div>
              
              <Button 
                type="submit" 
                disabled={isLoading || !instanceName.trim()}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando Conexão...
                  </>
                ) : (
                  "Criar Nova Conexão"
                )}
              </Button>
            </form>

            {/* Lista de conexões existentes */}
            {connections.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Conexões Existentes</h4>
                {connections.map((connection) => (
                  <div key={connection.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{connection.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Status: {connection.status === "connected" ? "Conectado" : 
                                  connection.status === "connecting" ? "Conectando" : "Desconectado"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {connection.status === "disconnected" && (
                          <Button
                            size="sm"
                            onClick={() => handleGenerateQrCode(connection)}
                            disabled={isGeneratingQr}
                          >
                            {isGeneratingQr ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <QrCode className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteConnection(connection)}
                          disabled={isDeleting === connection.id}
                        >
                          {isDeleting === connection.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ConnectionPanel;
