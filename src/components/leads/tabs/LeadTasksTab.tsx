
import React from "react";
import { TabsContent } from "@/components/ui/tabs";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Trash2 } from "lucide-react";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";

const taskFormSchema = z.object({
  title: z.string().min(3, { message: "Título é obrigatório" }),
  description: z.string().optional(),
  due_date: z.date().optional().nullable(),
  status: z.string(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

interface LeadTasksTabProps {
  tasks: any[];
  onAddTask: (values: TaskFormValues) => void | Promise<void>;
  onUpdateTaskStatus: (taskId: string, status: string) => void;
  onDeleteTask?: (taskId: string) => void;
  canCreateTask?: boolean;
  canEditTask?: boolean;
}

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  todo: "Pendente",
  "Pendente": "Pendente",
  in_progress: "Em andamento",
  "Em andamento": "Em andamento",
  completed: "Concluído",
  done: "Concluído",
  "Concluído": "Concluído",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  "Cancelado": "Cancelado",
};

function taskStatusLabel(status: string | null | undefined): string {
  if (!status) return "Pendente";
  return TASK_STATUS_LABELS[status] ?? status;
}

const LeadTasksTab: React.FC<LeadTasksTabProps> = ({
  tasks,
  onAddTask,
  onUpdateTaskStatus,
  onDeleteTask,
  canCreateTask = true,
  canEditTask = true,
}) => {
  const taskForm = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      due_date: null,
      status: "pending",
    },
  });

  const getTaskStatusVariant = (status: string) => {
    switch (taskStatusLabel(status)) {
      case "Pendente": return "outline";
      case "Em andamento": return "secondary";
      case "Concluído": return "default";
      case "Cancelado": return "destructive";
      default: return "outline";
    }
  };

  return (
    <TabsContent value="tasks">
      <div className="space-y-3 max-md:space-y-3 md:space-y-4">
        {canCreateTask ? (
        <Form {...taskForm}>
          <form
            onSubmit={taskForm.handleSubmit(onAddTask)}
            className="space-y-3 rounded-xl border border-border/60 bg-muted/15 p-3 shadow-sm max-md:space-y-3 md:space-y-4 md:rounded-lg md:border-border/70 md:bg-muted/20"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input 
                  id="title"
                  placeholder="Título da tarefa" 
                  {...taskForm.register("title")}
                />
                {taskForm.formState.errors.title && (
                  <p className="text-sm text-red-500">{taskForm.formState.errors.title.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"
                  {...taskForm.register("status")}
                >
                  <option value="pending">Pendente</option>
                  <option value="in_progress">Em andamento</option>
                  <option value="completed">Concluído</option>
                  <option value="cancelled">Cancelado</option>
                </select>
                {taskForm.formState.errors.status && (
                  <p className="text-sm text-red-500">{taskForm.formState.errors.status.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descreva a tarefa" 
                {...taskForm.register("description")}
              />
              {taskForm.formState.errors.description && (
                <p className="text-sm text-red-500">{taskForm.formState.errors.description.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">Data de vencimento</Label>
              <Input
                id="due_date"
                type="date"
                {...taskForm.register("due_date", {
                  setValueAs: (value) => (value ? new Date(value) : null),
                })}
              />
              {taskForm.formState.errors.due_date && (
                <p className="text-sm text-red-500">{taskForm.formState.errors.due_date.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Tarefa
            </Button>
          </form>
        </Form>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            Sem permissão para criar tarefas neste lead.
          </div>
        )}

        <div className="mt-4 space-y-2 md:mt-6">
          <h3 className="text-base font-semibold tracking-tight md:text-lg md:font-medium">Tarefas existentes</h3>
          {tasks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 bg-muted/10 py-8 text-center text-sm text-muted-foreground">
              Nenhuma tarefa encontrada para este lead.
            </p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <Card key={task.id} className="border-border/60 shadow-sm">
                  <CardContent className="p-3 md:p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{task.title}</h4>
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                        {task.due_date && (
                          <p className="text-xs mt-1">
                            Vencimento:{" "}
                            {typeof task.due_date === "string"
                              ? formatDateOnlyPtBr(task.due_date)
                              : new Date(task.due_date as string | number | Date).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={getTaskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={!canEditTask && !onDeleteTask}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={!canEditTask} onClick={() => onUpdateTaskStatus(task.id, "pending")}>
                              Marcar como Pendente
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!canEditTask} onClick={() => onUpdateTaskStatus(task.id, "in_progress")}>
                              Marcar como Em andamento
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!canEditTask} onClick={() => onUpdateTaskStatus(task.id, "completed")}>
                              Marcar como Concluído
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!canEditTask} onClick={() => onUpdateTaskStatus(task.id, "cancelled")}>
                              Marcar como Cancelado
                            </DropdownMenuItem>
                            {onDeleteTask ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => onDeleteTask(task.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Excluir tarefa
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </TabsContent>
  );
};

export default LeadTasksTab;
