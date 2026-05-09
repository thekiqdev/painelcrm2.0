import React, { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { AlertTriangle, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { Task } from "@/services/tasks";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  KANBAN_COLUMNS,
  taskKanbanColumn,
  type KanbanColumnId,
} from "@/utils/tasksKanbanStatus";

function originShort(task: Task): string {
  const o = task.origin;
  if (!o || o === "standalone") return "Avulsa";
  if (o === "project") return "Projeto";
  if (o === "client") return "Cliente";
  if (o === "lead") return "Lead";
  return "Avulsa";
}

function linkedLabel(task: Task): string | null {
  if (task.project_name) return task.project_name;
  if (task.client_name) return task.client_name;
  if (task.lead_name) return task.lead_name;
  if (task.client) return task.client;
  return null;
}

function priorityAccent(priority: Task["priority"]): string {
  if (priority === "high") return "border-l-destructive";
  if (priority === "medium") return "border-l-amber-500";
  return "border-l-sky-600";
}

function formatDue(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return format(d, "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

function isOverdue(task: Task): boolean {
  if (!task.date || task.normalized_status === "done") return false;
  const today = format(new Date(), "yyyy-MM-dd");
  return task.date < today;
}

function KanbanCard({
  task,
  dragDisabled,
  dragReason,
  onOpen,
}: {
  task: Task;
  dragDisabled: boolean;
  dragReason: string | null;
  onOpen: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    disabled: dragDisabled,
    data: { task },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const checklist = task.checklist ?? [];
  const done = checklist.filter((i) => i.completed).length;
  const total = checklist.length;

  const card = (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-l-4 bg-card shadow-sm transition-shadow hover:shadow-md select-none",
        priorityAccent(task.priority),
        dragDisabled ? "opacity-90 cursor-default" : "cursor-grab active:cursor-grabbing touch-manipulation"
      )}
      onClick={() => onOpen(task)}
      {...(dragDisabled ? {} : listeners)}
      {...(dragDisabled ? {} : attributes)}
    >
      <CardContent className="p-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-1">
          <div className="flex flex-wrap items-center gap-1 min-w-0">
            <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
              {originShort(task)}
            </Badge>
            {isOverdue(task) && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-destructive">
                <AlertTriangle className="h-3 w-3" />
                Atrasada
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 -mr-1 -mt-0.5"
            aria-label="Ver detalhes"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(task);
            }}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="font-medium leading-snug line-clamp-3">{task.title}</p>
        {linkedLabel(task) && (
          <p className="text-xs text-muted-foreground truncate" title={linkedLabel(task) ?? undefined}>
            {linkedLabel(task)}
          </p>
        )}
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {task.date && (
            <span>
              Prazo: {formatDue(task.date)}
              {task.time ? ` · ${task.time}` : ""}
            </span>
          )}
          <span
            className={cn(
              task.priority === "high" && "text-destructive font-medium",
              task.priority === "medium" && "text-amber-700 dark:text-amber-400"
            )}
          >
            {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Média" : "Baixa"}
          </span>
        </div>
        {task.assignee && (
          <p className="text-xs text-muted-foreground truncate">Resp.: {task.assignee}</p>
        )}
        {total > 0 && (
          <p className="text-xs text-muted-foreground">
            Checklist {done}/{total}
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (dragDisabled && dragReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px]">
          <p>{dragReason}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return card;
}

function KanbanColumnDropzone({
  columnId,
  label,
  count,
  children,
}: {
  columnId: KanbanColumnId;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const droppableId = `kanban-${columnId}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-xl border bg-muted/20 min-w-[min(100%,280px)] w-[min(100%,280px)] sm:w-[260px] shrink-0 shadow-sm",
        isOver && "ring-2 ring-primary/30 bg-muted/40"
      )}
    >
      <div className="px-3 py-2 border-b bg-muted/40 rounded-t-xl">
        <p className="text-sm font-semibold">
          {label}
          <span className="ml-1.5 text-muted-foreground font-normal">({count})</span>
        </p>
      </div>
      <ScrollArea className="h-[min(65vh,560px)] px-2 py-2">
        <div className="flex flex-col gap-2 pb-4">{children}</div>
      </ScrollArea>
    </div>
  );
}

export interface TasksKanbanBoardProps {
  tasks: Task[];
  onMoveTask: (taskId: string, column: KanbanColumnId) => void | Promise<void>;
  canMoveTask: (task: Task) => boolean;
  moveBlockedReason: (task: Task) => string | null;
  onOpenTask: (task: Task) => void;
}

export function TasksKanbanBoard({
  tasks,
  onMoveTask,
  canMoveTask,
  moveBlockedReason,
  onOpenTask,
}: TasksKanbanBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    })
  );

  const grouped = useMemo(() => {
    const map: Record<KanbanColumnId, Task[]> = {
      todo: [],
      in_progress: [],
      waiting: [],
      done: [],
    };
    for (const t of tasks) {
      const col = taskKanbanColumn(t);
      map[col].push(t);
    }
    return map;
  }, [tasks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const task = tasks.find((x) => x.id === taskId);
    if (!task) return;

    const overId = String(over.id);
    let target: KanbanColumnId | null = null;
    if (overId.startsWith("kanban-")) {
      target = overId.replace("kanban-", "") as KanbanColumnId;
    } else {
      const hit = tasks.find((x) => x.id === overId);
      if (hit) target = taskKanbanColumn(hit);
    }
    if (!target) return;
    if (taskKanbanColumn(task) === target) return;
    void onMoveTask(taskId, target);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 pt-1 -mx-1 px-1 scroll-smooth md:justify-start">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumnDropzone
            key={col.id}
            columnId={col.id}
            label={col.label}
            count={grouped[col.id].length}
          >
            {grouped[col.id].map((task) => {
              const ok = canMoveTask(task);
              const reason = moveBlockedReason(task);
              return (
                <KanbanCard
                  key={task.id}
                  task={task}
                  dragDisabled={!ok}
                  dragReason={reason}
                  onOpen={onOpenTask}
                />
              );
            })}
          </KanbanColumnDropzone>
        ))}
        </div>
      </DndContext>
    </TooltipProvider>
  );
}
