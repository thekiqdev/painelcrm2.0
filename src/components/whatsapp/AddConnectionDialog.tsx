
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
  const [connectionId, setConnectionId] = useState("");
  const [isCreated, setIsCreated] = useState(false);
  const [showQRPopup, setShowQRPopup] = useState(false);
  const [configDetails, setConfigDetails] = useState<any>(null);
  
  // Função para extrair apenas os números do telefone
  const extractPhoneNumbers = (phone: string): string => {
    return phone.replace(/\D/g, '');
  };
  
  // Função para criar nome da instância combinando nome + telefone
  const createInstanceName = (name: string, phone: string): string => {
    const cleanName = name.toLowerCase()
      .replace(/\s+/g, '')  // Remove espaços
      .replace(/[^a-z0-9]/g, ''); // Remove caracteres especiais
    
    const cleanPhone = extractPhoneNumbers(phone);
    
    return `${cleanName}_${cleanPhone}`;
  };
  
  const checkAndSetupConfiguration = async () => {
    try {
      console.log("=== VERIFICANDO CONFIGURAÇÃO PRÉ-DEFINIDA ===");
      
      // Buscar configuração (que agora sempre retornará a pré-definida)
      const config = await evolutionApi.getActiveConfig();
      console.log("Configuração obtida:", config);
      
      if (config) {
        setConfigDetails(config);
        console.log("=== CONFIGURAÇÃO PRÉ-DEFINIDA ATIVA ===");
      }
      
    } catch (error) {
      console.error("Erro ao verificar configuração:", error);
      setConfigDetails(null);
    }
  };
  
  useEffect(() => {
    if (isOpen) {
      console.log("Dialog aberto, carregando configuração pré-definida...");
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
    }
  }, [isOpen]);
  
  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsSubmitting(true);
    
    try {
      // Extrair apenas números do telefone
      const cleanPhoneNumber = extractPhoneNumbers(phoneNumber);
      
      // Criar nome da instância combinando nome + telefone
      const instanceName = createInstanceName(connectionName, phoneNumber);
      
      console.log("Criando conexão com:", { 
        connectionName, 
        instanceName, 
        cleanPhoneNumber 
      });
      console.log("Usando configuração:", configDetails);
      
      const result = await whatsappConnectionManager.createConnection(instanceName, cleanPhoneNumber);
      
      if (result.success && result.connection) {
        setConnectionId(result.connection.id);
        setIsCreated(true);
        
        toast.success("Instância criada!", {
          description: `Instância "${instanceName}" criada. Clique em 'Ler QR Code' para conectar o WhatsApp`,
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

  // Criar preview do nome da instância para mostrar ao usuário
  const getInstancePreview = () => {
    if (connectionName && phoneNumber) {
      return createInstanceName(connectionName, phoneNumber);
    }
    return "";
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
                {configDetails && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    <AlertDescription>
                      Evolution API configurada e pronta para uso!
                      <br />
                      <small>Servidor: {configDetails.api_url}</small>
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="grid gap-2">
                  <Label htmlFor="connectionName">Nome da Conexão</Label>
                  <Input
                    id="connectionName"
                    placeholder="Ex: João Silva"
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
                
                {getInstancePreview() && (
                  <Alert>
                    <InfoIcon className="h-4 w-4 mr-2" />
                    <AlertDescription>
                      <strong>Nome da instância:</strong> {getInstancePreview()}
                      <br />
                      <small>Este será o identificador único desta conexão</small>
                    </AlertDescription>
                  </Alert>
                )}
                
                <Alert>
                  <InfoIcon className="h-4 w-4 mr-2" />
                  <AlertDescription>
                    Uma instância será criada automaticamente combinando o nome + telefone para facilitar a identificação do cliente
                  </AlertDescription>
                </Alert>
              </div>
              
              <DialogFooter>
                <Button variant="outline" type="button" onClick={onClose}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || !connectionName || !phoneNumber || extractPhoneNumbers(phoneNumber).length < 10}
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
