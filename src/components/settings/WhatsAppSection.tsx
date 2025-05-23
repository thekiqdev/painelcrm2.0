
import React, { useState } from "react";
import ConnectionsList from "@/components/whatsapp/ConnectionsList";
import SimpleConnectionDialog from "@/components/whatsapp/SimpleConnectionDialog";
import EvolutionApiConfigComponent from "@/components/whatsapp/EvolutionApiConfig";
import useWhatsAppConnection from "@/components/whatsapp/useWhatsAppConnection";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, PhoneCall } from "lucide-react";
import QRCodeScanner from "@/components/whatsapp/QRCodeScanner";

export const WhatsAppSection = () => {
  const {
    connections,
    activeConnection,
    connectionStatus,
    qrCode,
    isLoading,
    handleConnect,
    handleDisconnect,
    handleConfirmConnection
  } = useWhatsAppConnection();

  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("connections");
  const showResourcesSection = connections.length > 0;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="connections" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="connections">Conexões</TabsTrigger>
          <TabsTrigger value="settings">Configurações API</TabsTrigger>
        </TabsList>
        
        <TabsContent value="connections" className="pt-4 space-y-6">
          {/* Mostrar QR Code se estiver conectando */}
          {connectionStatus === "connecting" && qrCode && (
            <Card>
              <CardHeader>
                <CardTitle>Escaneie o QR Code</CardTitle>
                <CardDescription>
                  Use seu WhatsApp para escanear o código abaixo
                </CardDescription>
              </CardHeader>
              <CardContent>
                <QRCodeScanner 
                  qrCode={qrCode}
                  connectionStatus={connectionStatus}
                  onDisconnect={handleDisconnect}
                  onConfirmConnection={handleConfirmConnection}
                />
              </CardContent>
            </Card>
          )}
          
          {/* Lista de Conexões */}
          {(!qrCode || connectionStatus !== "connecting") && (
            <ConnectionsList
              connections={connections}
              isLoading={isLoading}
              handleConnect={handleConnect}
              handleDisconnect={handleDisconnect}
              onAddConnectionClick={() => setShowConnectionDialog(true)}
            />
          )}
          
          {/* Recursos Disponíveis */}
          {showResourcesSection && connectionStatus === "connected" && (
            <Card>
              <CardHeader>
                <CardTitle>Recursos Disponíveis</CardTitle>
                <CardDescription>
                  Gerencie suas conversas e atendimentos via WhatsApp
                </CardDescription>
              </CardHeader>
              
              <CardContent>
                <Tabs defaultValue="messages">
                  <TabsList className="mb-4">
                    <TabsTrigger value="messages">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Mensagens
                    </TabsTrigger>
                    <TabsTrigger value="calls">
                      <PhoneCall className="h-4 w-4 mr-2" />
                      Chamadas
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="messages">
                    <div className="p-6 text-center border rounded-md">
                      <p className="text-muted-foreground">
                        As mensagens do WhatsApp aparecerão aqui após a conexão completa com a API.
                      </p>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="calls">
                    <div className="p-6 text-center border rounded-md">
                      <p className="text-muted-foreground">
                        O histórico de chamadas aparecerá aqui quando a integração estiver completa.
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="settings" className="pt-4">
          <EvolutionApiConfigComponent />
        </TabsContent>
      </Tabs>

      {/* Dialog para Nova Conexão */}
      <SimpleConnectionDialog
        open={showConnectionDialog}
        onOpenChange={setShowConnectionDialog}
        onConnect={handleConnect}
        isLoading={isLoading}
      />
    </div>
  );
};

export default WhatsAppSection;
