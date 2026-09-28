import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  CalendarIcon,
  Clock,
  CheckSquare,
  Gauge,
  User,
  ExternalLink,
} from "lucide-react";
import type { UnifiedTask } from "@/lib/taskUnified";
import {
  formatUnifiedDate,
  formatUnifiedTime,
  getChecklistProgressFromItems,
  getUnifiedStatusLabel,
  getUnifiedPriorityColor,
} from "./utils";
import { cn } from "@/lib/utils";

const DESCRIPTION_MAX_LINES = 3;

export interface TaskSummaryContentProps {
  task: UnifiedTask;
  /** Chamado ao clicar em "Abrir por completo". */
  onOpenFull: () => void;
  /** Classe no container. */
  className?: string;
}

export function TaskSummaryContent({
  task,
  onOpenFull,
  className,
}: TaskSummaryContentProps) {
  const isCompleted = task.status === "completed";
  const checklist = task.checklist ?? [];
  const progress = getChecklistProgressFromItems(checklist);
  const tags = [...(task.tags ?? []), ...(task.labels ?? [])];
  const assigneeInitials = task.assigneeName
    ? task.assigneeName
        .split(/\s+/)
        .map((s) => s[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Cabeçalho: status, prioridade, tipo */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant={isCompleted ? "secondary" : "outline"}
          className="text-xs font-normal"
        >
          {getUnifiedStatusLabel(task.status)}
        </Badge>
        <span
          className={cn(
            "text-xs text-muted-foreground",
            getUnifiedPriorityColor(task.priority)
          )}
        >
          {task.priority === "high"
            ? "Alta"
            : task.priority === "medium"
              ? "Média"
              : "Baixa"}
        </span>
        {task.taskType && task.taskType !== "task" && (
          <Badge variant="secondary" className="text-xs font-normal">
            {task.taskType}
          </Badge>
        )}
      </div>

      {/* Título */}
      <h3
        className={cn(
          "font-semibold text-sm leading-tight",
          isCompleted && "line-through opacity-70"
        )}
      >
        {task.title}
      </h3>

      {/* Datas e responsável */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {task.dueDate && (
          <span className="flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />
            {formatUnifiedDate(task.dueDate)}
            {task.dueTime && ` ${formatUnifiedTime(task.dueTime)}`}
          </span>
        )}
        {(task.startDate || task.startTime) && (
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {task.startDate && formatUnifiedDate(task.startDate)}
            {task.startTime && ` ${formatUnifiedTime(task.startTime)}`}
          </span>
        )}
        {(task.assigneeName || task.assigneeAvatar) && (
          <span className="flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            <Avatar className="h-4 w-4">
              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                {task.assigneeAvatar ?? assigneeInitials}
              </AvatarFallback>
            </Avatar>
            {task.assigneeName}
          </span>
        )}
      </div>

      {/* Descrição (2–3 linhas) */}
      {task.description?.trim() && (
        <p
          className={cn(
            "text-xs text-muted-foreground line-clamp-3",
            isCompleted && "line-through opacity-70"
          )}
        >
          {task.description.trim()}
        </p>
      )}

      {/* Checklist: X de Y + barra + lista */}
      {checklist.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckSquare className="h-3.5 w-3.5" />
            <span>
              {checklist.filter((i) => i.completed).length} de {checklist.length}{" "}
              itens
            </span>
            <div className="flex-1 h-1.5 bg-muted rounded-full min-w-[60px]">
              <div
                className="h-1.5 bg-primary rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <ul className="space-y-0.5 pl-5 text-xs text-muted-foreground max-h-24 overflow-y-auto">
            {checklist.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-1.5",
                  item.completed && "line-through opacity-70"
                )}
              >
                <span className="text-primary">
                  {item.completed ? "✓" : "○"}
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tags e esforço */}
      <div className="flex flex-wrap items-center gap-2">
        {tags.slice(0, 8).map((tag) => (
          <span
            key={tag}
            className="text-[10px] bg-muted px-1.5 py-0.5 rounded"
          >
            {tag}
          </span>
        ))}
        {tags.length > 8 && (
          <span className="text-[10px] text-muted-foreground">+{tags.length - 8}</span>
        )}
        {(task.estimatedEffortHours != null || task.estimatedStoryPoints != null) && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Gauge className="h-3 w-3" />
            {task.estimatedEffortHours != null && `${task.estimatedEffortHours}h`}
            {task.estimatedEffortHours != null && task.estimatedStoryPoints != null && " · "}
            {task.estimatedStoryPoints != null && `${task.estimatedStoryPoints} pts`}
          </span>
        )}
      </div>

      {/* Botão Abrir por completo */}
      <Button
        type="button"
        variant="default"
        size="sm"
        className="w-full mt-1"
        onClick={onOpenFull}
        aria-label={`Abrir tarefa "${task.title}" em janela completa`}
      >
        <ExternalLink className="h-4 w-4 mr-2" />
        Abrir por completo
      </Button>
    </div>
  );
}
