
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CalendarIcon,
  Plus,
  ListTodo,
  Clock,
  CheckSquare,
  CheckCheck,
  Users,
  Tag,
  Calendar as CalendarIcon2,
  User,
  ClipboardList,
  MoreHorizontal,
  PlusCircle,
  Trash2,
  PenLine
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Types
type ProjectStatus = "active" | "completed" | "archived";
type TaskStatus = "todo" | "in-progress" | "review" | "completed";
type Priority = "low" | "medium" | "high";

interface Member {
  id: string;
  name: string;
  avatar: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  assignee?: Member;
  labels?: string[];
}

interface ProjectList {
  id: string;
  name: string;
  tasks: Task[];
  order: number;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  dueDate?: string;
  members: Member[];
  lists: ProjectList[];
}

// Mock data
const mockMembers: Member[] = [
  { id: "1", name: "Carlos Silva", avatar: "CS" },
  { id: "2", name: "Ana Oliveira", avatar: "AO" },
  { id: "3", name: "Marcos Santos", avatar: "MS" },
  { id: "4", name: "Juliana Lima", avatar: "JL" },
];

const initialProjects: Project[] = [
  {
    id: "p1",
    name: "Redesenho do Site",
    description: "Atualização completa do design e da funcionalidade do site corporativo",
    status: "active",
    dueDate: "2025-06-30",
    members: [mockMembers[0], mockMembers[1]],
    lists: [
      {
        id: "l1",
        name: "A Fazer",
        order: 0,
        tasks: [
          {
            id: "t1",
            title: "Wireframes para homepage",
            description: "Criar wireframes para a nova homepage",
            status: "todo",
            priority: "high",
            dueDate: "2025-05-25",
            assignee: mockMembers[1],
            labels: ["Design", "Frontend"]
          },
          {
            id: "t2",
            title: "Estrutura de navegação",
            description: "Definir nova estrutura de navegação do site",
            status: "todo",
            priority: "medium",
            dueDate: "2025-05-23",
            assignee: mockMembers[0],
            labels: ["UX"]
          },
        ]
      },
      {
        id: "l2",
        name: "Em Andamento",
        order: 1,
        tasks: [
          {
            id: "t3",
            title: "Análise de SEO",
            description: "Realizar análise SEO completa do site atual",
            status: "in-progress",
            priority: "medium",
            dueDate: "2025-05-21",
            assignee: mockMembers[1],
            labels: ["SEO"]
          }
        ]
      },
      {
        id: "l3",
        name: "Revisão",
        order: 2,
        tasks: [
          {
            id: "t4",
            title: "Paleta de cores",
            description: "Finalizar paleta de cores para o novo site",
            status: "review",
            priority: "low",
            assignee: mockMembers[2],
            labels: ["Design"]
          }
        ]
      },
      {
        id: "l4",
        name: "Concluídos",
        order: 3,
        tasks: [
          {
            id: "t5",
            title: "Benchmark concorrentes",
            description: "Análise dos sites dos concorrentes",
            status: "completed",
            priority: "high",
            assignee: mockMembers[0],
            labels: ["Research"]
          }
        ]
      }
    ]
  },
  {
    id: "p2",
    name: "Campanha Marketing Q2",
    description: "Planejamento e execução da campanha de marketing do segundo trimestre",
    status: "active",
    dueDate: "2025-07-15",
    members: [mockMembers[1], mockMembers[2], mockMembers[3]],
    lists: [
      {
        id: "l5",
        name: "A Fazer",
        order: 0,
        tasks: [
          {
            id: "t6",
            title: "Definir canais",
            description: "Selecionar canais de marketing para a campanha",
            status: "todo",
            priority: "high",
            dueDate: "2025-05-24",
            assignee: mockMembers[3],
            labels: ["Planejamento"]
          }
        ]
      },
      {
        id: "l6",
        name: "Em Andamento",
        order: 1,
        tasks: [
          {
            id: "t7",
            title: "Criar conteúdo",
            description: "Desenvolver conteúdo para redes sociais",
            status: "in-progress",
            priority: "medium",
            dueDate: "2025-05-28",
            assignee: mockMembers[1],
            labels: ["Conteúdo"]
          }
        ]
      },
      {
        id: "l7",
        name: "Revisão",
        order: 2,
        tasks: []
      },
      {
        id: "l8",
        name: "Concluídos",
        order: 3,
        tasks: []
      }
    ]
  }
];

