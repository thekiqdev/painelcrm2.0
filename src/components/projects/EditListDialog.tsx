
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectList } from "./types";

interface EditListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: ProjectList | null;
  onSave: (event: React.FormEvent) => void;
}

export function EditListDialog({
  open,
  onOpenChange,
  list,
  onSave
}: EditListDialogProps) {
  if (!list) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Etapa</DialogTitle>
          <DialogDescription>Altere o nome da etapa</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSave}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="listName">Nome da Etapa</Label>
              <Input 
                id="listName" 
                name="listName" 
                placeholder="Nome da etapa" 
                defaultValue={list.name}
                required 
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
