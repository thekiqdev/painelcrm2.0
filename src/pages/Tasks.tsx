
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarIcon, Clock, Plus, CheckCircle, User, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Task = {
  id: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  status: "pending" | "completed";
  priority: "low" | "medium" | "high";
  client?: string;
  deal?: string;
  assignee?: string;
  assigneeAvatar?: string;
};

// Exemplo de tarefas
const initialTasks: Task[] = [
  {
    id: "T001",
    title: "Reunião com cliente ABC Tech",
    description: "Apresentação da proposta comercial e discussão de requisitos",
    date: "2025-05-21",
    time: "14:30",
    status: "pending",
    priority: "high",
    client: "ABC Tech",
    deal: "Implementação de Sistema ERP",
    assignee: "Carlos Silva",
    assigneeAvatar: "CS",
  },
  {
    id: "T002",
    title: "Follow-up cliente XYZ",
    description: "Verificar se o cliente recebeu a proposta",
    date: "2025-05-20",
    time: "10:00",
    status: "completed",
    priority: "medium",
    client: "XYZ Corp",
    assignee: "Ana Oliveira",
    assigneeAvatar: "AO",
  },
  {
    id: "T003",
    title: "Preparar proposta comercial",
    description: "Proposta para implementação de servidor dedicado",
    date: "2025-05-22",
    status: "pending",
    priority: "medium",
    client: "Tech Solutions",
    deal: "Expansão de Servidor",
    assignee: "Carlos Silva",
    assigneeAvatar: "CS",
  },
  {
    id: "T004",
    title: "Ligação para novo lead",
    description: "Lead captado no site, interessado em consultoria financeira",
    date: "2025-05-19",
    time: "16:00",
    status: "pending",
    priority: "low",
    assignee: "Ana Oliveira",
    assigneeAvatar: "AO",
  },
  {
    id: "T005",
    title: "Enviar contrato para assinatura",
    description: "Contrato de prestação de serviços de marketing digital",
    date: "2025-05-20",
    status: "pending",
    priority: "high",
    client: "Consultoria Global",
    deal: "Projeto de Marketing Digital",
    assignee: "Marcos Santos",
    assigneeAvatar: "MS",
  },
];

