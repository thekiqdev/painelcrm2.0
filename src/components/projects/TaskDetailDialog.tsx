
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CalendarIcon, User, CheckSquare, Edit, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Task, ProjectList, ChecklistItem, Priority } from "./types";
import { formatDate } from "./utils";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { sanitizeHtml } from "@/lib/sanitize";

interface TaskDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  listId: string | null;
  lists: ProjectList[];
  onToggleTaskStatus: (listId: string, taskId: string) => void;
  onToggleChecklistItem: (itemId: string) => void;
  onAddChecklistItem: (text: string) => void;
  onDeleteChecklistItem: (itemId: string) => void;
  newChecklistItemText: string;
  setNewChecklistItemText: React.Dispatch<React.SetStateAction<string>>;
  editMode?: boolean;
  setEditMode?: React.Dispatch<React.SetStateAction<boolean>>;
  onUpdateTask?: (listId: string, taskId: string, updatedTaskData: Partial<Task>) => void;
}

export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
  listId,
  lists,
  onToggleTaskStatus,
  onToggleChecklistItem,
  onAddChecklistItem,
  onDeleteChecklistItem,
  newChecklistItemText,
  setNewChecklistItemText,
  editMode = false,
  setEditMode,
  onUpdateTask
}: TaskDetailDialogProps) {
  if (!task || !listId) return null;

  // Form state for editing
  const [editData, setEditData] = useState<Partial<Task>>({
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    tags: task.tags || []
  });

  // Target list for moving task
  const [targetListId, setTargetListId] = useState<string>(listId);

  // Update form data when task changes
  useEffect(() => {
    if (task) {
      setEditData({
        title: task.title,
        description: task.description,
        priority: task.priority,
        dueDate: task.dueDate,
        tags: task.tags || []
      });
      setTargetListId(listId);
    }
  }, [task, listId]);

  const checklistItems = task.checklist || [];
  const completedItems = checklistItems.filter(item => item.completed).length;
  const totalItems = checklistItems.length;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  
  const handleAddItem = () => {
    if (!newChecklistItemText.trim()) return;
    onAddChecklistItem(newChecklistItemText);
    setNewChecklistItemText("");
  };

  // Handle edit mode changes
  const toggleEditMode = () => {
    if (setEditMode) {
      setEditMode(!editMode);
    }
  };

  // Save changes
  const saveChanges = () => {
    if (onUpdateTask && listId && task) {
      // If target list changed, we need to move the task
      if (targetListId !== listId) {
        // Call move task function if it exists
        onUpdateTask(listId, task.id, editData);
        toggleEditMode();
      } else {
        onUpdateTask(listId, task.id, editData);
        toggleEditMode();
      }
    }
  };

  // Handle tag input changes
  const [newTag, setNewTag] = useState("");
  
  const addTag = () => {
    if (newTag.trim() && !editData.tags?.includes(newTag.trim())) {
      setEditData({
        ...editData,
        tags: [...(editData.tags || []), newTag.trim()]
      });
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setEditData({
      ...editData,
      tags: editData.tags?.filter(tag => tag !== tagToRemove)
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {!editMode ? (
              <>
                <Checkbox 
                  checked={task.status === "completed"} 
                  onCheckedChange={() => onToggleTaskStatus(listId, task.id)}
                  className="mr-1"
                />
                <DialogTitle className={cn({"line-through opacity-70": task.status === "completed"})}>
                  {task.title}
                </DialogTitle>
              </>
            ) : (
              <Input 
                value={editData.title} 
                onChange={(e) => setEditData({...editData, title: e.target.value})}
                className="font-medium text-lg"
              />
            )}
          </div>
          
          {!editMode ? (
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline">
                Etapa: {lists.find(list => list.id === listId)?.name}
              </Badge>
              {task.priority === "high" && (
                <Badge variant="destructive">
                  Alta Prioridade
                </Badge>
              )}
              {task.priority === "medium" && (
                <Badge>
                  Média Prioridade
                </Badge>
              )}
              {task.priority === "low" && (
                <Badge variant="secondary">
                  Baixa Prioridade
                </Badge>
              )}
              {task.tags && task.tags.map(tag => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
              {task.labels && task.labels.map(label => (
                <Badge key={label} variant="outline">
                  {label}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-4 mt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Etapa</label>
                <Select 
                  value={targetListId} 
                  onValueChange={setTargetListId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map(list => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">Prioridade</label>
                <Select 
                  value={editData.priority} 
                  onValueChange={(value: Priority) => setEditData({...editData, priority: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="low">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">Data de Vencimento</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editData.dueDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editData.dueDate ? (
                        format(new Date(editData.dueDate), "PPP")
                      ) : (
                        <span>Escolha uma data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editData.dueDate ? new Date(editData.dueDate) : undefined}
                      onSelect={(date) => setEditData({...editData, dueDate: date ? format(date, "yyyy-MM-dd") : undefined})}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">Tags</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {editData.tags?.map(tag => (
                    <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                      {tag}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(tag)} />
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Nova tag"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTag.trim()) {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button onClick={addTag} disabled={!newTag.trim()}>
                    Adicionar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogHeader>
        
        <div className="grid gap-6">
          {!editMode ? (
            task.description && (
              <div>
                <h4 className="text-sm font-semibold mb-1">Descrição</h4>
                <div 
                  className="text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(task.description) }}
                />
              </div>
            )
          ) : (
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea 
                value={editData.description} 
                onChange={(e) => setEditData({...editData, description: e.target.value})}
                rows={4}
              />
            </div>
          )}
          
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-semibold">Lista de Verificação</h4>
              {totalItems > 0 && (
                <span className="text-xs text-muted-foreground">
                  {completedItems}/{totalItems} concluídos ({progress}%)
                </span>
              )}
            </div>

            {/* Barra de progresso */}
            {totalItems > 0 && (
              <div className="w-full bg-muted h-2 rounded-full mb-3">
                <div 
                  className="bg-primary h-2 rounded-full" 
                  style={{ width: `${progress}%` }} 
                />
              </div>
            )}

            {/* Itens do checklist */}
            <div className="space-y-2 mb-3">
              {checklistItems.map(item => (
                <div key={item.id} className="flex items-center group">
                  <Checkbox 
                    checked={item.completed} 
                    onCheckedChange={() => onToggleChecklistItem(item.id)}
                    className="mr-2"
                  />
                  <span className={cn("flex-1 text-sm", {"line-through text-muted-foreground": item.completed})}>
                    {item.text}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0" 
                    onClick={() => onDeleteChecklistItem(item.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Adicionar novo item ao checklist */}
            <div className="flex gap-2">
              <Input 
                placeholder="Adicionar item à lista" 
                value={newChecklistItemText} 
                onChange={(e) => setNewChecklistItemText(e.target.value)}
                className="text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newChecklistItemText.trim()) {
                    handleAddItem();
                  }
                }}
              />
              <Button onClick={handleAddItem} disabled={!newChecklistItemText.trim()}>
                Adicionar
              </Button>
            </div>
          </div>

          {!editMode && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Detalhes</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {task.dueDate ? 
                        `Data: ${formatDate(task.dueDate)}` : 
                        "Sem data definida"}
                    </span>
                  </div>
                  {task.assignee && (
                    <div className="flex gap-2 items-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>Responsável: {task.assignee.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          {editMode ? (
            <>
              <Button variant="outline" onClick={toggleEditMode}>Cancelar</Button>
              <Button onClick={saveChanges}>
                <Save className="mr-2 h-4 w-4" />
                Salvar Alterações
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant={task.status === "completed" ? "default" : "secondary"} 
                onClick={() => onToggleTaskStatus(listId, task.id)}
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                {task.status === "completed" ? "Marcar como pendente" : "Marcar como concluída"}
              </Button>
              <Button onClick={toggleEditMode}>
                <Edit className="mr-2 h-4 w-4" />
                Editar Tarefa
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
