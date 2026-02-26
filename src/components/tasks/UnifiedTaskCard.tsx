import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  CalendarIcon,
  Clock,
  Paperclip,
  Video,
  Repeat,
  Circle,
  CheckSquare,
  Gauge,
} from "lucide-react";
import type { UnifiedTask } from "@/lib/taskUnified";
import {
  getUnifiedPriorityColor,
  getUnifiedPriorityBorder,
  formatUnifiedDate,
  formatUnifiedTime,
  getChecklistProgressFromItems,
  getUnifiedStatusLabel,
} from "./utils";
import { cn } from "@/lib/utils";

const MAX_TAGS_VISIBLE = 4;

export interface UnifiedTaskCardProps {
  task: UnifiedTask;
  /** ListId no contexto de projeto (para onToggleStatus). */
  listId?: string | null;
  /** Toggle concluída; se não informado, checkbox não é exibido. */
  onToggleStatus?: (taskId: string, listId?: string | null) => void;
  /** Clique no card: abre resumo. */
  onClick: () => void;
  /** Classe adicional no container. */
  className?: string;
}

export function UnifiedTaskCard({
  task,
  listId,
  onToggleStatus,
  onClick,
  className,
}: UnifiedTaskCardProps) {
  const isCompleted = task.status === "completed";
  const checklist = task.checklist ?? [];
  const checklistProgress = getChecklistProgressFromItems(checklist);
  const tags = task.tags ?? [];
  const labels = task.labels ?? [];
  const allTags = [...tags, ...labels];
  const visibleTags = allTags.slice(0, MAX_TAGS_VISIBLE);
  const remainingTags = allTags.length - MAX_TAGS_VISIBLE;
  const tagColors = (task.customFields?.tagColors as Record<string, string> | undefined) ?? {};
  const showAssignee = task.assigneeName || task.assigneeAvatar;
  const assigneeInitials = task.assigneeName
    ? task.assigneeName
        .split(/\s+/)
        .map((s) => s[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Tarefa: ${task.title}. ${isCompleted ? "Concluída" : getUnifiedStatusLabel(task.status)}. Prioridade ${task.priority === "high" ? "alta" : task.priority === "medium" ? "média" : "baixa"}. Clique para ver resumo.`}
      className={cn(
        "shadow-sm cursor-pointer hover:shadow-md transition-all border-l-4 min-w-0",
        getUnifiedPriorityBorder(task.priority),
        isCompleted && "opacity-80",
        className
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {onToggleStatus != null && (
            <Checkbox
              checked={isCompleted}
              onCheckedChange={() => onToggleStatus(task.id, listId ?? undefined)}
              className="mt-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          <div className="flex-1 min-w-0">
            {/* Linha 1: status + prioridade + tipo */}
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <Badge
                variant={isCompleted ? "secondary" : "outline"}
                className="text-[10px] font-normal"
              >
                {getUnifiedStatusLabel(task.status)}
              </Badge>
              <span
                className={cn(
                  "flex items-center gap-0.5 text-[10px] text-muted-foreground",
                  getUnifiedPriorityColor(task.priority)
                )}
              >
                <Circle className="h-2.5 w-2.5" fill="currentColor" />
                {task.priority === "high"
                  ? "Alta"
                  : task.priority === "medium"
                    ? "Média"
                    : "Baixa"}
              </span>
              {task.taskType && task.taskType !== "task" && (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {task.taskType}
                </Badge>
              )}
            </div>

            {/* Título */}
            <h4
              className={cn(
                "font-medium text-sm leading-tight mb-1",
                isCompleted && "line-through opacity-70"
              )}
            >
              {task.title}
            </h4>

            {/* Descrição (1 linha) */}
            {task.description && task.description.trim() && (
              <p
                className={cn(
                  "text-xs text-muted-foreground truncate mb-1.5",
                  isCompleted && "line-through opacity-70"
                )}
                title={task.description}
              >
                {task.description.trim()}
              </p>
            )}

            {/* Checklist */}
            {checklist.length > 0 && (
              <div className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground">
                <CheckSquare className="h-3 w-3 shrink-0" />
                <span>
                  {checklist.filter((i) => i.completed).length}/{checklist.length}
                </span>
                <div className="flex-1 h-1.5 bg-muted rounded-full min-w-[60px]">
                  <div
                    className="h-1.5 bg-primary rounded-full transition-all"
                    style={{ width: `${checklistProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Tags / Labels (com cor quando disponível em customFields.tagColors) */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {visibleTags.map((tag) => {
                  const color = tagColors[tag];
                  return (
                    <span
                      key={tag}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        !color && "bg-muted"
                      )}
                      style={
                        color
                          ? {
                              backgroundColor: `${color}20`,
                              borderColor: color,
                              color: color,
                              borderWidth: 1,
                              borderStyle: "solid",
                            }
                          : undefined
                      }
                    >
                      {tag}
                    </span>
                  );
                })}
                {remainingTags > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{remainingTags}
                  </span>
                )}
              </div>
            )}

            {/* Rodapé: datas, esforço, ícones, responsável */}
            <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                {task.dueDate && (
                  <span className="flex items-center gap-0.5">
                    <CalendarIcon className="h-3 w-3" />
                    {formatUnifiedDate(task.dueDate)}
                    {task.dueTime && ` ${formatUnifiedTime(task.dueTime)}`}
                  </span>
                )}
                {(task.startDate || task.startTime) && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {task.startDate && formatUnifiedDate(task.startDate)}
                    {task.startTime && ` ${formatUnifiedTime(task.startTime)}`}
                  </span>
                )}
                {(task.estimatedEffortHours != null || task.estimatedStoryPoints != null) && (
                  <span className="flex items-center gap-0.5">
                    <Gauge className="h-3 w-3" />
                    {task.estimatedEffortHours != null && `${task.estimatedEffortHours}h`}
                    {task.estimatedEffortHours != null && task.estimatedStoryPoints != null && " · "}
                    {task.estimatedStoryPoints != null && `${task.estimatedStoryPoints} pts`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {task.attachments.length > 0 && (
                  <span
                    className="text-muted-foreground"
                    title={`${task.attachments.length} anexo(s)`}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </span>
                )}
                {task.meetingLink && (
                  <span className="text-muted-foreground" title="Reunião">
                    <Video className="h-3.5 w-3.5" />
                  </span>
                )}
                {task.recurrenceRule != null && (
                  <span className="text-muted-foreground" title="Recorrente">
                    <Repeat className="h-3.5 w-3.5" />
                  </span>
                )}
                {showAssignee && (
                  <Avatar className="h-6 w-6 border border-background">
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                      {task.assigneeAvatar ?? assigneeInitials}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
