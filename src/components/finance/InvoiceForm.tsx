
import React, { useState, useEffect } from "react";
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
import { CalendarIcon, Plus, Trash } from "lucide-react";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface InvoiceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (formData: FormData) => void;
  availableProjects?: Project[];
  defaultClientName?: string;
}

export function InvoiceForm({ open, onOpenChange, onSave, availableProjects = [], defaultClientName = '' }: InvoiceFormProps) {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [dueDate, setDueDate] = useState<Date | undefined>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Default: 7 days from now
  );
  const [clientName, setClientName] = useState(defaultClientName);

  // Atualizar o nome do cliente quando defaultClientName mudar ou quando o diálogo abrir
  useEffect(() => {
    if (open && defaultClientName) {
      setClientName(defaultClientName);
    }
  }, [open, defaultClientName]);

  const addItem = () => {
    const newItem: InvoiceItem = {
      id: `item-${Date.now()}`,
      description: "",
      quantity: 1,
      unitPrice: 0,
      total: 0
    };
    setItems([...items, newItem]);
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(prevItems => 
      prevItems.map(item => {
        if (item.id !== id) return item;
        
        const updatedItem = { ...item, [field]: value };
        
        // Recalculate total if quantity or unitPrice changed
        if (field === "quantity" || field === "unitPrice") {
          updatedItem.total = updatedItem.quantity * updatedItem.unitPrice;
        }
        
        return updatedItem;
      })
    );
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    // Add items as JSON
    formData.append('items', JSON.stringify(items));
    
    // Add due date
    if (dueDate) {
      formData.append('dueDate', dueDate.toISOString());
    }
    
    // Add total
    formData.append('total', calculateTotal().toString());
    
    onSave(formData);
    
    // Reset form
    setItems([]);
    setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setClientName(defaultClientName || '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Nova Fatura</DialogTitle>
          <DialogDescription>
            Crie uma nova fatura para seu cliente.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientName">Cliente</Label>
              <Input 
                id="clientName" 
                name="clientName" 
                placeholder="Nome do cliente" 
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Número da Fatura</Label>
              <Input 
                id="invoiceNumber" 
                name="invoiceNumber" 
                defaultValue={`INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`} 
                required 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Emissão</Label>
              <Input 
                value={format(new Date(), "dd/MM/yyyy")}
                readOnly
              />
              <input 
                type="hidden" 
                name="issueDate" 
                value={new Date().toISOString()} 
              />
            </div>
            
            <div className="space-y-2">
              <Label>Data de Vencimento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "dd/MM/yyyy") : <span>Escolha uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select name="status" defaultValue="draft">
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Status</SelectLabel>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Paga</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
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
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Itens</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Item
              </Button>
            </div>
            
            <div className="border rounded-md">
              {items.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  Nenhum item adicionado. Clique em "Adicionar Item" acima.
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-12 gap-2 p-2 border-b bg-muted/50 text-xs font-medium">
                    <div className="col-span-5">Descrição</div>
                    <div className="col-span-2 text-right">Quantidade</div>
                    <div className="col-span-2 text-right">Preço Unit.</div>
                    <div className="col-span-2 text-right">Total</div>
                    <div className="col-span-1"></div>
                  </div>
                  
                  {items.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 gap-2 p-2 items-center">
                      <div className="col-span-5">
                        <Input 
                          value={item.description} 
                          onChange={(e) => updateItem(item.id, "description", e.target.value)}
                          placeholder="Descrição do item"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input 
                          type="number" 
                          min="1"
                          value={item.quantity} 
                          onChange={(e) => updateItem(item.id, "quantity", Number(e.target.value))}
                          className="text-right"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input 
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice} 
                          onChange={(e) => updateItem(item.id, "unitPrice", Number(e.target.value))}
                          className="text-right"
                        />
                      </div>
                      <div className="col-span-2 text-right font-medium">
                        R$ {item.total.toFixed(2)}
                      </div>
                      <div className="col-span-1 text-right">
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  <div className="grid grid-cols-12 gap-2 p-2 border-t items-center">
                    <div className="col-span-9 text-right font-medium">Total:</div>
                    <div className="col-span-2 text-right font-medium">
                      R$ {calculateTotal().toFixed(2)}
                    </div>
                    <div className="col-span-1"></div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar Fatura</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
