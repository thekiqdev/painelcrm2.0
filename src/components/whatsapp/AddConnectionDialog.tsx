
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon } from "lucide-react";
import { ConnectionType, ConnectionStatus } from "@/components/settings/types";

interface AddConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddConnection: (connectionName: string, connectionType: string, configData?: any) => void;
}

const AddConnectionDialog: React.FC<AddConnectionDialogProps> = ({
  isOpen,
  onClose,
  onAddConnection,
}) => {
  const [connectionName, setConnectionName] = useState("");
  const [connectionType, setConnectionType] = useState<ConnectionType>("qrcode");
  const [evolutionApiKey, setEvolutionApiKey] = useState("");
  const [evolutionInstanceId, setEvolutionInstanceId] = useState("");
  const [evolutionInstanceName, setEvolutionInstanceName] = useState("");
  const [evolutionWebhookUrl, setEvolutionWebhookUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsSubmitting(true);
    
    let configData = {};
    if (connectionType === "evolution") {
      configData = {
        apiKey: evolutionApiKey,
        instanceId: evolutionInstanceId,
        instanceName: evolutionInstanceName,
        webhookUrl: evolutionWebhookUrl
      };
    }
    
    onAddConnection(connectionName, connectionType, configData);
    
    // Reset form
    setConnectionName("");
    setConnectionType("qrcode");
    setEvolutionApiKey("");
    setEvolutionInstanceId("");
    setEvolutionInstanceName("");
    setEvolutionWebhookUrl("");
    setIsSubmitting(false);
  };

  const generateWebhookUrl = () => {
    const baseUrl = window.location.origin;
    const sanitizedName = connectionName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const webhookUrl = `${baseUrl}/api/evolution-webhook/${sanitizedName}`;
    setEvolutionWebhookUrl(webhookUrl);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Adicionar Nova Conexão WhatsApp</DialogTitle>
          <DialogDescription>
            Crie uma nova conexão WhatsApp para sua conta. Você poderá gerenciar múltiplas conexões.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="connectionName">Nome da Conexão</Label>
              <Input
                id="connectionName"
                placeholder="Ex: WhatsApp Principal"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label>Método de Conexão</Label>
              <Tabs 
                defaultValue="qrcode" 
                value={connectionType} 
                onValueChange={(value) => setConnectionType(value as "qrcode" | "evolution" | "webjs")}
                className="w-full"
              >
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="qrcode">Via QR Code</TabsTrigger>
                  <TabsTrigger value="webjs">Via WhatsApp Web.js</TabsTrigger>
                  <TabsTrigger value="evolution">Via Evolution API</TabsTrigger>
                </TabsList>
                
                <TabsContent value="qrcode" className="pt-4">
                  <Alert>
                    <InfoIcon className="h-4 w-4 mr-2" />
                    <AlertDescription>
                      Conecte escaneando um QR code com seu celular
                    </AlertDescription>
                  </Alert>
                </TabsContent>
                
                <TabsContent value="webjs" className="pt-4">
                  <Alert>
                    <InfoIcon className="h-4 w-4 mr-2" />
                    <AlertDescription>
                      Use a biblioteca WhatsApp Web.js para conectar
                    </AlertDescription>
                  </Alert>
                </TabsContent>
                
                <TabsContent value="evolution" className="pt-4">
                  <div className="space-y-4">
                    <Alert>
                      <InfoIcon className="h-4 w-4 mr-2" />
                      <AlertDescription>
                        Conecte usando a Evolution API (requer credenciais separadas)
                      </AlertDescription>
                    </Alert>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="evolutionApiKey">API Key</Label>
                      <Input
                        id="evolutionApiKey"
                        placeholder="Sua chave API da Evolution"
                        value={evolutionApiKey}
                        onChange={(e) => setEvolutionApiKey(e.target.value)}
                        required={connectionType === "evolution"}
                      />
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="evolutionInstanceName">Nome da Instância</Label>
                      <Input
                        id="evolutionInstanceName"
                        placeholder="Nome da instância (ex: whatsapp)"
                        value={evolutionInstanceName}
                        onChange={(e) => setEvolutionInstanceName(e.target.value)}
                        required={connectionType === "evolution"}
                      />
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="evolutionInstanceId">ID da Instância</Label>
                      <Input
                        id="evolutionInstanceId"
                        placeholder="ID da instância"
                        value={evolutionInstanceId}
                        onChange={(e) => setEvolutionInstanceId(e.target.value)}
                        required={connectionType === "evolution"}
                      />
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="evolutionWebhookUrl">URL do Webhook (para receber mensagens)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="evolutionWebhookUrl"
                          placeholder="URL do webhook para receber notificações"
                          value={evolutionWebhookUrl}
                          onChange={(e) => setEvolutionWebhookUrl(e.target.value)}
                        />
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={generateWebhookUrl}
                          disabled={!connectionName}
                        >
                          Gerar
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Esta URL deve ser configurada na Evolution API para receber eventos e mensagens.
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !connectionName || (connectionType === "evolution" && (!evolutionApiKey || !evolutionInstanceName || !evolutionInstanceId))}>
              {isSubmitting ? "Adicionando..." : "Adicionar Conexão"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddConnectionDialog;
