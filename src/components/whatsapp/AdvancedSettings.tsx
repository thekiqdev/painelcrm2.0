
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AdvancedSettings: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações Avançadas</CardTitle>
        <CardDescription>
          Configurações adicionais para sua integração WhatsApp
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="templates">
          <TabsList className="mb-4">
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="autoresponder">Respostas Automáticas</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          </TabsList>
          
          <TabsContent value="templates">
            <div className="p-6 text-center border rounded-md">
              <p className="text-muted-foreground">
                Configure templates de mensagens para enviar aos seus clientes.
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="autoresponder">
            <div className="p-6 text-center border rounded-md">
              <p className="text-muted-foreground">
                Configure respostas automáticas para mensagens recebidas.
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="webhooks">
            <div className="p-6 text-center border rounded-md">
              <p className="text-muted-foreground">
                Configure webhooks para receber notificações de novas mensagens.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AdvancedSettings;
