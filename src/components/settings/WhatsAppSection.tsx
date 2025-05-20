
import React from "react";
import AddConnectionDialog from "@/components/whatsapp/AddConnectionDialog";
import ConnectionPanel from "@/components/whatsapp/ConnectionPanel";
import StatusPanel from "@/components/whatsapp/StatusPanel";
import AdvancedSettings from "@/components/whatsapp/AdvancedSettings";
import useWhatsAppConnection from "@/components/whatsapp/useWhatsAppConnection";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, PhoneCall } from "lucide-react";

export const WhatsAppSection = () => {
  const {
    connections,
    activeConnection,
    connectionStatus,
    qrCode,
    isLoading,
    isDialogOpen,
    setIsDialogOpen,
    handleAddConnection,
    handleConnect,
    handleDisconnect,
    handleConfirmConnection
  } = useWhatsAppConnection();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ConnectionPanel
          connections={connections}
          activeConnection={activeConnection}
          qrCode={qrCode}
          connectionStatus={connectionStatus}
          isLoading={isLoading}
          onAddConnectionClick={() => setIsDialogOpen(true)}
          handleConnect={handleConnect}
          handleDisconnect={handleDisconnect}
          handleConfirmConnection={handleConfirmConnection}
        />
        
        <StatusPanel 
          connectionStatus={connectionStatus} 
          activeConnection={activeConnection} 
        />
      </div>
      
      {connectionStatus === "connected" && (
        <>
          <AdvancedSettings />
          
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
        </>
      )}
      
      <AddConnectionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onAddConnection={handleAddConnection}
      />
    </div>
  );
};

export default WhatsAppSection;
