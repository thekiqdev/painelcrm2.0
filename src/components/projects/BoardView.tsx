
import React, { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit, Trash2, Plus, Check, ClipboardList, Calendar, User, ChevronDown, ChevronUp, Upload, GripHorizontal } from "lucide-react";
import { ProjectList, Task, Project } from "./types";
import { TaskCard } from "./TaskCard";
import { UnifiedTaskCard, TaskSummaryPopover } from "@/components/tasks";
import { projectUITaskToUnified } from "@/lib/taskUnified";
import type { UnifiedTask } from "@/lib/taskUnified";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClientEntityLink } from "@/components/entities";

interface BoardViewProps {
  lists: ProjectList[];
  onToggleTaskStatus: (listId: string, taskId: string) => void;
  onTaskClick: (task: Task, listId: string) => void;
  onAddTask: (listId: string) => void;
  onEditList: (list: ProjectList) => void;
  onDeleteList: (listId: string) => void;
  onImportTasks?: (listId: string) => void;
  /** Desativa «Importar» durante upload (ex.: importação em curso). */
  importTasksDisabled?: boolean;
  onAddList: () => void;
  // For Kanban-style project view
  projects?: Project[];
  isProjectView?: boolean;
  onProjectClick?: (project: Project) => void;
  onAddProject?: () => void;
  onMoveProject?: (projectId: string, newListId: string) => void;
  // For task drag and drop
  onMoveTask?: (taskId: string, sourceListId: string, targetListId: string) => void;
  // Fluxo unificado: card resumo + abrir completo
  projectId?: string;
  areaId?: string | null;
  onOpenFull?: (task: UnifiedTask) => void;
}

