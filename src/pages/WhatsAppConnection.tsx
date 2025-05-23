
import React from "react";
import WhatsAppConnectionForm from "@/components/whatsapp/WhatsAppConnectionForm";
import WhatsAppConnectionActions from "@/components/whatsapp/WhatsAppConnectionActions";
import WhatsAppResources from "@/components/whatsapp/WhatsAppResources";
import ConnectionStatus from "@/components/whatsapp/ConnectionStatus";
import { useWhatsAppConnectionManager } from "@/components/whatsapp/WhatsAppConnectionManager";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

const WhatsAppConnection = () => {
  const {
    connectionStatus,
    qrCode,
    instanceName,
    webhookUrl,
    setInstanceName,
    setWebhookUrl,
    handleConnect,
    handleGenerateQRCode,
    handleDisconnect,
    handleConfirmConnection
  } = useWhatsAppConnectionManager();

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Integração WhatsApp</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <WhatsAppConnectionForm
          instanceName={instanceName}
          webhookUrl={webhookUrl}
          onInstanceNameChange={setInstanceName}
          onWebhookUrlChange={setWebhookUrl}
        />
        
        <Card>
          <CardHeader>
            <CardTitle>Status da Conexão</CardTitle>
            <CardDescription>
              Informações sobre a sua conexão atual com WhatsApp
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <ConnectionStatus status={connectionStatus} />
          </CardContent>
        </Card>
      </div>
      
      <div className="mt-6">
        <WhatsAppConnectionActions
          connectionStatus={connectionStatus}
          qrCode={qrCode}
          instanceName={instanceName}
          onConnect={handleConnect}
          onGenerateQRCode={handleGenerateQRCode}
          onDisconnect={handleDisconnect}
          onConfirmConnection={handleConfirmConnection}
        />
      </div>
      
      <WhatsAppResources connectionStatus={connectionStatus} />
    </div>
  );
};

export default WhatsAppConnection;
