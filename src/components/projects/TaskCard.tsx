
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarIcon, Circle, CheckSquare } from "lucide-react";
import { Task } from "./types";
import { formatDate, getPriorityColor, getChecklistProgress } from "./utils";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  task: Task;
  listId: string;
  onToggleStatus: (listId: string, taskId: string) => void;
  onClick: (task: Task, listId: string) => void;
}

export function TaskCard({ task, listId, onToggleStatus, onClick }: TaskCardProps) {
  return (
    <Card 
      className={cn(
        "shadow-sm cursor-pointer hover:shadow transition-shadow",
        {"opacity-80": task.status === "completed"}
      )}
      onClick={() => onClick(task, listId)}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={task.status === "completed"}
            onCheckedChange={() => onToggleStatus(listId, task.id)}
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
                <Circle className={cn("h-3 w-3", getPriorityColor(task.priority))} fill="currentColor" />
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
                {task.description}
              </p>
            )}
            
            {task.checklist && task.checklist.length > 0 && (
              <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground">
                <CheckSquare className="h-3 w-3" />
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
                <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
              {task.labels && task.labels.map(label => (
                <span key={label} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                  {label}
                </span>
              ))}
            </div>
            
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              {task.dueDate && (
                <div className="flex items-center">
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  <span>{formatDate(task.dueDate)}</span>
                </div>
              )}
            </div>
          </div>
          
          {task.assignee && (
            <div className="flex flex-col items-end">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {task.assignee.avatar}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
