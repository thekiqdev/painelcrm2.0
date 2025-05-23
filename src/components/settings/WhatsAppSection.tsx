
import React, { useState } from "react";
import AddConnectionDialog from "@/components/whatsapp/AddConnectionDialog";
import ConnectionPanel from "@/components/whatsapp/ConnectionPanel";
import StatusPanel from "@/components/whatsapp/StatusPanel";
import AdvancedSettings from "@/components/whatsapp/AdvancedSettings";
import EvolutionApiConfigComponent from "@/components/whatsapp/EvolutionApiConfig";
import useWhatsAppConnection from "@/components/whatsapp/useWhatsAppConnection";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, PhoneCall, Settings } from "lucide-react";

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

  const [activeTab, setActiveTab] = useState("connections");
  const showResourcesSection = connections.length > 0;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="connections" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="connections">Conexões</TabsTrigger>
          <TabsTrigger value="evolution">Evolution API</TabsTrigger>
          <TabsTrigger value="settings">Configurações Avançadas</TabsTrigger>
        </TabsList>
        
        <TabsContent value="connections" className="pt-4 space-y-6">
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
          
          {showResourcesSection && (
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
        
        <TabsContent value="evolution" className="pt-4">
          <EvolutionApiConfigComponent />
        </TabsContent>
        
        <TabsContent value="settings" className="pt-4">
          <AdvancedSettings />
        </TabsContent>
      </Tabs>
      
      <AddConnectionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onAddConnection={handleAddConnection}
      />
    </div>
  );
};

export default WhatsAppSection;
