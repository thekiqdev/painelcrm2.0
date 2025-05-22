
import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FunnelType } from "@/components/funnel/types";

// List of source options - fixing the empty value issue here
const sourceOptions = [
  { value: "Website", label: "Website" },
  { value: "Indicação", label: "Indicação" },
  { value: "Mídia Social", label: "Mídia Social" },
  { value: "Email Marketing", label: "Email Marketing" },
  { value: "Google", label: "Google" },
  { value: "Evento", label: "Evento" },
  { value: "Outros", label: "Outros" }
];

interface NewFunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  newFunnelName: string;
  setNewFunnelName: (name: string) => void;
  newFunnelDesc: string;
  setNewFunnelDesc: (desc: string) => void;
  newFunnelType: FunnelType;
  setNewFunnelType: (type: FunnelType) => void;
  newFunnelSource: string;
  setNewFunnelSource: (source: string) => void;
}

export function NewFunnelDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  newFunnelName,
  setNewFunnelName,
  newFunnelDesc,
  setNewFunnelDesc,
  newFunnelType,
  setNewFunnelType,
  newFunnelSource,
  setNewFunnelSource
}: NewFunnelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Criar Novo Funil</DialogTitle>
          <DialogDescription>
            Preencha os detalhes para criar um novo funil
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input 
                  id="title" 
                  placeholder="Ex: Funil de Vendas" 
                  value={newFunnelName}
                  onChange={(e) => setNewFunnelName(e.target.value)}
                  required 
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select 
                  value={newFunnelType} 
                  onValueChange={(value) => setNewFunnelType(value as FunnelType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clients">Clientes</SelectItem>
                    <SelectItem value="leads">Leads</SelectItem>
                    <SelectItem value="proposals">Propostas</SelectItem>
                    <SelectItem value="contracts">Contratos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="source">Fonte</Label>
                <Select 
                  value={newFunnelSource} 
                  onValueChange={(value) => setNewFunnelSource(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a fonte" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea 
                  id="description" 
                  placeholder="Descreva o funil..." 
                  value={newFunnelDesc}
                  onChange={(e) => setNewFunnelDesc(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !newFunnelName.trim()}
            >
              {isSubmitting ? 'Criando...' : 'Criar Funil'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
