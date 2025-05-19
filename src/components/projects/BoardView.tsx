
import React from "react";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit, Trash2, Plus, Check, ClipboardList, Calendar, User } from "lucide-react";
import { ProjectList, Task } from "./types";
import { TaskCard } from "./TaskCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface BoardViewProps {
  lists: ProjectList[];
  onToggleTaskStatus: (listId: string, taskId: string) => void;
  onTaskClick: (task: Task, listId: string) => void;
  onAddTask: (listId: string) => void;
  onEditList: (list: ProjectList) => void;
  onDeleteList: (listId: string) => void;
  onAddList: () => void;
}

export function BoardView({
  lists,
  onToggleTaskStatus,
  onTaskClick,
  onAddTask,
  onEditList,
  onDeleteList,
  onAddList
}: BoardViewProps) {
  // Calcular progresso do checklist
  const getChecklistProgress = (task: Task) => {
    const checklist = task.checklist || [];
    if (checklist.length === 0) return 0;
    const completed = checklist.filter(item => item.completed).length;
    return Math.round((completed / checklist.length) * 100);
  };

  // Formatar data
  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    return format(new Date(dateString), "dd/MM/yyyy");
  };

  // Obter prioridade
  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case "high": return "text-red-500";
      case "medium": return "text-amber-500";
      case "low": return "text-blue-500";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="flex-1 h-full">
      <div className="flex gap-4 h-full overflow-x-auto pb-6">
        {lists.sort((a, b) => a.order - b.order).map(list => (
          <div key={list.id} className="flex-shrink-0 w-80 bg-muted/30 rounded-md overflow-hidden shadow-sm">
            <div className="p-2 bg-muted/50">
              <div className="flex items-center justify-between">
                <h3 className="font-medium truncate">{list.name}</h3>
                <div className="flex items-center space-x-1">
                  <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full">
                    {list.tasks.length}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditList(list)}>
                        <Edit className="h-3.5 w-3.5 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => onDeleteList(list.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
            <div className="p-2 space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
              {list.tasks.map(task => (
                <Card 
                  key={task.id} 
                  className={cn(
                    "shadow-sm cursor-pointer hover:shadow transition-shadow",
                    {"opacity-80": task.status === "completed"}
                  )}
                  onClick={() => onTaskClick(task, list.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={task.status === "completed"}
                        onCheckedChange={() => onToggleTaskStatus(list.id, task.id)}
                        className="mt-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className={cn(
                            "font-medium", 
                            {"line-through opacity-70": task.status === "completed"}
                          )}>
                            {task.title}
                          </h4>
                          <div className="flex items-center gap-1">
                            <span className={cn("h-2 w-2 rounded-full", getPriorityColor(task.priority))}></span>
                            <span className="text-xs text-muted-foreground">
                              {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Média" : "Baixa"}
                            </span>
                          </div>
                        </div>
                        
                        {task.description && (
                          <p className={cn(
                            "text-xs text-muted-foreground mb-2", 
                            {"line-through opacity-70": task.status === "completed"}
                          )}>
                            {task.description.length > 60 
                              ? task.description.substring(0, 60) + "..." 
                              : task.description}
                          </p>
                        )}
                        
                        {task.checklist && task.checklist.length > 0 && (
                          <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground">
                            <Check className="h-3 w-3" />
                            <span>
                              {task.checklist.filter(item => item.completed).length}/{task.checklist.length}
                            </span>
                            <div className="flex-1 h-1 bg-muted rounded-full ml-1">
                              <div 
                                className="h-1 bg-primary rounded-full" 
                                style={{ width: `${getChecklistProgress(task)}%` }} 
                              />
                            </div>
                          </div>
                        )}
                        
                        <div className="flex flex-wrap gap-1 mb-2">
                          {task.tags && task.tags.map(tag => (
                            <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {task.dueDate && (
                              <div className="flex items-center">
                                <Calendar className="h-3 w-3 mr-1" />
                                <span>{formatDate(task.dueDate)}</span>
                              </div>
                            )}
                          </div>
                          
                          {task.assignee && (
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                                {task.assignee.avatar}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground"
                onClick={() => onAddTask(list.id)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Tarefa
              </Button>
            </div>
          </div>
        ))}
        <div className="flex-shrink-0 w-60">
          <Button variant="outline" className="w-full h-10" onClick={onAddList}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Etapa
          </Button>
        </div>
      </div>
    </div>
  );
}
