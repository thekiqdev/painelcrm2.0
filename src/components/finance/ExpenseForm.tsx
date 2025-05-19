
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

interface Project {
  id: string;
  name: string;
}

interface ExpenseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (formData: FormData) => void;
  availableProjects?: Project[];
}

export function ExpenseForm({ open, onOpenChange, onSave, availableProjects = [] }: ExpenseFormProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [isPaid, setIsPaid] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    // Add date
    formData.append('date', date.toISOString());
    
    // Add isPaid
    formData.append('isPaid', isPaid.toString());
    
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nova Despesa</DialogTitle>
          <DialogDescription>
            Registre uma nova despesa para controle financeiro.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" placeholder="Descreva a despesa" required />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input 
                id="amount" 
                name="amount" 
                type="number" 
                min="0.01" 
                step="0.01" 
                placeholder="0,00" 
                required 
              />
            </div>
            
            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "dd/MM/yyyy") : <span>Escolha uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(date) => date && setDate(date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select name="category" defaultValue="other">
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Categoria</SelectLabel>
                    <SelectItem value="office">Escritório</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="software">Software</SelectItem>
                    <SelectItem value="utilities">Contas/Serviços</SelectItem>
                    <SelectItem value="salary">Salários</SelectItem>
                    <SelectItem value="taxes">Impostos</SelectItem>
                    <SelectItem value="other">Outros</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex items-center space-x-2 mt-4">
                <Checkbox 
                  id="isPaid" 
                  checked={isPaid} 
                  onCheckedChange={(checked) => {
                    if (typeof checked === 'boolean') {
                      setIsPaid(checked);
                    }
                  }} 
                />
                <Label htmlFor="isPaid" className="cursor-pointer">Despesa paga</Label>
              </div>
            </div>
          </div>
          
          {availableProjects.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="projectId">Projeto (opcional)</Label>
              <Select name="projectId">
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Projetos</SelectLabel>
                    <SelectItem value="">Sem projeto</SelectItem>
                    {availableProjects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea 
              id="notes" 
              name="notes" 
              placeholder="Observações sobre esta despesa" 
              rows={3} 
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar Despesa</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
