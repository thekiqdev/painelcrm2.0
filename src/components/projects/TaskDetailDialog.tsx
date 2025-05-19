
import React, { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CalendarIcon, User, CheckSquare, Edit, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Task, ProjectList, ChecklistItem } from "./types";
import { formatDate } from "./utils";

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
  onDeleteChecklistItem
}: TaskDetailDialogProps) {
  const [newChecklistItemText, setNewChecklistItemText] = useState("");

  if (!task || !listId) return null;

  const checklistItems = task.checklist || [];
  const completedItems = checklistItems.filter(item => item.completed).length;
  const totalItems = checklistItems.length;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  
  const handleAddItem = () => {
    if (!newChecklistItemText.trim()) return;
    onAddChecklistItem(newChecklistItemText);
    setNewChecklistItemText("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox 
              checked={task.status === "completed"} 
              onCheckedChange={() => onToggleTaskStatus(listId, task.id)}
              className="mr-1"
            />
            <DialogTitle className={cn({"line-through opacity-70": task.status === "completed"})}>
              {task.title}
            </DialogTitle>
          </div>
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
        </DialogHeader>
        
        <div className="grid gap-6">
          {task.description && (
            <div>
              <h4 className="text-sm font-semibold mb-1">Descrição</h4>
              <p className="text-sm text-muted-foreground">{task.description}</p>
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
            
            <div>
              <h4 className="text-sm font-semibold mb-2">Ações</h4>
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Edit className="mr-2 h-4 w-4" />
                  Editar tarefa
                </Button>
                <Button 
                  variant={task.status === "completed" ? "default" : "secondary"} 
                  size="sm" 
                  className="w-full justify-start"
                  onClick={() => onToggleTaskStatus(listId, task.id)}
                >
                  <CheckSquare className="mr-2 h-4 w-4" />
                  {task.status === "completed" ? "Marcar como pendente" : "Marcar como concluída"}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
