
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Clock, Plus, CheckCircle, User, Circle, CheckSquare, MoreHorizontal, X, Edit, FileText, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { tasksService, Task, ChecklistItem } from "@/services/tasks";
import { clientsService, Client } from "@/services/clients";
import { UnifiedTaskCard, TaskSummaryPopover, TaskFullView } from "@/components/tasks";
import { globalTaskToUnified, type UnifiedTask } from "@/lib/taskUnified";
import { SystemRichEditor, SystemRichEditorReadOnly } from "@/components/editor";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";

const TASKS_QUERY_KEY = ["tasks", "list"] as const;

const Tasks = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [date, setDate] = useState<Date>();
  const [clients, setClients] = useState<Client[]>([]);

  const { data: tasksData, isPending: loading } = useQuery({
    queryKey: ["tasks", "list"],
    queryFn: async () => {
      const [tasksRes, clientsRes] = await Promise.all([
        tasksService.getTasks(),
        clientsService.getClients(),
      ]);
      const formatted = (tasksRes || []).map((t: Task) => ({ ...t, date: t.date || "" }));
      return { tasks: formatted, clients: clientsRes || [] };
    },
  });
  useEffect(() => {
    if (tasksData) {
      setTasks(tasksData.tasks);
      setClients(tasksData.clients);
    }
  }, [tasksData]);

  const clearTaskQuery = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("task");
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setIsAddTaskDialogOpen(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("new");
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const tid = searchParams.get("task");
    if (!tid || loading) return;
    const t = tasks.find((x) => x.id === tid);
    if (t) {
      setFullViewTask(globalTaskToUnified(t));
    } else if (tasks.length > 0) {
      clearTaskQuery();
    }
  }, [searchParams, tasks, loading, clearTaskQuery]);

  
  // Estados para o modal de detalhes e gerenciamento de checklist
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editTaskFields, setEditTaskFields] = useState({
    title: "",
    description: "",
    dueDate: undefined as Date | undefined,
    time: "",
    priority: "medium" as "low" | "medium" | "high",
    status: "pending" as "pending" | "completed",
    assignee: "",
    deal: "",
  });

  // Estados do formulário
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formPriority, setFormPriority] = useState<"low" | "medium" | "high">("medium");
  const [formClient, setFormClient] = useState("");
  const [formDeal, setFormDeal] = useState("");
  const [formAssignee, setFormAssignee] = useState("");
  const [formAdvancedOpen, setFormAdvancedOpen] = useState(false);
  const [fullViewTask, setFullViewTask] = useState<UnifiedTask | null>(null);


  const handleToggleTaskStatus = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

          const newStatus = task.status === "pending" ? "completed" : "pending";
      const updatedTask = await tasksService.updateTask(taskId, { status: newStatus });
      
      setTasks(prev => prev.map(t => t.id === taskId ? { ...updatedTask, date: updatedTask.date || "" } : t));
      
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask({ ...updatedTask, date: updatedTask.date || "" });
      }

          if (newStatus === "completed") {
            toast.success("Tarefa concluída!");
          }
    } catch (error) {
      console.error("Erro ao atualizar status da tarefa:", error);
      toast.error("Erro ao atualizar tarefa");
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formTitle.trim()) {
      toast.error("Título é obrigatório");
      return;
    }

    try {
      let clientId: string | undefined;
      let clientName: string | undefined;
      if (formClient) {
        clientId = formClient;
        try {
          const c = await clientsService.getClientById(formClient);
          clientName = c?.name || c?.company || undefined;
        } catch {
          clientName = undefined;
        }
      }
      const newTask = await tasksService.createTask({
        title: formTitle,
        description: formDescription || undefined,
        date: date ? format(date, "yyyy-MM-dd") : undefined,
        time: formTime || undefined,
        status: "pending",
        priority: formPriority,
        clientId,
        client: clientName,
        deal: formDeal || undefined,
        assignee: formAssignee || undefined,
        checklist: [],
      });

      setTasks(prev => [...prev, { ...newTask, date: newTask.date || "" }]);
      queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      
      // Reset form
      setFormTitle("");
      setFormDescription("");
      setDate(undefined);
      setFormTime("");
      setFormPriority("medium");
      setFormClient("");
      setFormDeal("");
      setFormAssignee("");
      setIsAddTaskDialogOpen(false);
      
    toast.success("Tarefa adicionada com sucesso!");
    } catch (error) {
      console.error("Erro ao criar tarefa:", error);
      toast.error("Erro ao criar tarefa");
    }
  };

  // Função para abrir o modal de detalhes da tarefa
  const resetEditTaskFields = (task: Task) => {
    setEditTaskFields({
      title: task.title || "",
      description: task.description || "",
      dueDate: task.date ? new Date(task.date) : undefined,
      time: task.time || "",
      priority: task.priority || "medium",
      status: task.status,
      assignee: task.assignee || "",
      deal: task.deal || "",
    });
  };

  const openTaskDetail = (task: Task) => {
    setSelectedTask(task);
    setIsEditingTask(false);
    resetEditTaskFields(task);
    setTaskDetailOpen(true);
  };