const Projects = () => {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [selectedProject, setSelectedProject] = useState<Project | null>(projects[0]);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [activeTab, setActiveTab] = useState("board");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  // Create a new project
  const handleCreateProject = (event: React.FormEvent) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);

    const newProject: Project = {
      id: `p${projects.length + 1}`,
      name: formData.get('projectName') as string,
      description: formData.get('description') as string,
      status: "active",
      dueDate: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined,
      members: [],
      lists: [
        { id: `l-${Date.now()}-1`, name: "A Fazer", tasks: [], order: 0 },
        { id: `l-${Date.now()}-2`, name: "Em Andamento", tasks: [], order: 1 },
        { id: `l-${Date.now()}-3`, name: "Revisão", tasks: [], order: 2 },
        { id: `l-${Date.now()}-4`, name: "Concluídos", tasks: [], order: 3 },
      ]
    };

    setProjects([...projects, newProject]);
    setSelectedProject(newProject);
    setNewProjectDialogOpen(false);
    toast.success("Projeto criado com sucesso!");
  };

  // Create a new list
  const handleCreateList = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject) return;

    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const listName = formData.get('listName') as string;

    const highestOrder = Math.max(...selectedProject.lists.map(list => list.order));
    
    const newList: ProjectList = {
      id: `l-${Date.now()}`,
      name: listName,
      tasks: [],
      order: highestOrder + 1
    };

    const updatedProject = {
      ...selectedProject,
      lists: [...selectedProject.lists, newList]
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    setNewListDialogOpen(false);
    toast.success("Lista criada com sucesso!");
  };

  // Create a new task
  const handleCreateTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject || !selectedListId) return;

    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    
    const newTask: Task = {
      id: `t-${Date.now()}`,
      title: formData.get('taskTitle') as string,
      description: formData.get('taskDescription') as string,
      status: "todo",
      priority: (formData.get('priority') as Priority) || "medium",
      dueDate: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined,
      labels: []
    };

    const assigneeId = formData.get('assignee') as string;
    if (assigneeId) {
      const assignee = mockMembers.find(m => m.id === assigneeId);
      if (assignee) {
        newTask.assignee = assignee;
      }
    }

    const updatedProject = {
      ...selectedProject,
      lists: selectedProject.lists.map(list => 
        list.id === selectedListId 
          ? { ...list, tasks: [...list.tasks, newTask] }
          : list
      )
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    setNewTaskDialogOpen(false);
    toast.success("Tarefa criada com sucesso!");
  };

  // Task status toggling
  const toggleTaskStatus = (listId: string, taskId: string) => {
    if (!selectedProject) return;

    const updatedProject = {
      ...selectedProject,
      lists: selectedProject.lists.map(list => {
        if (list.id !== listId) return list;
        
        return {
          ...list,
          tasks: list.tasks.map(task => {
            if (task.id !== taskId) return task;
            
            const newStatus: TaskStatus = task.status === "completed" ? "todo" : "completed";
            
            if (newStatus === "completed") {
              toast.success("Tarefa concluída!");
            }
            
            return {
              ...task,
              status: newStatus
            };
          })
        };
      })
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
  };

  // Delete a task
  const deleteTask = (listId: string, taskId: string) => {
    if (!selectedProject) return;

    const updatedProject = {
      ...selectedProject,
      lists: selectedProject.lists.map(list => {
        if (list.id !== listId) return list;
        
        return {
          ...list,
          tasks: list.tasks.filter(task => task.id !== taskId)
        };
      })
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    toast.success("Tarefa removida com sucesso!");
  };

  // Get priority color
  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case "high": return "text-red-500";
      case "medium": return "text-amber-500";
      case "low": return "text-blue-500";
      default: return "text-gray-500";
    }
  };

  // Get priority icon
  const getPriorityIcon = (priority: Priority) => {
    const className = `h-3 w-3 ${getPriorityColor(priority)}`;
    const props = { className, fill: "currentColor" };
    return <div className={`h-2 w-2 rounded-full ${priority === "high" ? "bg-red-500" : priority === "medium" ? "bg-amber-500" : "bg-blue-500"}`} />;
  };

  // Format date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    return format(new Date(dateStr), "dd/MM/yyyy");
  };

  // Render projects list section
  const renderProjectsList = () => (
    <div className="w-full lg:w-64 flex-shrink-0 pr-6 border-r">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium">Projetos</h2>
        <Dialog open={newProjectDialogOpen} onOpenChange={setNewProjectDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Novo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Projeto</DialogTitle>
              <DialogDescription>
                Adicione as informações do novo projeto
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateProject}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="projectName">Nome do Projeto</Label>
                  <Input id="projectName" name="projectName" placeholder="Nome do projeto" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea id="description" name="description" placeholder="Descreva o projeto..." />
                </div>
                <div className="grid gap-2">
                  <Label>Data de Entrega</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, "dd/MM/yyyy") : <span>Selecione uma data</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setNewProjectDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Criar Projeto</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {projects.map(project => (
          <div
            key={project.id}
            className={cn(
              "px-3 py-2 rounded-md cursor-pointer flex items-center justify-between",
              selectedProject?.id === project.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
            )}
            onClick={() => setSelectedProject(project)}
          >
            <div className="flex flex-col">
              <span className="font-medium truncate max-w-[180px]">{project.name}</span>
              <span className="text-xs text-muted-foreground">
                {project.dueDate ? `Entrega: ${formatDate(project.dueDate)}` : "Sem prazo definido"}
              </span>
            </div>
            <Badge variant={project.status === "completed" ? "outline" : "default"}>
              {project.status === "active" ? "Ativo" : project.status === "completed" ? "Concluído" : "Arquivado"}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );

  // Board view rendering
  const renderBoardView = () => {
    if (!selectedProject) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Selecione um projeto para visualizar</p>
        </div>
      );
    }

    return (
      <div className="flex-1 h-full">
        <div className="flex gap-4 h-full overflow-x-auto pb-6">
          {selectedProject.lists.sort((a, b) => a.order - b.order).map(list => (
            <div key={list.id} className="flex-shrink-0 w-80 bg-muted/30 rounded-md overflow-hidden">
              <div className="p-2 bg-muted/50">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium truncate">{list.name}</h3>
                  <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full">
                    {list.tasks.length}
                  </span>
                </div>
              </div>
              <div className="p-2 space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {list.tasks.map(task => (
                  <Card key={task.id} className="shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Checkbox
                              checked={task.status === "completed"}
                              onCheckedChange={() => toggleTaskStatus(list.id, task.id)}
                              className="h-4 w-4"
                            />
                            <h4 className={cn(
                              "font-medium truncate",
                              task.status === "completed" && "line-through text-muted-foreground"
                            )}>
                              {task.title}
                            </h4>
                          </div>
                          {task.description && (
                            <p className="text-xs text-muted-foreground truncate mb-2">
                              {task.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {task.labels?.map(label => (
                              <span key={label} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                {label}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            {task.dueDate && (
                              <div className="flex items-center">
                                <CalendarIcon2 className="h-3 w-3 mr-1" />
                                <span>{formatDate(task.dueDate)}</span>
                              </div>
                            )}
                            {getPriorityIcon(task.priority)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          {task.assignee && (
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                {task.assignee.avatar}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 mt-1">
                                <MoreHorizontal className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <PenLine className="h-3.5 w-3.5 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => deleteTask(list.id, task.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => {
                    setSelectedListId(list.id);
                    setNewTaskDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Tarefa
                </Button>
              </div>
            </div>
          ))}
          <div className="flex-shrink-0 w-60">
            <Dialog open={newListDialogOpen} onOpenChange={setNewListDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Lista
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova Lista</DialogTitle>
                  <DialogDescription>Crie uma nova lista para organizar suas tarefas</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateList}>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="listName">Nome da Lista</Label>
                      <Input id="listName" name="listName" placeholder="Nome da lista" required />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setNewListDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Criar Lista</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    );
  };

  // Task list view rendering
  const renderListView = () => {
    if (!selectedProject) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Selecione um projeto para visualizar</p>
        </div>
      );
    }

    // Flatten all tasks from all lists
    const allTasks = selectedProject.lists.flatMap(list => {
      return list.tasks.map(task => ({
        ...task,
        listId: list.id,
        listName: list.name
      }));
    });

    const todoTasks = allTasks.filter(task => task.status !== 'completed');
    const completedTasks = allTasks.filter(task => task.status === 'completed');

    return (
      <div className="space-y-6">
        <div>
          <h3 className="font-medium mb-2">Tarefas Pendentes ({todoTasks.length})</h3>
          {todoTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Não há tarefas pendentes</p>
          ) : (
            <div className="space-y-2">
              {todoTasks.map(task => (
                <Card key={task.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start">
                      <Checkbox
                        checked={task.status === "completed"}
                        onCheckedChange={() => toggleTaskStatus(task.listId, task.id)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex justify-between">
                          <h4 className="font-medium">{task.title}</h4>
                          <Badge variant="outline">{task.listName}</Badge>
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {task.dueDate && (
                            <div className="flex items-center">
                              <CalendarIcon2 className="h-3.5 w-3.5 mr-1" />
                              <span>{formatDate(task.dueDate)}</span>
                            </div>
                          )}
                          <div className="flex items-center">
                            {getPriorityIcon(task.priority)}
                            <span className="ml-1">
                              {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Média" : "Baixa"}
                            </span>
                          </div>
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
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="font-medium mb-2">Tarefas Concluídas ({completedTasks.length})</h3>
          {completedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Não há tarefas concluídas</p>
          ) : (
            <div className="space-y-2">
              {completedTasks.map(task => (
                <Card key={task.id} className="opacity-70">
                  <CardContent className="p-3">
                    <div className="flex items-start">
                      <Checkbox
                        checked={task.status === "completed"}
                        onCheckedChange={() => toggleTaskStatus(task.listId, task.id)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex justify-between">
                          <h4 className="font-medium line-through">{task.title}</h4>
                          <Badge variant="outline">{task.listName}</Badge>
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-through">{task.description}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // New task dialog
  const renderNewTaskDialog = () => (
    <Dialog open={newTaskDialogOpen} onOpenChange={setNewTaskDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
          <DialogDescription>
            Adicione os detalhes da nova tarefa
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreateTask}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="taskTitle">Título</Label>
              <Input id="taskTitle" name="taskTitle" placeholder="Título da tarefa" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="taskDescription">Descrição</Label>
              <Textarea id="taskDescription" name="taskDescription" placeholder="Descreva a tarefa..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="priority">Prioridade</Label>
                <Select name="priority" defaultValue="medium">
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
              <div className="grid gap-2">
                <Label htmlFor="assignee">Responsável</Label>
                <Select name="assignee">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockMembers.map(member => (
                      <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Data de Entrega</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "dd/MM/yyyy") : <span>Selecione uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewTaskDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Criar Tarefa</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gerenciamento de Projetos</h1>
        <Button onClick={() => setNewProjectDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Projeto
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {renderProjectsList()}
        
        <div className="flex-1">
          {selectedProject && (
            <div className="mb-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold">{selectedProject.name}</h2>
                  <p className="text-muted-foreground">{selectedProject.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {selectedProject.members.map(member => (
                      <Avatar key={member.id} className="border-2 border-background">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {member.avatar}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <Button size="sm" variant="outline">
                    <Users className="h-4 w-4 mr-1" />
                    Gerenciar Equipe
                  </Button>
                </div>
              </div>
            
              <div className="mb-4">
                <Tabs 
                  defaultValue="board" 
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-full"
                >
                  <TabsList>
                    <TabsTrigger value="board">
                      <ListTodo className="h-4 w-4 mr-1" />
                      Quadro
                    </TabsTrigger>
                    <TabsTrigger value="list">
                      <ClipboardList className="h-4 w-4 mr-1" />
                      Lista
                    </TabsTrigger>
                    <TabsTrigger value="calendar">
                      <CalendarIcon2 className="h-4 w-4 mr-1" />
                      Calendário
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="board">
                    {renderBoardView()}
                  </TabsContent>
                  <TabsContent value="list">
                    {renderListView()}
                  </TabsContent>
                  <TabsContent value="calendar">
                    <div className="h-96 flex items-center justify-center bg-muted/20 rounded-md border border-dashed">
                      <div className="text-center">
                        <CalendarIcon2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-muted-foreground">Visualização de calendário em breve</p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
          
          {!selectedProject && (
            <div className="flex flex-col items-center justify-center h-64">
              <p className="text-lg mb-4 text-muted-foreground">Selecione um projeto ou crie um novo</p>
              <Button onClick={() => setNewProjectDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Projeto
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {renderNewTaskDialog()}
    </div>
  );
};

export default Projects;
