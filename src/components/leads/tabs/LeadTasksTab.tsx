
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
import { Plus, MoreVertical } from "lucide-react";
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
  onAddTask: (values: TaskFormValues) => void;
  onUpdateTaskStatus: (taskId: string, status: string) => void;
}

const LeadTasksTab: React.FC<LeadTasksTabProps> = ({
  tasks,
  onAddTask,
  onUpdateTaskStatus,
}) => {
  const taskForm = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      due_date: null,
      status: "Pendente",
    },
  });

  const getTaskStatusVariant = (status: string) => {
    switch (status) {
      case "Pendente": return "outline";
      case "Em andamento": return "secondary";
      case "Concluído": return "default";
      case "Cancelado": return "destructive";
      default: return "outline";
    }
  };

  return (
    <TabsContent value="tasks">
      <div className="space-y-4">
        <Form {...taskForm}>
          <form onSubmit={taskForm.handleSubmit(onAddTask)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
                  className="w-full p-2 border rounded"
                  {...taskForm.register("status")}
                >
                  <option value="Pendente">Pendente</option>
                  <option value="Em andamento">Em andamento</option>
                  <option value="Concluído">Concluído</option>
                  <option value="Cancelado">Cancelado</option>
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

        <div className="space-y-2 mt-6">
          <h3 className="text-lg font-medium">Tarefas existentes</h3>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma tarefa encontrada para este lead.
            </p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <Card key={task.id}>
                  <CardContent className="p-4">
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
                        <Badge variant={getTaskStatusVariant(task.status)}>{task.status}</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onUpdateTaskStatus(task.id, "Pendente")}>
                              Marcar como Pendente
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onUpdateTaskStatus(task.id, "Em andamento")}>
                              Marcar como Em andamento
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onUpdateTaskStatus(task.id, "Concluído")}>
                              Marcar como Concluído
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onUpdateTaskStatus(task.id, "Cancelado")}>
                              Marcar como Cancelado
                            </DropdownMenuItem>
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
