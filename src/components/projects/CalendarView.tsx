
import React, { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Project, Task } from "./types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, CheckSquare } from "lucide-react";

interface CalendarViewProps {
  project: Project;
  onTaskClick: (task: Task, listId: string) => void;
}

export function CalendarView({ project, onTaskClick }: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  
  // Get all tasks across all lists
  const allTasks = project.lists.flatMap(list => 
    list.tasks.map(task => ({ ...task, listId: list.id }))
  );
  
  // Get tasks for a specific date
  const getTasksForDate = (date: Date) => {
    return allTasks.filter(task => {
      if (!task.dueDate) return false;
      const taskDate = new Date(task.dueDate);
      return (
        taskDate.getDate() === date.getDate() &&
        taskDate.getMonth() === date.getMonth() &&
        taskDate.getFullYear() === date.getFullYear()
      );
    });
  };
  
  // Get all dates that have tasks
  const getDatesWithTasks = () => {
    return allTasks
      .filter(task => task.dueDate)
      .map(task => new Date(task.dueDate!));
  };

  // Get tasks for the selected date
  const tasksForSelectedDate = selectedDate ? getTasksForDate(selectedDate) : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="col-span-1">
        <CardContent className="p-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className="pointer-events-auto"
            modifiers={{
              hasTasks: getDatesWithTasks(),
            }}
            modifiersStyles={{
              hasTasks: { 
                fontWeight: 'bold',
                textDecoration: 'underline',
                color: 'var(--primary)'
              }
            }}
          />
        </CardContent>
      </Card>
      
      <Card className="col-span-1 md:col-span-2">
        <CardContent className="p-4">
          <div className="flex items-center mb-4">
            <CalendarIcon className="mr-2 h-5 w-5" />
            <h3 className="text-lg font-medium">
              {selectedDate ? format(selectedDate, "dd 'de' MMMM, yyyy") : "Selecione uma data"}
            </h3>
          </div>
          
          {tasksForSelectedDate.length > 0 ? (
            <div className="space-y-3">
              {tasksForSelectedDate.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start p-3 border rounded-md cursor-pointer hover:bg-muted/50"
                  onClick={() => onTaskClick(task, task.listId)}
                >
                  <div className={`p-1 rounded-md mr-3 ${task.status === "completed" ? "bg-green-500/10" : "bg-primary/10"}`}>
                    <CheckSquare className={`h-5 w-5 ${task.status === "completed" ? "text-green-500" : "text-primary"}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{task.title}</h4>
                      <Badge variant={task.status === "completed" ? "outline" : "default"} className="text-xs">
                        {task.status === "completed" ? "Concluída" : "Pendente"}
                      </Badge>
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {task.description.length > 100 
                          ? `${task.description.substring(0, 100)}...` 
                          : task.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              {selectedDate 
                ? "Nenhuma tarefa para esta data"
                : "Selecione uma data para ver as tarefas"
              }
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
