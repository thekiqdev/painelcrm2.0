
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NewListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (event: React.FormEvent) => void;
}

export function NewListDialog({
  open,
  onOpenChange,
  onSave
}: NewListDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Etapa</DialogTitle>
          <DialogDescription>Crie uma nova etapa para organizar suas tarefas</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSave}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="listName">Nome da Etapa</Label>
              <Input id="listName" name="listName" placeholder="Nome da etapa" required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Criar Etapa</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
