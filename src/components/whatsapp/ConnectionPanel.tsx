
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, QrCode } from "lucide-react";

interface Connection {
  id: string;
  name: string;
  type: string;
  status: string;
  configData?: {
    instanceName?: string;
  };
}

interface ConnectionPanelProps {
  connections: Connection[];
  activeConnection: Connection | null;
  qrCode: string | null;
  connectionStatus: "disconnected" | "connecting" | "connected";
  isLoading: boolean;
  handleConnect: (connection: Connection | { id: string; name: string; type: string; configData: { instanceName: string } }) => void;
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

  const handleSubmitNewConnection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceName.trim()) return;
    
    const newConnection = {
      id: `conn_${Date.now()}`,
      name: `Evolution API: ${instanceName}`,
      type: "evolution",
      configData: {
        instanceName
      }
    };
    
    handleConnect(newConnection);
    setInstanceName("");
  };
  
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Conexão WhatsApp</CardTitle>
        <CardDescription>
          Conecte o WhatsApp usando a Evolution API
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
                Forneça um nome para sua instância da Evolution API
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
                  Conectando...
                </>
              ) : (
                "Conectar WhatsApp"
              )}
            </Button>
          </form>
        )}
      </CardContent>
      
      {connectionStatus !== "disconnected" && connections.length > 0 && (
        <CardFooter className="flex-col border-t pt-4">
          <p className="text-xs text-muted-foreground mb-2">
            Conexões disponíveis: {connections.length}
          </p>
        </CardFooter>
      )}
    </Card>
  );
};

export default ConnectionPanel;
