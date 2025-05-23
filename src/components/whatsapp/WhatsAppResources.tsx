
import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, PhoneCall } from "lucide-react";

interface WhatsAppResourcesProps {
  connectionStatus: "disconnected" | "connecting" | "connected";
}

const WhatsAppResources: React.FC<WhatsAppResourcesProps> = ({ connectionStatus }) => {
  if (connectionStatus !== "connected") {
    return null;
  }

  return (
    <Card className="mt-6">
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
  );
};

export default WhatsAppResources;
