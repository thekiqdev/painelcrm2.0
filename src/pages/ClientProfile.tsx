import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ClientSidebar } from "@/components/clients/ClientSidebar";
import { clientsService } from "@/services/clients";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, ArrowLeft, Mail, Phone, Building, Calendar, User } from "lucide-react";
import { format } from "date-fns";
import { StickyNote, StickyNoteData } from "@/components/clients/StickyNote";
import { addClientTask } from "@/utils/clients-helpers";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const taskSchema = z.object({
  title: z.string().min(3, "Título deve ter pelo menos 3 caracteres"),
  description: z.string().optional(),
  due_date: z.date().optional(),
  status: z.string().default("Pendente"),
});

const ClientProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [client, setClient] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState<StickyNoteData[]>([]);
  const [clientTasks, setClientTasks] = useState<any[]>([]);
  const [clientGroups, setClientGroups] = useState<any[]>([]);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [newClientGroup, setNewClientGroup] = useState("");

  const taskForm = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "Pendente",
    },
  });

  // Determinar qual aba mostrar baseado na rota
  const getActiveTab = () => {
    if (location.pathname.includes("/details")) return "details";
    if (location.pathname.includes("/tasks")) return "tasks";
    if (location.pathname.includes("/notes")) return "notes";
    if (location.pathname.includes("/opportunities")) return "opportunities";
    if (location.pathname.includes("/messages")) return "messages";
    if (location.pathname.includes("/calendar")) return "calendar";
    if (location.pathname.includes("/finance")) return "finance";
    if (location.pathname.includes("/contracts")) return "contracts";
    if (location.pathname.includes("/settings")) return "settings";
    return "overview";
  };

  const activeTab = getActiveTab();

  useEffect(() => {
    if (id) {
      loadClientData();
    }
  }, [id]);

  const loadClientData = async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      const clientData = await clientsService.getClientById(id);
      if (!clientData) {
        toast.error("Cliente não encontrado");
        navigate("/clients");
        return;
      }
      setClient(clientData);

      // Carregar notas
      try {
        if (clientData.notes) {
          const parsedNotes = typeof clientData.notes === 'string' 
            ? JSON.parse(clientData.notes) 
            : clientData.notes;
          setNotes(Array.isArray(parsedNotes) ? parsedNotes : []);
        } else {
          setNotes([]);
        }
      } catch (e) {
        if (typeof clientData.notes === 'string' && clientData.notes.trim()) {
          setNotes([{
            id: `note-${Date.now()}`,
            content: clientData.notes,
            color: 'bg-yellow-200',
          }]);
        } else {
          setNotes([]);
        }
      }

      // Carregar tarefas
      const tasks = await clientsService.getClientTasks(id);
      setClientTasks(tasks || []);

      // Carregar grupos
      const groups = await clientsService.getClientGroups();
      setClientGroups(groups || []);
      setNewClientGroup(clientData.group_id || "");

    } catch (error: any) {
      console.error("Erro ao carregar cliente:", error);
      toast.error("Erro ao carregar dados do cliente");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNote = () => {
    const newNote: StickyNoteData = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: "",
      color: 'bg-yellow-200',
      created_at: new Date().toISOString(),
    };
    setNotes([...notes, newNote]);
    setTimeout(() => saveNotes([...notes, newNote]), 100);
  };

  const handleUpdateNote = async (noteId: string, content: string) => {
    const updatedNotes = notes.map(note => 
      note.id === noteId 
        ? { ...note, content, updated_at: new Date().toISOString() }
        : note
    );
    setNotes(updatedNotes);
    await saveNotes(updatedNotes);
  };

  const handleDeleteNote = async (noteId: string) => {
    const updatedNotes = notes.filter(note => note.id !== noteId);
    setNotes(updatedNotes);
    await saveNotes(updatedNotes);
  };

  const handleColorChange = async (noteId: string, color: string) => {
    const updatedNotes = notes.map(note => 
      note.id === noteId ? { ...note, color } : note
    );
    setNotes(updatedNotes);
    await saveNotes(updatedNotes);
  };

  const saveNotes = async (notesToSave: StickyNoteData[]) => {
    if (!client) return;
    
    try {
      const notesJson = JSON.stringify(notesToSave);
      await clientsService.updateClient(client.id, { notes: notesJson });
      setClient({ ...client, notes: notesJson });
      toast.success("Notas salvas com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar notas:", error);
      toast.error(`Erro ao salvar notas: ${error.message}`);
    }
  };

  const handleAddTask = async (values: z.infer<typeof taskSchema>) => {
    if (!client) return;
    
    try {
      const formattedDueDate = values.due_date ? values.due_date.toISOString() : null;
      
      const result = await addClientTask({
        client_id: client.id,
        title: values.title,
        description: values.description || "",
        due_date: formattedDueDate,
        status: values.status
      });

      if (!result.success) {
        throw new Error(result.error?.message || "Erro ao adicionar tarefa");
      }
      
      if (result.data) {
        setClientTasks([...clientTasks, result.data]);
      }
      
      toast.success("Tarefa adicionada com sucesso!");
      setIsAddTaskDialogOpen(false);
      taskForm.reset();
      
      // Recarregar tarefas
      const tasks = await clientsService.getClientTasks(client.id);
      setClientTasks(tasks || []);
    } catch (error: any) {
      console.error("Erro ao adicionar tarefa:", error);
      toast.error(`Erro ao adicionar tarefa: ${error.message}`);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      await clientsService.updateClientTask(taskId, { status: newStatus });
      setClientTasks(clientTasks.map(task => 
        task.id === taskId ? { ...task, status: newStatus } : task
      ));
      toast.success("Status da tarefa atualizado!");
    } catch (error: any) {
      console.error("Erro ao atualizar tarefa:", error);
      toast.error("Erro ao atualizar tarefa");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await clientsService.deleteClientTask(taskId);
      setClientTasks(clientTasks.filter(task => task.id !== taskId));
      toast.success("Tarefa excluída com sucesso!");
    } catch (error: any) {
      console.error("Erro ao excluir tarefa:", error);
      toast.error("Erro ao excluir tarefa");
    }
  };

  const handleUpdateGroup = async () => {
    if (!client) return;
    
    try {
      await clientsService.updateClient(client.id, { group_id: newClientGroup || undefined });
      setClient({ ...client, group_id: newClientGroup });
      toast.success("Grupo atualizado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao atualizar grupo:", error);
      toast.error(`Erro ao atualizar grupo: ${error.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-crm-primary"></div>
          <p className="mt-4 text-muted-foreground">Carregando cliente...</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Cliente não encontrado</p>
          <Button onClick={() => navigate("/clients")}>Voltar para Clientes</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar do Cliente */}
      <ClientSidebar clientId={client.id} clientName={client.name} />

      {/* Conteúdo Principal */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold">{client.name}</h1>
                  <Badge variant="outline">Cliente</Badge>
                </div>
                {client.company && (
                  <p className="text-muted-foreground flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    {client.company}
                  </p>
                )}
              </div>
              <Button variant="outline" onClick={() => navigate("/clients")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            </div>
          </div>

          {/* Conteúdo baseado na aba ativa */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Informações de Contato</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {client.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{client.phone}</span>
                    </div>
                  )}
                  {client.status && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Badge variant="outline" className="mt-1">{client.status}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Estatísticas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Tarefas</Label>
                    <p className="text-2xl font-bold mt-1">{clientTasks.length}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Notas</Label>
                    <p className="text-2xl font-bold mt-1">{notes.length}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Grupo</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={newClientGroup} onValueChange={setNewClientGroup}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sem grupo</SelectItem>
                      {clientGroups.map(group => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    size="sm" 
                    className="mt-2 w-full"
                    onClick={handleUpdateGroup}
                  >
                    Atualizar Grupo
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "details" && (
            <Card>
              <CardHeader>
                <CardTitle>Detalhes do Cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome</Label>
                    <p className="text-sm mt-1">{client.name}</p>
                  </div>
                  <div>
                    <Label>Empresa</Label>
                    <p className="text-sm mt-1">{client.company || "Não informado"}</p>
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <p className="text-sm mt-1">{client.email || "Não informado"}</p>
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <p className="text-sm mt-1">{client.phone || "Não informado"}</p>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <p className="text-sm mt-1">{client.status || "Ativo"}</p>
                  </div>
                  <div>
                    <Label>Origem</Label>
                    <p className="text-sm mt-1">{client.source || "Não informado"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "tasks" && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Tarefas</CardTitle>
                  <Button onClick={() => setIsAddTaskDialogOpen(true)} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Tarefa
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {clientTasks && clientTasks.length > 0 ? (
                    clientTasks.map(task => {
                      if (!task || !task.id) return null;
                      return (
                        <Card key={task.id} className="p-4">
                          <div className="flex justify-between">
                            <div>
                              <h4 className="font-medium">{task.title || 'Sem título'}</h4>
                              {task.description && <p className="text-sm text-muted-foreground mt-1">{task.description}</p>}
                              {task.due_date && (
                                <div className="flex items-center text-xs text-muted-foreground mt-2">
                                  <CalendarIcon className="h-3 w-3 mr-1" />
                                  {format(new Date(task.due_date), "dd/MM/yyyy")}
                                </div>
                              )}
                            </div>
                            <div className="flex items-start space-x-2">
                              <Select
                                value={task.status || 'Pendente'}
                                onValueChange={(value) => handleUpdateTaskStatus(task.id, value)}
                              >
                                <SelectTrigger className="h-8 w-[120px]">
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Pendente">Pendente</SelectItem>
                                  <SelectItem value="Em andamento">Em andamento</SelectItem>
                                  <SelectItem value="Concluída">Concluída</SelectItem>
                                  <SelectItem value="Cancelada">Cancelada</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa cadastrada</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "notes" && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Notas Autoadesivas</CardTitle>
                  <Button onClick={handleAddNote} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Nota
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative min-h-[400px] p-4 bg-gray-50 rounded-lg">
                  {notes.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {notes.map(note => (
                        <StickyNote
                          key={note.id}
                          note={note}
                          onUpdate={handleUpdateNote}
                          onDelete={handleDeleteNote}
                          onColorChange={handleColorChange}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[300px] text-center">
                      <p className="text-muted-foreground mb-4">
                        Nenhuma nota cadastrada
                      </p>
                      <Button onClick={handleAddNote} variant="outline">
                        <Plus className="mr-2 h-4 w-4" />
                        Criar Primeira Nota
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Outras abas - placeholder */}
          {(activeTab === "opportunities" || activeTab === "messages" || activeTab === "calendar" || 
            activeTab === "finance" || activeTab === "contracts" || activeTab === "settings") && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {activeTab === "opportunities" && "Oportunidades"}
                  {activeTab === "messages" && "Mensagens"}
                  {activeTab === "calendar" && "Agenda"}
                  {activeTab === "finance" && "Financeiro"}
                  {activeTab === "contracts" && "Contratos"}
                  {activeTab === "settings" && "Configurações"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Esta funcionalidade será implementada em breve.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialog para adicionar tarefa */}
      <Dialog open={isAddTaskDialogOpen} onOpenChange={setIsAddTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
            <DialogDescription>
              Adicione uma nova tarefa para este cliente
            </DialogDescription>
          </DialogHeader>
          <Form {...taskForm}>
            <form onSubmit={taskForm.handleSubmit(handleAddTask)} className="space-y-4">
              <FormField
                control={taskForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Digite o título da tarefa" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={taskForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Descreva os detalhes da tarefa" value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={taskForm.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de vencimento</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className="w-full pl-3 text-left font-normal flex justify-between items-center">
                            {field.value ? format(field.value, "dd/MM/yyyy") : <span>Selecionar data</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={taskForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Pendente">Pendente</SelectItem>
                        <SelectItem value="Em andamento">Em andamento</SelectItem>
                        <SelectItem value="Concluída">Concluída</SelectItem>
                        <SelectItem value="Cancelada">Cancelada</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddTaskDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Salvar Tarefa</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientProfile;

