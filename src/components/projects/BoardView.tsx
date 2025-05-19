
import React from "react";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit, Trash2, Plus } from "lucide-react";
import { ProjectList, Task } from "./types";
import { TaskCard } from "./TaskCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  return (
    <div className="flex-1 h-full">
      <div className="flex gap-4 h-full overflow-x-auto pb-6">
        {lists.sort((a, b) => a.order - b.order).map(list => (
          <div key={list.id} className="flex-shrink-0 w-80 bg-muted/30 rounded-md overflow-hidden">
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
                <TaskCard
                  key={task.id}
                  task={task}
                  listId={list.id}
                  onToggleStatus={onToggleTaskStatus}
                  onClick={onTaskClick}
                />
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
          <Button variant="outline" className="w-full" onClick={onAddList}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Etapa
          </Button>
        </div>
      </div>
    </div>
  );
}
