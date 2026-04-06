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
import { InfoIcon, CheckCircle2, QrCode, RefreshCw } from "lucide-react";
import { ConnectionType } from "@/components/settings/types";
import { toast } from "sonner";
import { chatService } from "@/services/chat";
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
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("created");
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  
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

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setConnectionName("");
      setPhoneNumber("");
      setConnectionId("");
      setIsSubmitting(false);
      setIsCreated(false);
      setShowQRPopup(false);
      setIsGeneratingQR(false);
      setConnectionStatus("created");
      setQrCodeData(null);
    }
  }, [isOpen]);
  
  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsSubmitting(true);
    
    try {
      const cleanPhoneNumber = extractPhoneNumbers(phoneNumber);
      const instanceName = createInstanceName(connectionName, phoneNumber);
      
      console.log("Criando instância UazAPI com:", { 
        connectionName, 
        instanceName, 
        cleanPhoneNumber 
      });
      
      // Criar instância via backend (chatService)
      const instance = await chatService.createInstance({ 
        name: instanceName,
        metadata: {
          phoneNumber: cleanPhoneNumber,
          connectionName: connectionName
        }
      });
      
      setConnectionId(instance.id);
      setConnectionStatus(instance.status || 'disconnected');
      setIsCreated(true);
      
      // Webhook não é necessário para criar a instância - pode ser configurado depois
      // Removido configuração automática de webhook conforme documentação UazAPI
      
      toast.success("Instância criada com sucesso!", {
        description: `Instância "${instanceName}" criada. Use 'Gerar QR Code' para conectar`,
      });
      
    } catch (error) {
      console.error("Erro ao criar instância:", error);
      toast.error("Erro ao criar instância", {
        description: error instanceof Error ? error.message : "Ocorreu um erro"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateQRCode = async () => {
    setIsGeneratingQR(true);
    
    try {
      // Conectar instância e obter QR Code via backend (sem phone para gerar QR code)
      const connectResponse = await chatService.connectInstance(connectionId);
      
      console.log('Resposta do connect:', connectResponse);
      
      // A resposta da UazAPI pode ter o QR code em diferentes lugares:
      // - instance.qrcode (base64)
      // - qrcode (base64 direto)
      // - code (base64)
      // - pairingCode (código de pareamento)
      const instance = connectResponse?.instance || {};
      const qrData = instance?.qrcode || connectResponse?.qrcode || connectResponse?.code;
      const pairingCode = instance?.paircode || connectResponse?.paircode || connectResponse?.pairingCode;
      
      if (qrData) {
        // Se o QR code já vem com prefixo data:image, usar direto
        // Caso contrário, adicionar prefixo
        const processedQR = qrData.startsWith('data:image') 
          ? qrData 
          : `data:image/png;base64,${qrData}`;
        
        setQrCodeData(processedQR);
        setConnectionStatus("awaiting_scan");
        toast.success("QR Code gerado com sucesso!", {
          description: "Clique em 'Ler QR Code' para conectar"
        });
      } else if (pairingCode) {
        // Se não tem QR code mas tem pairing code, mostrar mensagem
        toast.info("Código de pareamento disponível", {
          description: `Use o código: ${pairingCode}`
        });
        setConnectionStatus("awaiting_scan");
      } else {
        // Verificar se já está conectado
        if (connectResponse?.connected || connectResponse?.loggedIn || instance?.status === 'open') {
          setConnectionStatus("connected");
          toast.success("Instância já está conectada!");
      } else {
          throw new Error("QR Code não disponível na resposta. Verifique os logs do console.");
        }
      }
    } catch (error) {
      console.error("Erro ao gerar QR code:", error);
      toast.error("Erro ao gerar QR Code", {
        description: error instanceof Error ? error.message : "Ocorreu um erro"
      });
    } finally {
      setIsGeneratingQR(false);
    }
  };

  const handleShowQRCode = () => {
    setShowQRPopup(true);
  };

  const handleQRCodeConnect = () => {
    // Se connectionId é UUID, a instância já está criada no backend
    // Apenas fechar o dialog e recarregar a lista de instâncias
    setShowQRPopup(false);
    onClose();
    // Chamar callback se fornecido
    if (onAddConnection) {
      onAddConnection('', '', {});
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
            <DialogDescription>
              {isCreated 
                ? "Instância criada! Gere o QR Code para conectar"
                : "Insira os dados para criar uma nova conexão WhatsApp"
              }
            </DialogDescription>
          </DialogHeader>
          
          {!isCreated ? (
            <form onSubmit={handleCreateInstance}>
              <div className="grid gap-4 py-4">
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
                Sua instância foi criada com sucesso e está salva no sistema.
              </p>
              
              <Alert className="mb-4">
                <InfoIcon className="h-4 w-4 mr-2" />
                <AlertDescription>
                  {connectionStatus === "awaiting_scan" 
                    ? "QR Code disponível! Clique para conectar seu WhatsApp"
                    : "Gere o QR Code para conectar seu WhatsApp"
                  }
                </AlertDescription>
              </Alert>
              
              <DialogFooter className="flex-col gap-2">
                {connectionStatus === "awaiting_scan" ? (
                  <Button onClick={handleShowQRCode} className="w-full">
                    <QrCode className="h-4 w-4 mr-2" />
                    Ler QR Code
                  </Button>
                ) : (
                  <Button 
                    onClick={handleGenerateQRCode} 
                    className="w-full"
                    disabled={isGeneratingQR}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isGeneratingQR ? 'animate-spin' : ''}`} />
                    {isGeneratingQR ? "Gerando..." : "Gerar QR Code"}
                  </Button>
                )}
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
        qrCode={qrCodeData}
        onConnect={handleQRCodeConnect}
      />
    </>
  );
};

export default AddConnectionDialog;
