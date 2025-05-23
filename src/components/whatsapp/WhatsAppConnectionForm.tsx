
import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { QrCode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface WhatsAppConnectionFormProps {
  instanceName: string;
  webhookUrl: string;
  onInstanceNameChange: (value: string) => void;
  onWebhookUrlChange: (value: string) => void;
}

const WhatsAppConnectionForm: React.FC<WhatsAppConnectionFormProps> = ({
  instanceName,
  webhookUrl,
  onInstanceNameChange,
  onWebhookUrlChange
}) => {
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          <span>Conectar WhatsApp</span>
        </CardTitle>
        <CardDescription>
          Conecte sua conta WhatsApp usando a Evolution API
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="instanceName">Nome da Instância</Label>
            <Input 
              id="instanceName" 
              placeholder="Nome da sua instância Evolution" 
              value={instanceName}
              onChange={(e) => onInstanceNameChange(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">URL do Webhook (opcional)</Label>
            <Input 
              id="webhookUrl" 
              placeholder="URL para receber notificações da Evolution API" 
              value={webhookUrl}
              onChange={(e) => onWebhookUrlChange(e.target.value)}
            />
          </div>
          
          <Alert className="mt-2">
            <AlertDescription>
              Para usar a Evolution API, configure primeiro as credenciais em Configurações {">"} WhatsApp {">"} Evolution API.
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>
    </Card>
  );
};

export default WhatsAppConnectionForm;
