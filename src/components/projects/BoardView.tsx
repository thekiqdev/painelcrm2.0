
import React from "react";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit, Trash2, Plus, Check, ClipboardList, Calendar, User } from "lucide-react";
import { ProjectList, Task, Project } from "./types";
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
import { Progress } from "@/components/ui/progress";

interface BoardViewProps {
  lists: ProjectList[];
  onToggleTaskStatus: (listId: string, taskId: string) => void;
  onTaskClick: (task: Task, listId: string) => void;
  onAddTask: (listId: string) => void;
  onEditList: (list: ProjectList) => void;
  onDeleteList: (listId: string) => void;
  onAddList: () => void;
  // For Kanban-style project view
  projects?: Project[];
  isProjectView?: boolean;
  onProjectClick?: (project: Project) => void;
  onAddProject?: () => void;
  onMoveProject?: (projectId: string, newListId: string) => void;
}

export function BoardView({
  lists,
  onToggleTaskStatus,
  onTaskClick,
  onAddTask,
  onEditList,
  onDeleteList,
  onAddList,
  // Project view props
  projects,
  isProjectView = false,
  onProjectClick,
  onAddProject,
  onMoveProject
}: BoardViewProps) {
  // Calcular progresso do checklist
  const getChecklistProgress = (task: Task) => {
    const checklist = task.checklist || [];
    if (checklist.length === 0) return 0;
    const completed = checklist.filter(item => item.completed).length;
    return Math.round((completed / checklist.length) * 100);
  };

  // Calculate project progress
  const calculateProgress = (project: Project): number => {
    if (!project.lists || project.lists.length === 0) return 0;
    
    const totalTasks = project.lists.reduce((acc, list) => acc + list.tasks.length, 0);
    if (totalTasks === 0) return 0;
    
    const completedTasks = project.lists.reduce(
      (acc, list) => acc + list.tasks.filter(task => task.status === "completed").length, 
      0
    );
    
    return Math.round((completedTasks / totalTasks) * 100);
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

  // Handle project drag start
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, projectId: string) => {
    e.dataTransfer.setData("projectId", projectId);
  };

  // Handle drop zone
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Handle project drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, listId: string) => {
    e.preventDefault();
    const projectId = e.dataTransfer.getData("projectId");
    if (onMoveProject) {
      onMoveProject(projectId, listId);
    }
  };

  // Render project card
  const renderProjectCard = (project: Project) => (
    <Card 
      key={project.id} 
      className="shadow-sm cursor-pointer hover:shadow transition-shadow mb-3"
      onClick={() => onProjectClick && onProjectClick(project)}
      draggable
      onDragStart={(e) => handleDragStart(e, project.id)}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-medium">{project.name}</h4>
              {project.status === "active" && (
                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium">
                  Ativo
                </span>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground mb-2">
              {project.description.length > 60 
                ? project.description.substring(0, 60) + "..." 
                : project.description}
            </p>
            
            <div className="flex items-center text-xs text-muted-foreground mb-2">
              <Calendar className="h-3 w-3 mr-1" />
              {project.dueDate && formatDate(project.dueDate)}
            </div>
            
            <div className="flex flex-wrap gap-1 mb-2">
              {project.tags && project.tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
            
            <div className="flex items-center justify-between mb-1 text-xs">
              <span>Progresso</span>
              <span>{calculateProgress(project)}%</span>
            </div>
            
            <Progress value={calculateProgress(project)} className="h-1.5 mb-2" />
            
            {project.members && project.members.length > 0 && (
              <div className="flex items-center justify-end mt-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {project.members[0].avatar}
                  </AvatarFallback>
                </Avatar>
                {project.members.length > 1 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    +{project.members.length - 1}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex-1 h-full">
      <div className="flex gap-4 h-full overflow-x-auto pb-6">
        {lists.sort((a, b) => a.order - b.order).map(list => (
          <div 
            key={list.id} 
            className="flex-shrink-0 w-80 bg-muted/30 rounded-md overflow-hidden shadow-sm"
            onDragOver={handleDragOver}
            onDrop={(e) => isProjectView && onMoveProject ? handleDrop(e, list.id) : null}
          >
            <div className="p-2 bg-muted/50">
              <div className="flex items-center justify-between">
                <h3 className="font-medium truncate">{list.name}</h3>
                <div className="flex items-center space-x-1">
                  <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full">
                    {isProjectView ? projects?.filter(p => p.id === list.id).length || 0 : list.tasks.length}
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
              {isProjectView ? (
                // Project view (Kanban)
                <>
                  {projects?.filter(p => p.id === list.id).map(project => renderProjectCard(project))}
                </>
              ) : (
                // Task view (normal board)
                <>
                  {list.tasks.map(task => (
                    <TaskCard 
                      key={task.id}
                      task={task}
                      onClick={() => onTaskClick(task, list.id)}
                      onToggleStatus={() => onToggleTaskStatus(list.id, task.id)}
                      getChecklistProgress={getChecklistProgress}
                      formatDate={formatDate}
                      getPriorityColor={getPriorityColor}
                    />
                  ))}
                </>
              )}
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground"
                onClick={() => isProjectView ? onAddProject && onAddProject() : onAddTask(list.id)}
              >
                <Plus className="h-4 w-4 mr-1" />
                {isProjectView ? "Adicionar Projeto" : "Adicionar Tarefa"}
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
