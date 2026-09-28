
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarIcon, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Task, ProjectList } from "./types";
import { formatDate, getPriorityColor, getChecklistProgress } from "./utils";
import { UnifiedTaskCard, TaskSummaryPopover } from "@/components/tasks";
import { projectUITaskToUnified } from "@/lib/taskUnified";
import type { UnifiedTask } from "@/lib/taskUnified";

interface TaskListViewProps {
  lists: ProjectList[];
  onToggleTaskStatus: (listId: string, taskId: string) => void;
  onTaskClick: (task: Task, listId: string) => void;
  projectId?: string;
  areaId?: string | null;
  onOpenFull?: (task: UnifiedTask) => void;
}

export function TaskListView({
  lists,
  onToggleTaskStatus,
  onTaskClick,
  projectId,
  areaId,
  onOpenFull,
}: TaskListViewProps) {
  const allTasks = lists.flatMap((list) =>
    list.tasks.map((task) => ({
      ...task,
      listId: list.id,
      listName: list.name,
    }))
  );

  const todoTasks = allTasks.filter((task) => task.status !== "completed");
  const completedTasks = allTasks.filter((task) => task.status === "completed");

  const useUnified = onOpenFull != null;

  const renderTaskRow = (
    task: Task & { listId: string; listName: string },
    isCompleted: boolean
  ) => {
    if (useUnified) {
      const unifiedTask = projectUITaskToUnified(task, {
        listId: task.listId,
        projectId: projectId ?? undefined,
        areaId: areaId ?? undefined,
      });
      return (
        <TaskSummaryPopover
          key={task.id}
          task={unifiedTask}
          onOpenFull={() => onOpenFull(unifiedTask)}
        >
          <div className={cn(isCompleted && "opacity-70")}>
            <UnifiedTaskCard
              task={unifiedTask}
              listId={task.listId}
              onToggleStatus={(taskId, listIdParam) =>
                onToggleTaskStatus(listIdParam ?? task.listId, taskId)
              }
              onClick={() => {}}
            />
          </div>
        </TaskSummaryPopover>
      );
    }

    return (
      <Card
        key={task.id}
        className={cn(
          "cursor-pointer hover:shadow transition-shadow",
          isCompleted && "opacity-70"
        )}
        onClick={() => onTaskClick(task, task.listId)}
      >
        <CardContent className="p-3">
          <div className="flex items-start">
            <Checkbox
              checked={task.status === "completed"}
              onCheckedChange={() => onToggleTaskStatus(task.listId, task.id)}
              className="mt-1 h-4 w-4"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="ml-3 flex-1">
              <div className="flex justify-between">
                <h4
                  className={cn(
                    "font-medium",
                    isCompleted && "line-through"
                  )}
                >
                  {task.title}
                </h4>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{task.listName}</Badge>
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      getPriorityColor(task.priority)
                    )}
                  />
                </div>
              </div>
              {task.description && (
                <p
                  className={cn(
                    "text-sm text-muted-foreground mt-1",
                    isCompleted && "line-through"
                  )}
                >
                  {task.description}
                </p>
              )}
              {task.checklist && task.checklist.length > 0 && (
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>
                    {task.checklist.filter((item) => item.completed).length}/
                    {task.checklist.length}
                  </span>
                  <div className="w-24 h-1 bg-muted rounded-full ml-1">
                    <div
                      className="h-1 bg-primary rounded-full"
                      style={{ width: `${getChecklistProgress(task)}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {task.tags?.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {task.labels?.map((label) => (
                  <Badge key={label} variant="outline" className="text-xs">
                    {label}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                {task.dueDate && (
                  <div className="flex items-center">
                    <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                    <span>{formatDate(task.dueDate)}</span>
                  </div>
                )}
                {task.assignee && (
                  <div className="flex items-center">
                    <Avatar className="h-5 w-5 mr-1">
                      <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                        {task.assignee.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <span>{task.assignee.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium mb-2">
          Tarefas Pendentes ({todoTasks.length})
        </h3>
        {todoTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Não há tarefas pendentes
          </p>
        ) : (
          <div className="space-y-2">
            {todoTasks.map((task) => renderTaskRow(task, false))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-medium mb-2">
          Tarefas Concluídas ({completedTasks.length})
        </h3>
        {completedTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Não há tarefas concluídas
          </p>
        ) : (
          <div className="space-y-2">
            {completedTasks.map((task) => renderTaskRow(task, true))}
          </div>
        )}
      </div>
    </div>
  );
}
