
import React, { useState, useEffect } from "react";
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
import { InfoIcon, AlertCircle } from "lucide-react";
import { ConnectionType } from "@/components/settings/types";
import { evolutionApi } from "@/services/evolutionApi";
import { toast } from "sonner";

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
  const [evolutionInstanceName, setEvolutionInstanceName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasActiveConfig, setHasActiveConfig] = useState(false);
  const [availableInstances, setAvailableInstances] = useState<string[]>([]);
  const [isLoadingInstances, setIsLoadingInstances] = useState(false);
  
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const config = await evolutionApi.getActiveConfig();
        setHasActiveConfig(!!config);
        
        if (config) {
          // Se tiver configuração, tenta listar as instâncias disponíveis
          setIsLoadingInstances(true);
          try {
            evolutionApi.setCredentials(config.api_url, config.global_key);
            const instances = await evolutionApi.listInstances();
            setAvailableInstances(instances);
          } catch (error) {
            console.error("Erro ao listar instâncias:", error);
          } finally {
            setIsLoadingInstances(false);
          }
        }
      } catch (error) {
        console.error("Erro ao verificar configuração:", error);
      }
    };
    
    if (isOpen && connectionType === "evolution") {
      checkConfig();
    }
  }, [isOpen, connectionType]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (connectionType === "evolution" && !hasActiveConfig) {
      toast.error("Configuração necessária", {
        description: "Configure primeiro a Evolution API em Configurações."
      });
      return;
    }
    
    setIsSubmitting(true);
    
    let configData = {};
    if (connectionType === "evolution") {
      configData = {
        instanceName: evolutionInstanceName
      };
    }
    
    onAddConnection(connectionName, connectionType, configData);
    
    // Reset form
    setConnectionName("");
    setConnectionType("qrcode");
    setEvolutionInstanceName("");
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
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
                    {!hasActiveConfig ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4 mr-2" />
                        <AlertDescription>
                          Você precisa configurar a Evolution API primeiro em Configurações {">"} WhatsApp {">"} Configurações Evolution API.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <>
                        <Alert>
                          <InfoIcon className="h-4 w-4 mr-2" />
                          <AlertDescription>
                            Conecte usando a Evolution API configurada
                          </AlertDescription>
                        </Alert>
                    
                        <div className="grid gap-2">
                          <Label htmlFor="evolutionInstanceName">Nome da Instância</Label>
                          <div className="flex gap-2">
                            <Input
                              list="instancesList"
                              id="evolutionInstanceName"
                              placeholder="Nome da instância (ex: whatsapp)"
                              value={evolutionInstanceName}
                              onChange={(e) => setEvolutionInstanceName(e.target.value)}
                              required={connectionType === "evolution"}
                            />
                          </div>
                          
                          {availableInstances.length > 0 && (
                            <datalist id="instancesList">
                              {availableInstances.map((instance) => (
                                <option key={instance} value={instance} />
                              ))}
                            </datalist>
                          )}
                          
                          {isLoadingInstances && (
                            <p className="text-xs text-muted-foreground">Carregando instâncias disponíveis...</p>
                          )}
                          
                          {availableInstances.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {availableInstances.length} instâncias disponíveis. Selecione uma da lista ou crie uma nova.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={
                isSubmitting || 
                !connectionName || 
                (connectionType === "evolution" && (!evolutionInstanceName || !hasActiveConfig))
              }
            >
              {isSubmitting ? "Adicionando..." : "Adicionar Conexão"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddConnectionDialog;
