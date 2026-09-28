import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { AlertTriangle, CalendarDays, GripHorizontal, PanelRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { Task } from "@/services/tasks";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { ClientEntityLink } from "@/components/entities";

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
  isDragOverlay = false,
}: {
  task: Task;
  dragDisabled: boolean;
  dragReason: string | null;
  onOpen: (task: Task) => void;
  isDragOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: dragDisabled || isDragOverlay,
    data: { task },
  });

  const style = !isDragOverlay && transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const checklist = task.checklist ?? [];
  const done = checklist.filter((i) => i.completed).length;
  const total = checklist.length;
  const assigneeName = task.assignee?.trim() || null;
  const assigneeInitials = assigneeName
    ? assigneeName
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join("")
    : "?";

  const card = (
    <Card
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      className={cn(
        "relative select-none rounded-xl border border-border/70 border-l-4 bg-card text-card-foreground shadow-sm transition-[box-shadow,border-color,background-color,transform] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/20 hover:shadow-md",
        priorityAccent(task.priority),
        dragDisabled ? "cursor-default opacity-90" : "cursor-grab touch-manipulation active:cursor-grabbing",
        isDragging && "opacity-25 ring-2 ring-primary/20",
        isDragOverlay && "w-[280px] max-w-[86vw] rotate-1 scale-[1.02] cursor-grabbing border-primary/40 opacity-95 shadow-2xl ring-2 ring-primary/15 sm:w-[300px]"
      )}
      onClick={() => onOpen(task)}
      {...(dragDisabled || isDragOverlay ? {} : listeners)}
      {...(dragDisabled || isDragOverlay ? {} : attributes)}
    >
      <CardContent className="space-y-2.5 p-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
              {originShort(task)}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-normal">
              {task.normalized_status === "done" ? "Concluída" : "Aberta"}
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
            className="-mr-1 -mt-0.5 h-7 w-7 shrink-0 rounded-lg"
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
        <p className="line-clamp-3 font-semibold leading-snug">{task.title}</p>
        {(() => {
          const cid = task.clientId ?? (task as { client_id?: string | null }).client_id ?? null;
          const clientDisplay = (task.client_name || task.client || "").trim();
          if (cid && clientDisplay && !task.project_name) {
            return (
              <div className="min-w-0 text-xs text-muted-foreground">
                <ClientEntityLink
                  clientId={cid}
                  name={clientDisplay}
                  variant="compact"
                  stopPropagationOnClick
                  className="block truncate"
                />
              </div>
            );
          }
          const label = linkedLabel(task);
          if (!label) return null;
          return (
            <p className="text-xs text-muted-foreground truncate" title={label}>
              {label}
            </p>
          );
        })()}
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {task.date && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDue(task.date)}
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
          <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/35 px-2 py-1.5 text-xs text-muted-foreground">
            <Avatar className="h-6 w-6 border border-border/60">
              <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                {assigneeInitials || <User className="h-3.5 w-3.5" />}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">Resp.: {task.assignee}</span>
          </div>
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
        "kanban-column flex h-full min-h-[min(520px,78dvh)] w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm transition-[background-color,border-color,box-shadow,ring] sm:w-[300px]",
        isOver && "border-primary/35 bg-primary/5 shadow-lg ring-2 ring-primary/25"
      )}
    >
      <CardHeader className="rounded-t-xl border-b bg-muted/60 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-2 ring-background" />
            <span className="truncate text-sm font-semibold">{label}</span>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col bg-muted/10 p-0">
        <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]]:!block [&_[data-radix-scroll-area-viewport]]:max-h-full [&_[data-radix-scroll-area-viewport]]:min-h-[220px]">
          <div className={cn("flex min-h-full flex-col gap-2 p-2 transition-colors", isOver && "bg-primary/10")}>
            {count === 0 ? (
              <div className="flex min-h-[220px] flex-1 flex-col justify-center rounded-lg border border-dashed border-border/60 bg-background/45 px-3 py-6 text-center">
                <p className="text-xs font-medium text-muted-foreground">Nenhuma tarefa nesta etapa.</p>
                <p className="mt-1 text-[10px] text-muted-foreground/90">Arraste um card para atualizar o status.</p>
              </div>
            ) : (
              children
            )}
          </div>
        </ScrollArea>
      </CardContent>
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
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const boardInnerRef = useRef<HTMLDivElement>(null);
  const panStripState = useRef({ active: false, pointerId: 0, startX: 0, startScroll: 0 });
  const [boardHScroll, setBoardHScroll] = useState({ scrollWidth: 0, clientWidth: 0 });
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTaskId(null);
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
  }, [tasks.length]);

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
  const activeTask = activeTaskId ? tasks.find((task) => task.id === activeTaskId) ?? null : null;

  return (
    <TooltipProvider delayDuration={300}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveTaskId(null)}>
        <div className="flex min-h-[min(72dvh,650px)] min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-muted/20 px-1 pb-2 pt-1 shadow-inner">
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
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
          {activeTask ? (
            <KanbanCard
              task={activeTask}
              dragDisabled={false}
              dragReason={null}
              onOpen={() => {}}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </TooltipProvider>
  );
}
