import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CalendarIcon, Plus, X, Upload, Link as LinkIcon, AlertCircle, Clock, DollarSign, Users, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Member } from "@/components/shared/types";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  onAddTask: (formData: FormData) => void;
  tagsInput: string[];
  setTagsInput: React.Dispatch<React.SetStateAction<string[]>>;
  newTagText: string;
  setNewTagText: React.Dispatch<React.SetStateAction<string>>;
}

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

interface Reminder {
  id: string;
  type: string;
  value: number;
  unit: string;
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
  const { toast } = useToast();
  
  // Basic fields
  const [dueDate, setDueDate] = useState<Date>();
  const [startDate, setStartDate] = useState<Date>();
  const [description, setDescription] = useState("");
  
  // Advanced fields
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [watchers, setWatchers] = useState<string[]>([]);
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  
  // Billing fields
  const [billable, setBillable] = useState(false);
  
  // Recurrence
  const [hasRecurrence, setHasRecurrence] = useState(false);

  const addTag = () => {
    if (!newTagText.trim()) return;
    setTagsInput([...tagsInput, newTagText.trim()]);
    setNewTagText("");
  };

  const removeTag = (tagToRemove: string) => {
    setTagsInput(tagsInput.filter(tag => tag !== tagToRemove));
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    setChecklist([...checklist, {
      id: Math.random().toString(36).substr(2, 9),
      text: newChecklistItem.trim(),
      completed: false
    }]);
    setNewChecklistItem("");
  };

