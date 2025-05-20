
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

interface LeadConvertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConvert: () => void;
  lead: any | null;
  taskCount: number;
}

const LeadConvertDialog: React.FC<LeadConvertDialogProps> = ({
  isOpen,
  onClose,
  onConvert,
  lead,
  taskCount,
}) => {
  if (!lead) return null;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Converter Lead para Cliente</DialogTitle>
          <DialogDescription>
            Você está prestes a converter o lead "{lead?.name}" em um cliente. Esta ação irá transferir todos os dados do lead para um novo cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Os seguintes dados serão transferidos:
          </p>
          <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
            <li>Dados de contato</li>
            <li>Tarefas associadas ({taskCount || 0})</li>
            <li>Notas e observações</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onConvert}>
            <UserPlus className="mr-2 h-4 w-4" />
            Converter para Cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LeadConvertDialog;
