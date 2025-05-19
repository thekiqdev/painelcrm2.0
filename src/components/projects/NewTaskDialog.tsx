import React, { Dispatch, SetStateAction } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Member } from "@/components/shared/types";
import { RichTextEditor } from "@/components/shared/RichTextEditor";

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  onAddTask: (formData: FormData) => void;
  tagsInput: string[];
  setTagsInput: Dispatch<SetStateAction<string[]>>;
  newTagText: string;
  setNewTagText: Dispatch<SetStateAction<string>>;
}

export function NewTaskDialog({
  open,
  onOpenChange,
  members,
  onAddTask,
  tagsInput,
  setTagsInput,
  newTagText,
  setNewTagText
}: NewTaskDialogProps) {
  const [date, setDate] = React.useState<Date>();
  const [description, setDescription] = React.useState("");

  // Função para adicionar tag
  const addTag = () => {
    if (!newTagText.trim()) return;
    setTagsInput([...tagsInput, newTagText.trim()]);
    setNewTagText("");
  };

  // Função para remover tag
  const removeTag = (tagToRemove: string) => {
    setTagsInput(tagsInput.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    // Adicionar tags ao FormData como JSON
    formData.append('tags', JSON.stringify(tagsInput));
    
    // Adicionar a data formatada, se selecionada
    if (date) {
      formData.set('dueDate', format(date, 'yyyy-MM-dd'));
    }
    
    // Adicionar a descrição rich text
    formData.set('description', description);
    
    onAddTask(formData);
    
    // Limpar campos após submissão
    setTagsInput([]);
    setDate(undefined);
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
          <DialogDescription>
            Adicione uma nova tarefa à etapa selecionada.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Título</Label>
              <Input id="title" name="title" placeholder="Título da tarefa" required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <RichTextEditor 
                value={description} 
                onChange={setDescription}
                placeholder="Detalhes da tarefa"
              />
            </div>

            {/* Tags input section */}
            <div className="grid gap-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tagsInput.map(tag => (
                  <Badge key={tag} variant="secondary" className="px-2 py-1">
                    {tag}
                    <button 
                      type="button" 
                      className="ml-1 hover:text-destructive" 
                      onClick={() => removeTag(tag)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input 
                  placeholder="Adicionar tag" 
                  value={newTagText} 
                  onChange={(e) => setNewTagText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTagText.trim()) {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="flex-1"
                />
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={addTag}
                  disabled={!newTagText.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dueDate">Data de Entrega</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "dd/MM/yyyy") : <span>Selecionar data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="priority">Prioridade</Label>
                <Select name="priority" defaultValue="medium">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="assignee">Responsável</Label>
              <Select name="assignee">
                <SelectTrigger>
                  <SelectValue placeholder="Atribuir à" />
                </SelectTrigger>
                <SelectContent>
                  {members.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
