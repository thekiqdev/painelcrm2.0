
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
  // For task drag and drop
  onMoveTask?: (taskId: string, sourceListId: string, targetListId: string) => void;
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
  onMoveProject,
  // Task drag and drop props
  onMoveTask
}: BoardViewProps) {
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

  // Handle project drag start
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, projectId: string) => {
    e.dataTransfer.setData("projectId", projectId);
  };

  // Handle task drag start
  const handleTaskDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string, listId: string) => {
    e.dataTransfer.setData("taskId", taskId);
    e.dataTransfer.setData("sourceListId", listId);
    e.stopPropagation(); // Prevent parent elements from also handling this event
  };

  // Handle drop zone
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Handle project drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, listId: string) => {
    e.preventDefault();
    
    // Check if we're dropping a project
    const projectId = e.dataTransfer.getData("projectId");
    if (projectId && onMoveProject) {
      onMoveProject(projectId, listId);
      return;
    }
    
    // Check if we're dropping a task
    const taskId = e.dataTransfer.getData("taskId");
    const sourceListId = e.dataTransfer.getData("sourceListId");
    if (taskId && sourceListId && onMoveTask && sourceListId !== listId) {
      onMoveTask(taskId, sourceListId, listId);
    }
  };

  // Get projects for a specific stage in Kanban view
  const getProjectsForStage = (stageId: string): Project[] => {
    if (!projects) return [];
    return projects.filter(project => project.kanbanStage === stageId);
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

  // Wrap task card with drag functionality
  const renderDraggableTaskCard = (task: Task, listId: string) => (
    <div
      key={task.id} 
      draggable
      onDragStart={(e) => handleTaskDragStart(e, task.id, listId)}
      className="mb-3 last:mb-0"
    >
      <TaskCard 
        task={task}
        listId={listId}
        onClick={() => onTaskClick(task, listId)}
        onToggleStatus={() => onToggleTaskStatus(listId, task.id)}
      />
    </div>
  );

  return (
    <div className="flex-1 h-full">
      <div className="flex gap-4 h-full overflow-x-auto pb-6">
        {lists.sort((a, b) => a.order - b.order).map(list => (
          <div 
            key={list.id} 
            className="flex-shrink-0 w-80 bg-muted/30 rounded-md overflow-hidden shadow-sm"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, list.id)}
          >
            <div className="p-2 bg-muted/50">
              <div className="flex items-center justify-between">
                <h3 className="font-medium truncate">{list.name}</h3>
                <div className="flex items-center space-x-1">
                  <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full">
                    {isProjectView ? getProjectsForStage(list.id).length : list.tasks.length}
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
                  {getProjectsForStage(list.id).map(project => renderProjectCard(project))}
                </>
              ) : (
                // Task view (normal board)
                <>
                  {list.tasks.map(task => renderDraggableTaskCard(task, list.id))}
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
