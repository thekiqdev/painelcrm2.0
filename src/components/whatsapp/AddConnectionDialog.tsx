
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
import { PhoneInput } from "@/components/ui/phone-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, CheckCircle2, QrCode } from "lucide-react";
import { ConnectionType } from "@/components/settings/types";
import { evolutionApi } from "@/services/evolutionApi";
import { toast } from "sonner";
import { whatsappConnectionManager } from "@/services/whatsappConnectionManager";
import QRCodePopup from "./QRCodePopup";

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
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasActiveConfig, setHasActiveConfig] = useState(false);
  const [connectionId, setConnectionId] = useState("");
  const [isCreated, setIsCreated] = useState(false);
  const [showQRPopup, setShowQRPopup] = useState(false);
  const [configDetails, setConfigDetails] = useState<any>(null);
  const [configurationError, setConfigurationError] = useState<string>("");
  
  // Função para extrair apenas os números do telefone
  const extractPhoneNumbers = (phone: string): string => {
    return phone.replace(/\D/g, '');
  };
  
  const checkAndSetupConfiguration = async () => {
    try {
      console.log("=== INICIANDO VERIFICAÇÃO DE CONFIGURAÇÃO ===");
      
      // Limpar estado anterior
      setConfigurationError("");
      setHasActiveConfig(false);
      setConfigDetails(null);
      
      // Buscar configuração
      const config = await evolutionApi.getActiveConfig();
      console.log("Configuração obtida:", config);
      
      if (!config) {
        console.log("Nenhuma configuração encontrada");
        setConfigurationError("Nenhuma configuração encontrada no localStorage");
        return;
      }
      
      // Validar campos obrigatórios
      if (!config.api_url || config.api_url.trim() === '') {
        console.log("URL da API não encontrada ou vazia");
        setConfigurationError("URL da API não configurada");
        return;
      }
      
      if (!config.global_key || config.global_key.trim() === '') {
        console.log("Chave global não encontrada ou vazia");
        setConfigurationError("Chave global não configurada");
        return;
      }
      
      // Se chegou até aqui, a configuração é válida
      console.log("Configuração válida encontrada:", {
        name: config.name,
        api_url: config.api_url,
        has_global_key: !!config.global_key
      });
      
      // Configurar as credenciais na API
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      setHasActiveConfig(true);
      setConfigDetails(config);
      console.log("=== CONFIGURAÇÃO VALIDADA COM SUCESSO ===");
      
    } catch (error) {
      console.error("Erro ao verificar configuração:", error);
      setConfigurationError(`Erro ao carregar configuração: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      setHasActiveConfig(false);
      setConfigDetails(null);
    }
  };
  
  useEffect(() => {
    if (isOpen) {
      console.log("Dialog aberto, verificando configuração...");
      checkAndSetupConfiguration();
    }
  }, [isOpen]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setConnectionName("");
      setPhoneNumber("");
      setConnectionId("");
      setIsSubmitting(false);
      setIsCreated(false);
      setShowQRPopup(false);
      setConfigurationError("");
    }
  }, [isOpen]);
  
  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!hasActiveConfig) {
      toast.error("Configuração necessária", {
        description: "Configure primeiro a Evolution API em Configurações."
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Extrair apenas números do telefone
      const cleanPhoneNumber = extractPhoneNumbers(phoneNumber);
      
      console.log("Criando conexão com:", { connectionName, cleanPhoneNumber });
      console.log("Configuração ativa:", configDetails);
      
      const result = await whatsappConnectionManager.createConnection(connectionName, cleanPhoneNumber);
      
      if (result.success && result.connection) {
        setConnectionId(result.connection.id);
        setIsCreated(true);
        
        toast.success("Instância criada!", {
          description: "Clique em 'Ler QR Code' para conectar o WhatsApp",
        });
      } else {
        throw new Error(result.error || "Erro ao criar conexão");
      }
      
    } catch (error) {
      console.error("Erro ao criar instância:", error);
      toast.error("Erro ao criar instância", {
        description: error instanceof Error ? error.message : "Ocorreu um erro"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShowQRCode = () => {
    setShowQRPopup(true);
  };

  const handleQRCodeConnect = () => {
    // Finalizar conexão
    const connection = whatsappConnectionManager.getConnections().find(c => c.id === connectionId);
    if (connection) {
      onAddConnection(connection.name, "evolution", connection.configData);
    }
    
    setShowQRPopup(false);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
            <DialogDescription>
              {isCreated 
                ? "Instância criada! Clique em 'Ler QR Code' para conectar"
                : "Insira os dados para criar uma nova conexão WhatsApp"
              }
            </DialogDescription>
          </DialogHeader>
          
          {!isCreated ? (
            <form onSubmit={handleCreateInstance}>
              <div className="grid gap-4 py-4">
                {!hasActiveConfig && (
                  <Alert variant="destructive">
                    <InfoIcon className="h-4 w-4 mr-2" />
                    <AlertDescription>
                      Você precisa configurar a Evolution API primeiro em Configurações {">"} WhatsApp {">"} Configurações Avançadas.
                      {configurationError && (
                        <>
                          <br />
                          <small>Erro: {configurationError}</small>
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                
                {hasActiveConfig && configDetails && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    <AlertDescription>
                      Configuração da Evolution API encontrada e ativa!
                      <br />
                      <small>Servidor: {configDetails.api_url}</small>
                    </AlertDescription>
                  </Alert>
                )}
                
                {/* Debug info detalhado */}
                <div className="text-xs text-muted-foreground bg-gray-50 p-2 rounded">
                  <strong>Debug:</strong><br />
                  Config ativa: {hasActiveConfig ? "Sim" : "Não"}<br />
                  {configDetails ? (
                    <>
                      Nome: {configDetails.name}<br />
                      URL: {configDetails.api_url}<br />
                      Tem API Key: {configDetails.global_key ? "Sim" : "Não"}<br />
                      Tamanho da chave: {configDetails.global_key?.length || 0} caracteres
                    </>
                  ) : (
                    <>
                      localStorage: {localStorage.getItem('evolution_config') ? "Existe" : "Não existe"}<br />
                      Erro: {configurationError || "Nenhum"}
                    </>
                  )}
                </div>
                
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
                  <Label htmlFor="phoneNumber">Número do WhatsApp</Label>
                  <PhoneInput
                    value={phoneNumber}
                    onChange={setPhoneNumber}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite o número no formato (XX) 9 XXXX-XXXX. O código do país (+55) será adicionado automaticamente.
                  </p>
                </div>
                
                <Alert>
                  <InfoIcon className="h-4 w-4 mr-2" />
                  <AlertDescription>
                    Uma instância será criada automaticamente para esta conexão
                  </AlertDescription>
                </Alert>
              </div>
              
              <DialogFooter>
                <Button variant="outline" type="button" onClick={onClose}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || !connectionName || !phoneNumber || !hasActiveConfig || extractPhoneNumbers(phoneNumber).length < 10}
                >
                  {isSubmitting ? "Criando..." : "Criar Instância"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="py-8 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Instância Criada!</h3>
              <p className="text-muted-foreground mb-6">
                Sua instância foi criada com sucesso e está pronta para conectar.
              </p>
              
              <Alert className="mb-4">
                <InfoIcon className="h-4 w-4 mr-2" />
                <AlertDescription>
                  Clique no botão abaixo para abrir o QR Code e conectar seu WhatsApp
                </AlertDescription>
              </Alert>
              
              <DialogFooter className="flex-col gap-2">
                <Button onClick={handleShowQRCode} className="w-full">
                  <QrCode className="h-4 w-4 mr-2" />
                  Ler QR Code
                </Button>
                <Button variant="outline" onClick={onClose} className="w-full">
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <QRCodePopup 
        isOpen={showQRPopup}
        onClose={() => setShowQRPopup(false)}
        connectionId={connectionId}
        onConnect={handleQRCodeConnect}
      />
    </>
  );
};

export default AddConnectionDialog;