const Tasks = () => {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [date, setDate] = useState<Date>();

  const handleToggleTaskStatus = (taskId: string) => {
    setTasks(prev =>
      prev.map(task => {
        if (task.id === taskId) {
          const newStatus = task.status === "pending" ? "completed" : "pending";
          if (newStatus === "completed") {
            toast.success("Tarefa concluída!");
          }
          return { ...task, status: newStatus };
        }
        return task;
      })
    );
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Tarefa adicionada com sucesso!");
    setIsAddTaskDialogOpen(false);
  };

  const getTodayTasks = () => tasks.filter(task => task.date === "2025-05-19" && task.status === "pending");
  const getUpcomingTasks = () => tasks.filter(task => task.date > "2025-05-19" && task.status === "pending");
  const getCompletedTasks = () => tasks.filter(task => task.status === "completed");

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case "high": return "text-red-500";
      case "medium": return "text-amber-500";
      case "low": return "text-blue-500";
      default: return "text-gray-500";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Tarefas</h1>

        <div className="flex gap-2">
          <Dialog open={isAddTaskDialogOpen} onOpenChange={setIsAddTaskDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Tarefa
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>Adicionar Nova Tarefa</DialogTitle>
                <DialogDescription>
                  Preencha os detalhes da sua nova tarefa ou atividade
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddTask}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Título</Label>
                      <Input id="title" placeholder="Ex: Reunião com cliente" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="description">Descrição</Label>
                      <Textarea id="description" placeholder="Detalhes da tarefa..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, "dd/MM/yyyy") : <span>Selecione uma data</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="time">Horário</Label>
                      <Input id="time" type="time" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="priority">Prioridade</Label>
                      <Select>
                        <SelectTrigger id="priority">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="low">Baixa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="assignee">Responsável</Label>
                      <Select>
                        <SelectTrigger id="assignee">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user1">Carlos Silva</SelectItem>
                          <SelectItem value="user2">Ana Oliveira</SelectItem>
                          <SelectItem value="user3">Marcos Santos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="client">Cliente (Opcional)</Label>
                      <Select>
                        <SelectTrigger id="client">
                          <SelectValue placeholder="Selecione um cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="client1">ABC Tecnologia</SelectItem>
                          <SelectItem value="client2">Construtora XYZ</SelectItem>
                          <SelectItem value="client3">Supermercados Sul</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deal">Negócio (Opcional)</Label>
                      <Select>
                        <SelectTrigger id="deal">
                          <SelectValue placeholder="Selecione um negócio" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="deal1">Implementação de Sistema ERP</SelectItem>
                          <SelectItem value="deal2">Projeto de Marketing Digital</SelectItem>
                          <SelectItem value="deal3">Consultoria Estratégica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddTaskDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Adicionar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="today">Hoje</TabsTrigger>
          <TabsTrigger value="upcoming">Próximas</TabsTrigger>
          <TabsTrigger value="completed">Concluídas</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <TaskList 
            tasks={tasks} 
            onToggleTaskStatus={handleToggleTaskStatus}
            getPriorityColor={getPriorityColor}
          />
        </TabsContent>

        <TabsContent value="today">
          <TaskList 
            tasks={getTodayTasks()} 
            onToggleTaskStatus={handleToggleTaskStatus}
            getPriorityColor={getPriorityColor}
          />
        </TabsContent>

        <TabsContent value="upcoming">
          <TaskList 
            tasks={getUpcomingTasks()} 
            onToggleTaskStatus={handleToggleTaskStatus}
            getPriorityColor={getPriorityColor}
          />
        </TabsContent>

        <TabsContent value="completed">
          <TaskList 
            tasks={getCompletedTasks()} 
            onToggleTaskStatus={handleToggleTaskStatus}
            getPriorityColor={getPriorityColor}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

type TaskListProps = {
  tasks: Task[];
  onToggleTaskStatus: (taskId: string) => void;
  getPriorityColor: (priority: string) => string;
};

const TaskList = ({ tasks, onToggleTaskStatus, getPriorityColor }: TaskListProps) => {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, "dd/MM/yyyy");
  };

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-10">
          <div className="text-center">
            <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma tarefa encontrada</h3>
            <p className="text-muted-foreground">
              Não existem tarefas para exibir nesta categoria.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map(task => (
        <Card key={task.id} className={cn("transition-all", {"opacity-80": task.status === "completed" })}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <Checkbox 
                checked={task.status === "completed"} 
                onCheckedChange={() => onToggleTaskStatus(task.id)}
                className="mt-1"
              />
              
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className={cn("font-medium", {"line-through opacity-70": task.status === "completed"})}>
                    {task.title}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Circle className={cn("h-3 w-3", getPriorityColor(task.priority))} fill="currentColor" />
                    <span className="text-xs text-muted-foreground">
                      {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Média" : "Baixa"}
                    </span>
                  </div>
                </div>
                
                {task.description && (
                  <p className={cn("text-sm text-muted-foreground mb-3", {"line-through opacity-70": task.status === "completed"})}>
                    {task.description}
                  </p>
                )}
                
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center">
                    <CalendarIcon className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                    <span>{formatDate(task.date)}</span>
                    {task.time && (
                      <>
                        <Clock className="h-3.5 w-3.5 ml-2 mr-1 text-muted-foreground" />
                        <span>{task.time}</span>
                      </>
                    )}
                  </div>
                  
                  {task.client && (
                    <div className="flex items-center">
                      <Badge variant="outline" className="text-xs">
                        Cliente: {task.client}
                      </Badge>
                    </div>
                  )}

                  {task.deal && (
                    <div className="flex items-center">
                      <Badge variant="outline" className="text-xs">
                        Negócio: {task.deal}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
              
              {task.assignee && (
                <div className="flex items-center ml-2">
                  <div className="flex items-center gap-1">
                    <Avatar className="h-6 w-6">
                      <div className="bg-primary h-full w-full flex items-center justify-center text-xs font-medium text-primary-foreground">
                        {task.assigneeAvatar}
                      </div>
                    </Avatar>
                    <span className="text-xs text-muted-foreground hidden sm:inline">{task.assignee}</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default Tasks;
