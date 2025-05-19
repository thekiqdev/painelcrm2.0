
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarIcon, Clock, Plus, CheckCircle, User, Circle, CheckSquare, MoreHorizontal, X, Edit } from "lucide-react";
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
  checklist?: ChecklistItem[];
};

type ChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
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
    checklist: [
      { id: "cl1", text: "Preparar slides de apresentação", completed: false },
      { id: "cl2", text: "Revisar orçamento", completed: true },
      { id: "cl3", text: "Agendar sala de reuniões", completed: false }
    ]
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
    checklist: [
      { id: "cl4", text: "Enviar email de acompanhamento", completed: true },
      { id: "cl5", text: "Registrar feedback no CRM", completed: true }
    ]
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
    checklist: [
      { id: "cl6", text: "Levantar requisitos técnicos", completed: true },
      { id: "cl7", text: "Calcular custos", completed: false },
      { id: "cl8", text: "Elaborar cronograma", completed: false }
    ]
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
    assigneeAvatar: "AO"
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
    checklist: [
      { id: "cl9", text: "Revisar cláusulas", completed: true },
      { id: "cl10", text: "Verificar valores", completed: true },
      { id: "cl11", text: "Enviar por email", completed: false }
    ]
  },
];

const Tasks = () => {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [date, setDate] = useState<Date>();
  
  // Estados para o modal de detalhes e gerenciamento de checklist
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newChecklistItem, setNewChecklistItem] = useState("");

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
    
    // Atualizar o selectedTask se estiver visualizando os detalhes
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask({
        ...selectedTask,
        status: selectedTask.status === "pending" ? "completed" : "pending"
      });
    }
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Tarefa adicionada com sucesso!");
    setIsAddTaskDialogOpen(false);
  };

  // Função para abrir o modal de detalhes da tarefa
  const openTaskDetail = (task: Task) => {
    setSelectedTask(task);
    setTaskDetailOpen(true);
  };

  // Função para alternar status de um item no checklist
  const toggleChecklistItem = (itemId: string) => {
    if (!selectedTask) return;
    
    const updatedChecklist = selectedTask.checklist?.map(item => 
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    
    // Verificar se todos os itens estão completos
    const allCompleted = updatedChecklist && 
                         updatedChecklist.length > 0 && 
                         updatedChecklist.every(item => item.completed);
    
    // Atualizar a tarefa selecionada
    const updatedTask = {
      ...selectedTask,
      status: allCompleted ? "completed" : selectedTask.status,
      checklist: updatedChecklist
    };
    
    setSelectedTask(updatedTask);
    
    // Atualizar a lista principal de tarefas
    setTasks(tasks.map(task => 
      task.id === selectedTask.id ? updatedTask : task
    ));
    
    // Notificar se todos os itens foram concluídos
    if (allCompleted && selectedTask.status !== "completed") {
      toast.success("Todos os itens concluídos! Tarefa marcada como completa.");
    }
  };

  // Função para adicionar novo item ao checklist
  const addChecklistItem = () => {
    if (!selectedTask || !newChecklistItem.trim()) return;
    
    const newItem: ChecklistItem = {
      id: `cl-${Date.now()}`,
      text: newChecklistItem,
      completed: false
    };
    
    const updatedChecklist = selectedTask.checklist 
      ? [...selectedTask.checklist, newItem] 
      : [newItem];
    
    const updatedTask = {
      ...selectedTask,
      checklist: updatedChecklist
    };
    
    setSelectedTask(updatedTask);
    
    // Atualizar a lista principal de tarefas
    setTasks(tasks.map(task => 
      task.id === selectedTask.id ? updatedTask : task
    ));
    
    setNewChecklistItem("");
    toast.success("Item adicionado à lista de verificação");
  };

  // Função para remover item do checklist
  const removeChecklistItem = (itemId: string) => {
    if (!selectedTask || !selectedTask.checklist) return;
    
    const updatedChecklist = selectedTask.checklist.filter(item => item.id !== itemId);
    
    const updatedTask = {
      ...selectedTask,
      checklist: updatedChecklist
    };
    
    setSelectedTask(updatedTask);
    
    // Atualizar a lista principal de tarefas
    setTasks(tasks.map(task => 
      task.id === selectedTask.id ? updatedTask : task
    ));
    
    toast.success("Item removido da lista de verificação");
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

  // Cálculo do progresso do checklist
  const getChecklistProgress = (task: Task) => {
    if (!task.checklist || task.checklist.length === 0) return 0;
    const completedItems = task.checklist.filter(item => item.completed).length;
    return Math.round((completedItems / task.checklist.length) * 100);
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
            onTaskClick={openTaskDetail}
          />
        </TabsContent>

        <TabsContent value="today">
          <TaskList 
            tasks={getTodayTasks()} 
            onToggleTaskStatus={handleToggleTaskStatus}
            getPriorityColor={getPriorityColor}
            onTaskClick={openTaskDetail}
          />
        </TabsContent>

        <TabsContent value="upcoming">
          <TaskList 
            tasks={getUpcomingTasks()} 
            onToggleTaskStatus={handleToggleTaskStatus}
            getPriorityColor={getPriorityColor}
            onTaskClick={openTaskDetail}
          />
        </TabsContent>

        <TabsContent value="completed">
          <TaskList 
            tasks={getCompletedTasks()} 
            onToggleTaskStatus={handleToggleTaskStatus}
            getPriorityColor={getPriorityColor}
            onTaskClick={openTaskDetail}
          />
        </TabsContent>
      </Tabs>

      {/* Modal de Detalhes da Tarefa */}
      <Dialog open={taskDetailOpen} onOpenChange={setTaskDetailOpen}>
        {selectedTask && (
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Checkbox 
                  checked={selectedTask.status === "completed"} 
                  onCheckedChange={() => handleToggleTaskStatus(selectedTask.id)}
                  className="mr-1"
                />
                <DialogTitle className={cn({"line-through opacity-70": selectedTask.status === "completed"})}>
                  {selectedTask.title}
                </DialogTitle>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedTask.client && (
                  <Badge variant="outline">Cliente: {selectedTask.client}</Badge>
                )}
                {selectedTask.deal && (
                  <Badge variant="outline">Negócio: {selectedTask.deal}</Badge>
                )}
                <Badge variant={selectedTask.priority === "high" ? "destructive" : 
                                selectedTask.priority === "medium" ? "default" : "secondary"}>
                  {selectedTask.priority === "high" ? "Alta Prioridade" : 
                   selectedTask.priority === "medium" ? "Média Prioridade" : "Baixa Prioridade"}
                </Badge>
              </div>
            </DialogHeader>
            <div className="grid gap-6">
              {selectedTask.description && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">Descrição</h4>
                  <p className="text-sm text-muted-foreground">{selectedTask.description}</p>
                </div>
              )}
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-semibold">Lista de Verificação</h4>
                  {selectedTask.checklist && selectedTask.checklist.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {selectedTask.checklist.filter(item => item.completed).length}/{selectedTask.checklist.length} concluídos 
                      ({getChecklistProgress(selectedTask)}%)
                    </span>
                  )}
                </div>

                {/* Barra de progresso */}
                {selectedTask.checklist && selectedTask.checklist.length > 0 && (
                  <div className="w-full bg-muted h-2 rounded-full mb-3">
                    <div 
                      className="bg-primary h-2 rounded-full" 
                      style={{ width: `${getChecklistProgress(selectedTask)}%` }} 
                    />
                  </div>
                )}

                {/* Itens do checklist */}
                <div className="space-y-2 mb-3">
                  {selectedTask.checklist?.map(item => (
                    <div key={item.id} className="flex items-center group">
                      <Checkbox 
                        checked={item.completed} 
                        onCheckedChange={() => toggleChecklistItem(item.id)}
                        className="mr-2"
                      />
                      <span className={cn("flex-1 text-sm", {"line-through text-muted-foreground": item.completed})}>
                        {item.text}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0" 
                        onClick={() => removeChecklistItem(item.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Adicionar novo item ao checklist */}
                <div className="flex gap-2">
                  <Input 
                    placeholder="Adicionar item à lista" 
                    value={newChecklistItem} 
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    className="text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newChecklistItem.trim()) {
                        addChecklistItem();
                      }
                    }}
                  />
                  <Button onClick={addChecklistItem} disabled={!newChecklistItem.trim()}>
                    Adicionar
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold mb-2">Detalhes</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      <span>Data: {format(new Date(selectedTask.date), "dd/MM/yyyy")}</span>
                    </div>
                    {selectedTask.time && (
                      <div className="flex gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Horário: {selectedTask.time}</span>
                      </div>
                    )}
                    {selectedTask.assignee && (
                      <div className="flex gap-2 items-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>Responsável: {selectedTask.assignee}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-semibold mb-2">Ações</h4>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <Edit className="mr-2 h-4 w-4" />
                      Editar tarefa
                    </Button>
                    <Button 
                      variant={selectedTask.status === "completed" ? "default" : "secondary"} 
                      size="sm" 
                      className="w-full justify-start"
                      onClick={() => handleToggleTaskStatus(selectedTask.id)}
                    >
                      <CheckSquare className="mr-2 h-4 w-4" />
                      {selectedTask.status === "completed" ? "Marcar como pendente" : "Marcar como concluída"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setTaskDetailOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
};

type TaskListProps = {
  tasks: Task[];
  onToggleTaskStatus: (taskId: string) => void;
  getPriorityColor: (priority: string) => string;
  onTaskClick: (task: Task) => void;
};

const TaskList = ({ tasks, onToggleTaskStatus, getPriorityColor, onTaskClick }: TaskListProps) => {
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
        <Card 
          key={task.id} 
          className={cn(
            "transition-all cursor-pointer hover:shadow-md", 
            {"opacity-80": task.status === "completed" }
          )}
          onClick={() => onTaskClick(task)}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <Checkbox 
                checked={task.status === "completed"} 
                onCheckedChange={() => onToggleTaskStatus(task.id)}
                className="mt-1"
                onClick={(e) => {
                  // Evita que o clique do checkbox propague e abra o modal de detalhes
                  e.stopPropagation();
                }}
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
                
                {task.checklist && task.checklist.length > 0 && (
                  <div className="flex items-center gap-1 mb-3">
                    <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="text-xs text-muted-foreground">
                      {task.checklist.filter(item => item.completed).length}/{task.checklist.length} itens concluídos
                    </div>
                    <div className="flex-1 h-1 bg-muted rounded-full ml-1">
                      <div 
                        className="h-1 bg-primary rounded-full" 
                        style={{ 
                          width: `${(task.checklist.filter(item => item.completed).length / task.checklist.length) * 100}%` 
                        }} 
                      />
                    </div>
                  </div>
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
