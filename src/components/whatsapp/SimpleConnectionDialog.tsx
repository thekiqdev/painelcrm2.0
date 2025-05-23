
import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Connection } from "@/components/whatsapp/useWhatsAppConnection";

interface SimpleConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (connection: Connection) => void;
  isLoading: boolean;
}

const SimpleConnectionDialog: React.FC<SimpleConnectionDialogProps> = ({
  open,
  onOpenChange,
  onConnect,
  isLoading
}) => {
  const [instanceName, setInstanceName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceName.trim()) return;
    
    const newConnection: Connection = {
      id: `conn_${Date.now()}`,
      name: `WhatsApp: ${instanceName}`,
      type: "evolution",
      status: "disconnected",
      configData: {
        instanceName: instanceName.trim()
      }
    };
    
    onConnect(newConnection);
    setInstanceName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
          <DialogDescription>
            Crie uma nova conexão WhatsApp usando a Evolution API
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="instanceName">Nome da Instância</Label>
            <Input
              id="instanceName"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="Ex: minha-empresa-whatsapp"
              required
            />
            <p className="text-xs text-muted-foreground">
              Forneça um nome único para sua instância do WhatsApp
            </p>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || !instanceName.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Conexão"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SimpleConnectionDialog;