  const removeChecklistItem = (id: string) => {
    setChecklist(checklist.filter(item => item.id !== id));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments([...attachments, ...Array.from(e.target.files)]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    // Add all extra data
    formData.append('tags', JSON.stringify(tagsInput));
    formData.append('checklist', JSON.stringify(checklist));
    formData.append('watchers', JSON.stringify(watchers));
    formData.append('dependencies', JSON.stringify(dependencies));
    formData.append('reminders', JSON.stringify(reminders));
    formData.append('description', description);
    
    if (dueDate) {
      formData.set('dueDate', format(dueDate, 'yyyy-MM-dd'));
    }
    
    if (startDate) {
      formData.set('startDate', format(startDate, 'yyyy-MM-dd'));
    }
    
    // Add attachments
    attachments.forEach((file, index) => {
      formData.append(`attachment_${index}`, file);
    });
    
    onAddTask(formData);
    
    // Reset form
    resetForm();
    
    toast({
      title: "Tarefa criada",
      description: "A tarefa foi criada com sucesso.",
    });
  };

  const resetForm = () => {
    setTagsInput([]);
    setDueDate(undefined);
    setStartDate(undefined);
    setDescription("");
    setChecklist([]);
    setWatchers([]);
    setDependencies([]);
    setReminders([]);
    setAttachments([]);
    setBillable(false);
    setHasRecurrence(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
          <DialogDescription>
            Preencha os campos básicos e avançados para criar uma tarefa completa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* SEÇÃO BÁSICA */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Informações Básicas</h3>
              
              <div className="space-y-2">
                <Label htmlFor="title">Título *</Label>
                <Input 
                  id="title" 
                  name="title" 
                  placeholder="Título da tarefa" 
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <RichTextEditor 
                  value={description} 
                  onChange={setDescription}
                  placeholder="Detalhes da tarefa..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="taskType">Tipo</Label>
                  <Select name="taskType" defaultValue="task">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">Tarefa</SelectItem>
                      <SelectItem value="bug">Bug</SelectItem>
                      <SelectItem value="feature">Feature</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Prioridade</Label>
                  <Select name="priority" defaultValue="medium">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignee">Responsável</Label>
                <Select name="assignee">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar responsável" />
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

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tagsInput.map(tag => (
                    <Badge key={tag} variant="secondary">
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
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={addTag}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* SEÇÃO AVANÇADA */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="advanced">
                <AccordionTrigger>
                  <span className="text-sm font-semibold">Configurações Avançadas</span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-4">
                    
                    {/* Datas e tempo */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Datas e Tempo
                      </h4>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Data de Início</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {startDate ? format(startDate, "dd/MM/yyyy") : <span>Selecionar</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={startDate}
                                onSelect={setStartDate}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>

                        <div className="space-y-2">
                          <Label>Data de Entrega</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dueDate ? format(dueDate, "dd/MM/yyyy") : <span>Selecionar</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={dueDate}
                                onSelect={setDueDate}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="startTime">Hora de Início</Label>
                          <Input 
                            id="startTime" 
                            name="startTime" 
                            type="time"
                            placeholder="09:00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endTime">Hora de Término</Label>
                          <Input 
                            id="endTime" 
                            name="endTime" 
                            type="time"
                            placeholder="18:00"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Label htmlFor="estimatedHours" className="flex items-center gap-1">
                                  Estimativa (horas)
                                  <AlertCircle className="h-3 w-3 text-muted-foreground" />
                                </Label>
                              </TooltipTrigger>
                              <TooltipContent>
                                Tempo estimado em horas para concluir esta tarefa
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Input 
                            id="estimatedHours" 
                            name="estimatedHours" 
                            type="number"
                            step="0.5"
                            placeholder="8"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="storyPoints">Story Points</Label>
                          <Input 
                            id="storyPoints" 
                            name="storyPoints" 
                            type="number"
                            placeholder="5"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Checklist */}
                    <div className="space-y-2">
                      <Label>Checklist / Subtarefas</Label>
                      <div className="space-y-2">
                        {checklist.map(item => (
                          <div key={item.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                            <Checkbox 
                              checked={item.completed}
                              onCheckedChange={() => {
                                setChecklist(checklist.map(i => 
                                  i.id === item.id ? {...i, completed: !i.completed} : i
                                ));
                              }}
                            />
                            <span className={item.completed ? "line-through text-muted-foreground" : ""}>
                              {item.text}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="ml-auto h-6 w-6 p-0"
                              onClick={() => removeChecklistItem(item.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input 
                          placeholder="Nova subtarefa..." 
                          value={newChecklistItem}
                          onChange={(e) => setNewChecklistItem(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addChecklistItem();
                            }
                          }}
                        />
                        <Button type="button" variant="secondary" onClick={addChecklistItem}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Anexos */}
                    <div className="space-y-2">
                      <Label>Anexos</Label>
                      <div className="space-y-2">
                        {attachments.map((file, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                            <span className="text-sm truncate flex-1">{file.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(2)} KB
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => removeAttachment(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="file"
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                          id="file-upload"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => document.getElementById('file-upload')?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload de Arquivo
                        </Button>
                      </div>
                      <Input 
                        name="externalLink"
                        placeholder="Ou cole um link (Google Drive, Figma...)"
                      />
                    </div>

                    {/* Observadores */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Observadores (Watchers)
                      </Label>
                      <Select 
                        onValueChange={(value) => {
                          if (!watchers.includes(value)) {
                            setWatchers([...watchers, value]);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Adicionar observador" />
                        </SelectTrigger>
                        <SelectContent>
                          {members.filter(m => !watchers.includes(m.id)).map(member => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2">
                        {watchers.map(watcherId => {
                          const member = members.find(m => m.id === watcherId);
                          return member ? (
                            <Badge key={watcherId} variant="secondary">
                              {member.name}
                              <button
                                type="button"
                                className="ml-1"
                                onClick={() => setWatchers(watchers.filter(w => w !== watcherId))}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>

                    {/* Visibilidade */}
                    <div className="space-y-2">
                      <Label htmlFor="visibility">Visibilidade</Label>
                      <Select name="visibility" defaultValue="internal">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="internal">Interna</SelectItem>
                          <SelectItem value="shared_with_client">Compartilhada com Cliente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Cobrável */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="billable" className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Cobrável (Billable)
                        </Label>
                        <Switch 
                          id="billable"
                          checked={billable}
                          onCheckedChange={setBillable}
                        />
                      </div>
                      
                      {billable && (
                        <div className="grid grid-cols-2 gap-4 pl-6">
                          <div className="space-y-2">
                            <Label htmlFor="hourlyRate">Taxa por Hora (R$)</Label>
                            <Input 
                              id="hourlyRate" 
                              name="hourlyRate" 
                              type="number"
                              step="0.01"
                              placeholder="150.00"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="budgetCap">Orçamento Máximo (R$)</Label>
                            <Input 
                              id="budgetCap" 
                              name="budgetCap" 
                              type="number"
                              step="0.01"
                              placeholder="5000.00"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Recorrência */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <Repeat className="h-4 w-4" />
                          Recorrência
                        </Label>
                        <Switch 
                          checked={hasRecurrence}
                          onCheckedChange={setHasRecurrence}
                        />
                      </div>
                      
                      {hasRecurrence && (
                        <div className="space-y-4 pl-6">
                          <Select name="recurrenceType" defaultValue="weekly">
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="daily">Diária</SelectItem>
                              <SelectItem value="weekly">Semanal</SelectItem>
                              <SelectItem value="monthly">Mensal</SelectItem>
                              <SelectItem value="custom">Personalizada</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Reunião */}
                    <div className="space-y-2">
                      <Label>Local/Link de Reunião</Label>
                      <Input 
                        name="meetingLocation"
                        placeholder="Endereço ou sala"
                      />
                      <Input 
                        name="meetingLink"
                        placeholder="Link do Meet/Zoom"
                        type="url"
                      />
                    </div>

                    {/* Severidade (para bugs) */}
                    <div className="space-y-2">
                      <Label htmlFor="severity">Severidade (para bugs)</Label>
                      <Select name="severity">
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar severidade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">Crítica</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="low">Baixa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <DialogFooter className="mt-6 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="secondary">
              Salvar e Criar Outra
            </Button>
            <Button type="submit">
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}