const closeTaskDetail = () => {
    setTaskDetailOpen(false);
    setSelectedTask(null);
    setNewChecklistItem("");
    setIsEditingTask(false);
  };

  // Função para alternar status de um item no checklist
  const toggleChecklistItem = async (itemId: string) => {
    if (!selectedTask) return;
    
    const updatedChecklist = selectedTask.checklist?.map(item => 
      item.id === itemId ? { ...item, completed: !item.completed } : item
    ) || [];
    
    // Verificar se todos os itens estão completos
    const allCompleted = updatedChecklist.length > 0 && 
                         updatedChecklist.every(item => item.completed);
    
    try {
      const updatedTask = await tasksService.updateTask(selectedTask.id, {
        checklist: updatedChecklist,
      status: allCompleted ? "completed" : selectedTask.status,
      });
      
      const formattedTask = { ...updatedTask, date: updatedTask.date || "" };
      setSelectedTask(formattedTask);
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? formattedTask : t));
    
    // Notificar se todos os itens foram concluídos
    if (allCompleted && selectedTask.status !== "completed") {
      toast.success("Todos os itens concluídos! Tarefa marcada como completa.");
      }
    } catch (error) {
      console.error("Erro ao atualizar checklist:", error);
      toast.error("Erro ao atualizar checklist");
    }
  };

  // Função para adicionar novo item ao checklist
  const addChecklistItem = async () => {
    if (!selectedTask || !newChecklistItem.trim()) return;
    
    const newItem: ChecklistItem = {
      id: `cl-${Date.now()}`,
      text: newChecklistItem,
      completed: false
    };
    
    const updatedChecklist = selectedTask.checklist 
      ? [...selectedTask.checklist, newItem] 
      : [newItem];
    
    try {
      const updatedTask = await tasksService.updateTask(selectedTask.id, {
        checklist: updatedChecklist,
      });
      
      const formattedTask = { ...updatedTask, date: updatedTask.date || "" };
      setSelectedTask(formattedTask);
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? formattedTask : t));
    setNewChecklistItem("");
    toast.success("Item adicionado à lista de verificação");
    } catch (error) {
      console.error("Erro ao adicionar item ao checklist:", error);
      toast.error("Erro ao adicionar item");
    }
  };

  // Função para remover item do checklist
  const removeChecklistItem = async (itemId: string) => {
    if (!selectedTask || !selectedTask.checklist) return;
    
    const updatedChecklist = selectedTask.checklist.filter(item => item.id !== itemId);
    
    try {
      const updatedTask = await tasksService.updateTask(selectedTask.id, {
        checklist: updatedChecklist,
      });
      
      const formattedTask = { ...updatedTask, date: updatedTask.date || "" };
      setSelectedTask(formattedTask);
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? formattedTask : t));
    toast.success("Item removido da lista de verificação");
    } catch (error) {
      console.error("Erro ao remover item do checklist:", error);
      toast.error("Erro ao remover item");
    }
  };

  const saveTaskEdits = async () => {
    if (!selectedTask) return;
    try {
      const updatedTask = await tasksService.updateTask(selectedTask.id, {
        title: editTaskFields.title,
        description: editTaskFields.description || undefined,
        date: editTaskFields.dueDate ? format(editTaskFields.dueDate, "yyyy-MM-dd") : null,
        time: editTaskFields.time || null,
        priority: editTaskFields.priority,
        status: editTaskFields.status,
        assignee: editTaskFields.assignee || null,
        deal: editTaskFields.deal || null,
      });
      setTasks(prev => prev.map(task => (task.id === updatedTask.id ? updatedTask : task)));
    setSelectedTask(updatedTask);
      setIsEditingTask(false);
      toast.success("Tarefa atualizada com sucesso!");
    } catch (error) {
      console.error("Erro ao atualizar tarefa:", error);
      toast.error("Não foi possível atualizar a tarefa");
    }
  };

  const getTodayTasks = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    return tasks.filter(task => task.date === today && task.status === "pending");
  };
  
  const getUpcomingTasks = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    return tasks.filter(task => task.date && task.date > today && task.status === "pending");
  };
  
  const getCompletedTasks = () => tasks.filter(task => task.status === "completed");

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case "high": return "text-red-500";
      case "medium": return "text-amber-500";
      case "low": return "text-blue-500";
      default: return "text-gray-500";
    }
  };

  const handleFullViewUpdate = async (
    taskId: string,
    updates: Record<string, unknown>
  ) => {
    if (!fullViewTask || fullViewTask.id !== taskId) return;
    try {
      const payload: Partial<Task> = {
        title: (updates.title as string) ?? fullViewTask.title,
        description: (updates.description as string) ?? fullViewTask.description ?? undefined,
        date: (updates.due_date as string) ?? fullViewTask.dueDate ?? null,
        time: (updates.due_time as string) ?? fullViewTask.dueTime ?? null,
        status: (updates.status as "pending" | "completed") ?? (fullViewTask.status === "completed" ? "completed" : "pending"),
        priority: (updates.priority as "low" | "medium" | "high") ?? fullViewTask.priority,
        client: (updates.client_name as string) ?? fullViewTask.clientName ?? null,
        deal: (updates.deal as string) ?? fullViewTask.deal ?? null,
        assignee: (updates.assignee_name as string) ?? fullViewTask.assigneeName ?? null,
        checklist: (updates.checklist as ChecklistItem[]) ?? fullViewTask.checklist ?? [],
      };
      const updatedTask = await tasksService.updateTask(taskId, payload);
      const normalized = { ...updatedTask, date: updatedTask.date || "" };
      setTasks((prev) => prev.map((t) => (t.id === taskId ? normalized : t)));
      setFullViewTask(globalTaskToUnified(updatedTask));
      if (selectedTask?.id === taskId) setSelectedTask(normalized);
      toast.success("Tarefa atualizada");
    } catch (error) {
      console.error("Erro ao atualizar tarefa:", error);
      toast.error("Não foi possível atualizar a tarefa");
    }
  };

  const handleFullViewDelete = async (taskId: string) => {
    try {
      await tasksService.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      setFullViewTask(null);
      if (selectedTask?.id === taskId) closeTaskDetail();
      toast.success("Tarefa excluída");
    } catch (error) {
      console.error("Erro ao excluir tarefa:", error);
      toast.error("Não foi possível excluir a tarefa");
    }
  };

  // Cálculo do progresso do checklist
  const getChecklistProgress = (task: Task) => {
    if (!task.checklist || task.checklist.length === 0) return 0;
    const completedItems = task.checklist.filter(item => item.completed).length;
    return Math.round((completedItems / task.checklist.length) * 100);
  };

  if (loading && tasks.length === 0) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="text-center">
          <p className="text-muted-foreground">Carregando tarefas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Dialog open={isAddTaskDialogOpen} onOpenChange={setIsAddTaskDialogOpen}>
        <div className="md:hidden sticky top-0 z-30 -mx-0.5 border-b border-border/70 bg-background/95 px-0.5 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/90">
          <MobilePageHeader
            title="Tarefas"
            primaryAction={{
              label: "Nova tarefa",
              icon: <Plus className="h-4 w-4" aria-hidden />,
              onClick: () => setIsAddTaskDialogOpen(true),
            }}
          />
        </div>
        <div className="hidden md:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold">Tarefas</h1>
          <div className="flex gap-2">
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Tarefa
              </Button>
            </DialogTrigger>
          </div>
        </div>
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
                      <Input 
                        id="title" 
                        placeholder="Ex: Reunião com cliente" 
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        required 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="description">Descrição</Label>
                      <SystemRichEditor
                        id="description"
                        value={formDescription}
                        onChange={setFormDescription}
                        placeholder="Detalhes da tarefa..."
                        className="min-h-[120px] rounded-md border"
                      />
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
                      <Input 
                        id="time" 
                        type="time"
                        value={formTime}
                        onChange={(e) => setFormTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Prioridade</Label>
                    <Select value={formPriority} onValueChange={(value: "low" | "medium" | "high") => setFormPriority(value)}>
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
                  <Collapsible open={formAdvancedOpen} onOpenChange={setFormAdvancedOpen} className="space-y-2">
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="outline" className="w-full justify-between">
                        <span className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4" />
                          {formAdvancedOpen ? "Ocultar" : "Expandir"} configurações avançadas
                        </span>
                        {formAdvancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border rounded-md p-4 bg-muted/30 space-y-4">
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="assignee">Responsável</Label>
                          <Input
                            id="assignee"
                            placeholder="Nome do responsável"
                            value={formAssignee}
                            onChange={(e) => setFormAssignee(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <ClientSearchCombobox
                            id="task-form-client"
                            label="Cliente (opcional)"
                            placeholderTrigger="Buscar cliente..."
                            remoteSearch
                            value={formClient || null}
                            onChange={(id) => setFormClient(id ?? "")}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="deal">Negócio (Opcional)</Label>
                          <Input
                            id="deal"
                            placeholder="Nome do negócio"
                            value={formDeal}
                            onChange={(e) => setFormDeal(e.target.value)}
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
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
            onOpenFull={setFullViewTask}
          />
        </TabsContent>

        <TabsContent value="today">
          <TaskList 
            tasks={getTodayTasks()} 
            onToggleTaskStatus={handleToggleTaskStatus}
            getPriorityColor={getPriorityColor}
            onTaskClick={openTaskDetail}
            onOpenFull={setFullViewTask}
          />
        </TabsContent>

        <TabsContent value="upcoming">
          <TaskList 
            tasks={getUpcomingTasks()} 
            onToggleTaskStatus={handleToggleTaskStatus}
            getPriorityColor={getPriorityColor}
            onTaskClick={openTaskDetail}
            onOpenFull={setFullViewTask}
          />
        </TabsContent>

        <TabsContent value="completed">
          <TaskList 
            tasks={getCompletedTasks()} 
            onToggleTaskStatus={handleToggleTaskStatus}
            getPriorityColor={getPriorityColor}
            onTaskClick={openTaskDetail}
            onOpenFull={setFullViewTask}
          />
        </TabsContent>
      </Tabs>

      <TaskFullView
        task={fullViewTask}
        open={!!fullViewTask}
        onOpenChange={(open) => {
          if (!open) {
            setFullViewTask(null);
            clearTaskQuery();
          }
        }}
        fullscreenMobile
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        onUpdate={handleFullViewUpdate}
        onDelete={handleFullViewDelete}
        onToggleStatus={
          fullViewTask
            ? (taskId) => {
                handleToggleTaskStatus(taskId);
                setFullViewTask((prev) =>
                  prev && prev.id === taskId
                    ? { ...prev, status: prev.status === "completed" ? "pending" : "completed" }
                    : prev
                );
              }
            : undefined
        }
      />

      {/* Modal de Detalhes da Tarefa */}
      <Dialog open={taskDetailOpen} onOpenChange={(open) => (open ? setTaskDetailOpen(true) : closeTaskDetail())}>
        {selectedTask && (
          <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
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
              {isEditingTask ? (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    <Label>Título</Label>
                    <Input
                      value={editTaskFields.title}
                      onChange={(e) => setEditTaskFields(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-3">
                    <Label>Descrição</Label>
                    <SystemRichEditor
                      value={editTaskFields.description}
                      onChange={(v) => setEditTaskFields(prev => ({ ...prev, description: v }))}
                      placeholder="Descrição da tarefa..."
                      className="min-h-[120px] rounded-md border"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Data de vencimento</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {editTaskFields.dueDate ? format(editTaskFields.dueDate, "dd/MM/yyyy") : <span>Selecionar data</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={editTaskFields.dueDate}
                            onSelect={(date) => setEditTaskFields(prev => ({ ...prev, dueDate: date || undefined }))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>Horário</Label>
                      <Input
                        type="time"
                        value={editTaskFields.time}
                        onChange={(e) => setEditTaskFields(prev => ({ ...prev, time: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Prioridade</Label>
                      <Select
                        value={editTaskFields.priority}
                        onValueChange={(value: "low" | "medium" | "high") => setEditTaskFields(prev => ({ ...prev, priority: value }))}
                      >
                        <SelectTrigger>
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
                      <Label>Status</Label>
                      <Select
                        value={editTaskFields.status}
                        onValueChange={(value: "pending" | "completed") => setEditTaskFields(prev => ({ ...prev, status: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="completed">Concluída</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Responsável</Label>
                    <Input
                      value={editTaskFields.assignee}
                      onChange={(e) => setEditTaskFields(prev => ({ ...prev, assignee: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Negócio</Label>
                    <Input
                      value={editTaskFields.deal}
                      onChange={(e) => setEditTaskFields(prev => ({ ...prev, deal: e.target.value }))}
                    />
                  </div>
                </div>
              ) : (
                <>
              {selectedTask.description && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">Descrição</h4>
                  <SystemRichEditorReadOnly html={selectedTask.description} className="text-sm" />
                </div>
              )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {selectedTask.date && (
                      <div className="flex gap-2">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span>Data: {format(new Date(selectedTask.date), "dd/MM/yyyy")}</span>
                      </div>
                    )}
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
                    {selectedTask.deal && (
                      <div className="flex gap-2 items-center">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>Negócio: {selectedTask.deal}</span>
                      </div>
                    )}
                  </div>
                </>
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

              <div className="flex flex-col sm:flex-row gap-2">
                {isEditingTask ? (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        if (selectedTask) {
                          resetEditTaskFields(selectedTask);
                        }
                        setIsEditingTask(false);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button className="flex-1" onClick={saveTaskEdits}>
                      Salvar alterações
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIsEditingTask(true)}
                    >
                      Editar tarefa
                    </Button>
                    <Button 
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleToggleTaskStatus(selectedTask.id)}
                    >
                      {selectedTask.status === "completed" ? "Marcar como pendente" : "Marcar como concluída"}
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => handleDeleteTask(selectedTask.id)}
                    >
                      Excluir tarefa
                    </Button>
                  </>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={closeTaskDetail}>Fechar</Button>
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
  onOpenFull?: (task: UnifiedTask) => void;
};

const TaskList = ({ tasks, onToggleTaskStatus, getPriorityColor, onTaskClick, onOpenFull }: TaskListProps) => {
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

  if (onOpenFull) {
    return (
      <div className="space-y-4">
        {tasks.map((task) => {
          const unified = globalTaskToUnified(task);
          return (
            <TaskSummaryPopover
              key={task.id}
              task={unified}
              onOpenFull={() => onOpenFull(unified)}
            >
              <div>
                <UnifiedTaskCard
                  task={unified}
                  onToggleStatus={() => onToggleTaskStatus(task.id)}
                  onClick={() => {}}
                />
              </div>
            </TaskSummaryPopover>
          );
        })}
      </div>
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
                  {task.date && (
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
                  )}
                  
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