export function BoardView({
  lists,
  onToggleTaskStatus,
  onTaskClick,
  onAddTask,
  onEditList,
  onDeleteList,
  onImportTasks,
  importTasksDisabled = false,
  onAddList,
  // Project view props
  projects,
  isProjectView = false,
  onProjectClick,
  onAddProject,
  onMoveProject,
  // Task drag and drop props
  onMoveTask,
  projectId,
  areaId,
  onOpenFull,
}: BoardViewProps) {
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const boardInnerRef = useRef<HTMLDivElement>(null);
  const panStripState = useRef({ active: false, pointerId: 0, startX: 0, startScroll: 0 });
  const [boardHScroll, setBoardHScroll] = useState({ scrollWidth: 0, clientWidth: 0 });
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  
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
    e.dataTransfer.effectAllowed = "move";
    setDraggingProjectId(projectId);
  };

  // Handle task drag start
  const handleTaskDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string, listId: string) => {
    e.dataTransfer.setData("taskId", taskId);
    e.dataTransfer.setData("sourceListId", listId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingTaskId(taskId);
    e.stopPropagation(); // Prevent parent elements from also handling this event
  };

  // Handle drop zone
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, listId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverListId(listId);
  };

  // Handle project drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, listId: string) => {
    e.preventDefault();
    setDragOverListId(null);
    setDraggingProjectId(null);
    setDraggingTaskId(null);
    
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
  const handleDragEnd = () => {
    setDragOverListId(null);
    setDraggingProjectId(null);
    setDraggingTaskId(null);
  };

  useLayoutEffect(() => {
    const main = boardScrollRef.current;
    const inner = boardInnerRef.current;
    if (!main || !inner) return;
    const update = () => setBoardHScroll({ scrollWidth: main.scrollWidth, clientWidth: main.clientWidth });
    const ro = new ResizeObserver(update);
    ro.observe(main);
    ro.observe(inner);
    update();
    return () => ro.disconnect();
  }, [lists.length, projects?.length, isProjectView]);

  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        el.scrollLeft += e.deltaX;
        e.preventDefault();
      } else if (e.shiftKey) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, []);

  const hasHorizontalOverflow = boardHScroll.scrollWidth > boardHScroll.clientWidth + 2;
  const onPanStripPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const main = boardScrollRef.current;
    if (!main || main.scrollWidth <= main.clientWidth) return;
    panStripState.current = { active: true, pointerId: e.pointerId, startX: e.clientX, startScroll: main.scrollLeft };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPanStripPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!panStripState.current.active) return;
    const main = boardScrollRef.current;
    if (!main) return;
    main.scrollLeft = panStripState.current.startScroll - (e.clientX - panStripState.current.startX);
  };
  const onPanStripPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!panStripState.current.active) return;
    panStripState.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(panStripState.current.pointerId);
    } catch {
      /* ignore */
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
      className={cn(
        "mb-2 cursor-grab select-none rounded-xl border border-border/70 bg-card shadow-sm transition-[box-shadow,border-color,background-color,opacity,transform] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/20 hover:shadow-md active:cursor-grabbing",
        draggingProjectId === project.id && "opacity-35 ring-2 ring-primary/20"
      )}
      onClick={() => onProjectClick && onProjectClick(project)}
      draggable
      onDragStart={(e) => handleDragStart(e, project.id)}
      onDragEnd={handleDragEnd}
    >
      <CardContent className="space-y-2.5 p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h4 className="line-clamp-2 font-semibold leading-snug">{project.name}</h4>
              {project.status === "active" && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Ativo
                </span>
              )}
            </div>
            
            {project.description && (
              <div className="mb-2">
                <p className={`text-xs text-muted-foreground ${expandedDescriptions[project.id] ? '' : 'line-clamp-2'}`}>
                  {project.description}
                </p>
                {project.description.length > 100 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-auto p-0 text-[10px] text-primary hover:text-primary/80"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedDescriptions(prev => ({
                        ...prev,
                        [project.id]: !prev[project.id]
                      }));
                    }}
                  >
                    {expandedDescriptions[project.id] ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-1" />
                        Ler menos
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        Ler mais
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
            
            <div className="mb-2 flex items-center text-xs text-muted-foreground">
              <Calendar className="h-3 w-3 mr-1" />
              {project.dueDate && formatDate(project.dueDate)}
            </div>

            {project.client_id ? (
              <div className="mb-2 min-w-0 text-xs text-muted-foreground">
                <span className="mr-1">Cliente:</span>
                <ClientEntityLink
                  clientId={project.client_id}
                  name={project.clientName}
                  disabledFallbackText="Cliente não identificado"
                  variant="compact"
                  stopPropagationOnClick
                  className="inline min-w-0 max-w-full align-baseline"
                />
              </div>
            ) : null}
            
            <div className="mb-2 flex flex-wrap gap-1">
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
              <div className="mt-2 flex items-center justify-end">
                <Avatar className="h-6 w-6 border border-border/60">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
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

  const renderDraggableTaskCard = (task: Task, listId: string) => {
    const useUnified = onOpenFull != null;
    const unifiedTask = useUnified
      ? projectUITaskToUnified(task, {
          listId,
          projectId: projectId ?? undefined,
          areaId: areaId ?? undefined,
        })
      : null;

    const cardContent = useUnified && unifiedTask ? (
      <TaskSummaryPopover
        task={unifiedTask}
        onOpenFull={() => onOpenFull(unifiedTask)}
      >
        <div className="mb-3 last:mb-0">
          <UnifiedTaskCard
            task={unifiedTask}
            listId={listId}
            onToggleStatus={(taskId, listIdParam) =>
              onToggleTaskStatus(listIdParam ?? listId, taskId)
            }
            onClick={() => {}}
          />
        </div>
      </TaskSummaryPopover>
    ) : (
      <TaskCard
        task={task}
        listId={listId}
        onClick={() => onTaskClick(task, listId)}
        onToggleStatus={onToggleTaskStatus}
      />
    );

    const canDrag = onMoveTask != null;
    return (
      <div
        key={task.id}
        draggable={canDrag}
        onDragStart={
          canDrag ? (e) => handleTaskDragStart(e, task.id, listId) : undefined
        }
        onDragEnd={handleDragEnd}
        className={cn(
          "mb-3 last:mb-0",
          useUnified && "cursor-pointer",
          canDrag && "cursor-grab active:cursor-grabbing",
          draggingTaskId === task.id && "opacity-35 ring-2 ring-primary/20"
        )}
      >
        {cardContent}
      </div>
    );
  };

  return (
    <div className="flex min-h-[min(72dvh,650px)] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/50 bg-muted/20 px-1 pb-2 pt-1 shadow-inner">
      {hasHorizontalOverflow ? (
        <div
          className="mb-1.5 flex h-6 shrink-0 cursor-grab select-none items-center justify-center gap-1 rounded-md border border-border/40 bg-background/70 px-2 text-[11px] leading-tight text-muted-foreground hover:bg-background active:cursor-grabbing"
          onPointerDown={onPanStripPointerDown}
          onPointerMove={onPanStripPointerMove}
          onPointerUp={onPanStripPointerUp}
          onPointerCancel={onPanStripPointerUp}
          title="Clique e arraste para deslocar o quadro"
        >
          <GripHorizontal className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
          Arraste para mover o quadro horizontalmente
        </div>
      ) : null}
      <div ref={boardScrollRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth scrollbar-thin">
        <div ref={boardInnerRef} className="flex h-full min-h-[min(68dvh,600px)] w-max items-stretch gap-3 px-2 py-2 sm:gap-4">
        {lists.sort((a, b) => a.order - b.order).map(list => {
          const count = isProjectView ? getProjectsForStage(list.id).length : list.tasks.length;
          return (
          <div
            key={list.id}
            className={cn(
              "kanban-column flex h-full min-h-[min(520px,78dvh)] w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm transition-[background-color,border-color,box-shadow,ring] sm:w-[300px]",
              dragOverListId === list.id && "border-primary/35 bg-primary/5 shadow-lg ring-2 ring-primary/25"
            )}
            onDragOver={(e) => handleDragOver(e, list.id)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDragOverListId(null);
              }
            }}
            onDrop={(e) => handleDrop(e, list.id)}
          >
            <CardHeader className="rounded-t-xl border-b bg-muted/60 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-2 ring-background" />
                  <h3 className="truncate text-sm font-semibold">{list.name}</h3>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="secondary" className="shrink-0">
                    {count}
                  </Badge>
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
                      {!isProjectView && onImportTasks ? (
                        <DropdownMenuItem
                          disabled={importTasksDisabled}
                          onClick={() => onImportTasks(list.id)}
                        >
                          <Upload className="h-3.5 w-3.5 mr-2" />
                          Importar
                        </DropdownMenuItem>
                      ) : null}
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
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col bg-muted/10 p-0">
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <div className="flex min-h-full flex-col gap-2">
              {isProjectView ? (
                // Project view (Kanban)
                <>
                  {count === 0 ? (
                    <div className="flex min-h-[220px] flex-1 flex-col justify-center rounded-lg border border-dashed border-border/60 bg-background/45 px-3 py-6 text-center">
                      <p className="text-xs font-medium text-muted-foreground">Nenhum projeto nesta etapa.</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/90">Arraste um card para atualizar a etapa.</p>
                    </div>
                  ) : (
                    getProjectsForStage(list.id).map(project => renderProjectCard(project))
                  )}
                </>
              ) : (
                // Task view (normal board)
                <>
                  {count === 0 ? (
                    <div className="flex min-h-[220px] flex-1 flex-col justify-center rounded-lg border border-dashed border-border/60 bg-background/45 px-3 py-6 text-center">
                      <p className="text-xs font-medium text-muted-foreground">Nenhuma tarefa nesta etapa.</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/90">Arraste um card para atualizar a etapa.</p>
                    </div>
                  ) : (
                    list.tasks.map(task => renderDraggableTaskCard(task, list.id))
                  )}
                </>
              )}
              <Button 
                variant="ghost" 
                className="mt-1 w-full justify-start rounded-lg text-muted-foreground hover:bg-background/70"
                onClick={() => isProjectView ? onAddProject && onAddProject() : onAddTask(list.id)}
              >
                <Plus className="h-4 w-4 mr-1" />
                {isProjectView ? "Adicionar Projeto" : "Adicionar Tarefa"}
              </Button>
                </div>
              </div>
            </CardContent>
          </div>
        );
        })}
        <div className="w-[240px] shrink-0">
          <Button variant="outline" className="h-10 w-full rounded-xl" onClick={onAddList}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Etapa
          </Button>
        </div>
        </div>
      </div>
            </div>
  );
}
