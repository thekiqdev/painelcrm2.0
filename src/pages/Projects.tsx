
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
  PenLine,
  Kanban,
  File,
  DollarSign,
  Edit,
  X
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

interface ProjectFile {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedBy: Member;
  uploadedAt: string;
  url: string;
}

interface ProjectFinanceItem {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  status: "paid" | "pending" | "overdue";
  category?: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  dueDate?: string;
  members: Member[];
  lists: ProjectList[];
  files?: ProjectFile[];
  financeItems?: ProjectFinanceItem[];
}

// Mock data
const mockMembers: Member[] = [
  { id: "1", name: "Carlos Silva", avatar: "CS" },
  { id: "2", name: "Ana Oliveira", avatar: "AO" },
  { id: "3", name: "Marcos Santos", avatar: "MS" },
  { id: "4", name: "Juliana Lima", avatar: "JL" },
];

const mockFiles: ProjectFile[] = [
  {
    id: "f1",
    name: "projeto-wireframe.pdf",
    type: "pdf",
    size: "2.4 MB",
    uploadedBy: mockMembers[0],
    uploadedAt: "2025-05-10",
    url: "#"
  },
  {
    id: "f2",
    name: "design-mockup.psd",
    type: "psd",
    size: "8.1 MB",
    uploadedBy: mockMembers[1],
    uploadedAt: "2025-05-12",
    url: "#"
  },
  {
    id: "f3",
    name: "contrato-cliente.docx",
    type: "docx",
    size: "1.2 MB",
    uploadedBy: mockMembers[2],
    uploadedAt: "2025-05-15",
    url: "#"
  }
];

const mockFinanceItems: ProjectFinanceItem[] = [
  {
    id: "fin1",
    description: "Pagamento inicial",
    amount: 5000,
    type: "income",
    date: "2025-05-05",
    status: "paid",
    category: "Faturamento"
  },
  {
    id: "fin2",
    description: "Licença de software",
    amount: 350,
    type: "expense",
    date: "2025-05-10",
    status: "paid",
    category: "Ferramentas"
  },
  {
    id: "fin3",
    description: "Segunda parcela",
    amount: 3500,
    type: "income",
    date: "2025-06-10",
    status: "pending",
    category: "Faturamento"
  }
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
    ],
    files: mockFiles,
    financeItems: mockFinanceItems
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
    ],
    files: [],
    financeItems: []
  }
];

const Projects = () => {
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [editListDialogOpen, setEditListDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [activeTab, setActiveTab] = useState("board");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<ProjectList | null>(null);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFinanceItemDialogOpen, setNewFinanceItemDialogOpen] = useState(false);

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
      ],
      files: [],
      financeItems: []
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

  // Edit a list
  const handleEditList = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject || !editingList) return;

    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const listName = formData.get('listName') as string;

    const updatedProject = {
      ...selectedProject,
      lists: selectedProject.lists.map(list => 
        list.id === editingList.id 
          ? { ...list, name: listName }
          : list
      )
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    setEditListDialogOpen(false);
    setEditingList(null);
    toast.success("Lista atualizada com sucesso!");
  };

  // Delete a list
  const deleteList = (listId: string) => {
    if (!selectedProject) return;

    // Don't delete if the list has tasks
    const listToDelete = selectedProject.lists.find(list => list.id === listId);
    if (listToDelete && listToDelete.tasks.length > 0) {
      toast.error("Não é possível excluir uma lista que contém tarefas");
      return;
    }

    const updatedProject = {
      ...selectedProject,
      lists: selectedProject.lists.filter(list => list.id !== listId)
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    toast.success("Lista removida com sucesso!");
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

  // Mock file upload
  const handleAddFile = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject) return;

    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const fileName = formData.get('fileName') as string;
    const fileType = fileName.split('.').pop() || '';
    
    const newFile: ProjectFile = {
      id: `f-${Date.now()}`,
      name: fileName,
      type: fileType,
      size: "1.2 MB",
      uploadedBy: mockMembers[0],
      uploadedAt: format(new Date(), 'yyyy-MM-dd'),
      url: "#"
    };

    const updatedProject = {
      ...selectedProject,
      files: [...(selectedProject.files || []), newFile]
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    setNewFileDialogOpen(false);
    toast.success("Arquivo adicionado com sucesso!");
  };
  
  // Add finance item
  const handleAddFinanceItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject) return;

    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    
    const newFinanceItem: ProjectFinanceItem = {
      id: `fin-${Date.now()}`,
      description: formData.get('description') as string,
      amount: parseFloat((formData.get('amount') as string) || "0"),
      type: formData.get('type') as "income" | "expense",
      date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      status: formData.get('status') as "paid" | "pending" | "overdue",
      category: formData.get('category') as string
    };

    const updatedProject = {
      ...selectedProject,
      financeItems: [...(selectedProject.financeItems || []), newFinanceItem]
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    setNewFinanceItemDialogOpen(false);
    toast.success("Item financeiro adicionado com sucesso!");
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

  // Delete a file
  const deleteFile = (fileId: string) => {
    if (!selectedProject || !selectedProject.files) return;

    const updatedProject = {
      ...selectedProject,
      files: selectedProject.files.filter(file => file.id !== fileId)
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    toast.success("Arquivo removido com sucesso!");
  };

  // Delete a finance item
  const deleteFinanceItem = (itemId: string) => {
    if (!selectedProject || !selectedProject.financeItems) return;

    const updatedProject = {
      ...selectedProject,
      financeItems: selectedProject.financeItems.filter(item => item.id !== itemId)
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    toast.success("Item financeiro removido com sucesso!");
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

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
  };

  // Render projects list view
  const renderProjectsList = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">Lista de Projetos</h2>
        <Dialog open={newProjectDialogOpen} onOpenChange={setNewProjectDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Novo Projeto
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map(project => (
          <Card key={project.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{project.name}</CardTitle>
                <Badge variant={project.status === "completed" ? "outline" : "default"}>
                  {project.status === "active" ? "Ativo" : project.status === "completed" ? "Concluído" : "Arquivado"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{project.description}</p>
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center">
                  <CalendarIcon2 className="h-4 w-4 mr-1 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {project.dueDate ? formatDate(project.dueDate) : "Sem prazo"}
                  </span>
                </div>
                <div className="flex -space-x-2">
                  {project.members.slice(0, 3).map(member => (
                    <Avatar key={member.id} className="border-2 border-background h-6 w-6">
                      <AvatarFallback className="text-xs">{member.avatar}</AvatarFallback>
                    </Avatar>
                  ))}
                  {project.members.length > 3 && (
                    <Avatar className="border-2 border-background h-6 w-6">
                      <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                        +{project.members.length - 3}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2 text-sm">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-medium">
                    {Math.round(
                      (project.lists
                        .flatMap(list => list.tasks)
                        .filter(task => task.status === "completed").length /
                        (project.lists.flatMap(list => list.tasks).length || 1)) *
                        100
                    )}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${Math.round(
                        (project.lists
                          .flatMap(list => list.tasks)
                          .filter(task => task.status === "completed").length /
                          (project.lists.flatMap(list => list.tasks).length || 1)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-1 pb-3">
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => {
                  setSelectedProject(project);
                  setViewMode("detail");
                }}
              >
                Ver Detalhes
              </Button>
            </CardFooter>
          </Card>
        ))}
        
        <Card className="flex items-center justify-center p-6 border-dashed border-2">
          <Button variant="ghost" onClick={() => setNewProjectDialogOpen(true)}>
            <Plus className="h-6 w-6 mr-2" />
            Novo Projeto
          </Button>
        </Card>
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
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingList(list);
                            setEditListDialogOpen(true);
                          }}
                        >
                          <Edit className="h-3.5 w-3.5 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => deleteList(list.id)}
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
                  Adicionar Etapa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova Etapa</DialogTitle>
                  <DialogDescription>Crie uma nova etapa para organizar suas tarefas</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateList}>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="listName">Nome da Etapa</Label>
                      <Input id="listName" name="listName" placeholder="Nome da etapa" required />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setNewListDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Criar Etapa</Button>
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

  // Calendar view rendering
  const renderCalendarView = () => {
    if (!selectedProject) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Selecione um projeto para visualizar</p>
        </div>
      );
    }

    // Get all tasks with due dates
    const tasksWithDates = selectedProject.lists.flatMap(list => {
      return list.tasks
        .filter(task => task.dueDate)
        .map(task => ({
          ...task,
          listId: list.id,
          listName: list.name
        }));
    });

    return (
      <div className="space-y-6">
        <div className="bg-card border rounded-lg p-6">
          <h3 className="font-medium mb-4">Prazos do Projeto</h3>
          
          <div className="flex flex-col gap-3">
            {tasksWithDates.length > 0 ? (
              tasksWithDates
                .sort((a, b) => {
                  if (!a.dueDate || !b.dueDate) return 0;
                  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                })
                .map(task => (
                  <Card key={task.id} className="border-l-4" style={{ borderLeftColor: task.status === "completed" ? "#22c55e" : "#f59e0b" }}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className={cn(
                            "font-medium",
                            task.status === "completed" && "line-through text-muted-foreground"
                          )}>
                            {task.title}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            <span className="font-medium">{formatDate(task.dueDate)}</span>
                            {task.assignee && ` • ${task.assignee.name}`}
                          </p>
                        </div>
                        <Badge variant="outline">{task.listName}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Não há tarefas com prazos definidos
              </p>
            )}
          </div>
          
          {selectedProject.dueDate && (
            <div className="mt-6 border-t pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Data de Entrega do Projeto</h4>
                  <p className="text-muted-foreground">{formatDate(selectedProject.dueDate)}</p>
                </div>
                <Badge variant={
                  new Date(selectedProject.dueDate) < new Date() ? "destructive" : "default"
                }>
                  {new Date(selectedProject.dueDate) < new Date() ? "Atrasado" : "No prazo"}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Files view rendering
  const renderFilesView = () => {
    if (!selectedProject) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Selecione um projeto para visualizar</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="font-medium">Arquivos do Projeto</h3>
          <Dialog open={newFileDialogOpen} onOpenChange={setNewFileDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Arquivo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Arquivo</DialogTitle>
                <DialogDescription>Faça upload de um arquivo para o projeto</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddFile}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="fileName">Nome do Arquivo</Label>
                    <Input id="fileName" name="fileName" placeholder="exemplo.pdf" required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="fileUpload">Arquivo</Label>
                    <Input id="fileUpload" name="fileUpload" type="file" />
                    <p className="text-xs text-muted-foreground">
                      (Simulação - O arquivo não será realmente enviado nesta demonstração)
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setNewFileDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Adicionar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {(!selectedProject.files || selectedProject.files.length === 0) ? (
          <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg">
            <File className="h-12 w-12 text-muted-foreground mb-4" />
            <h4 className="font-medium text-lg mb-2">Nenhum arquivo encontrado</h4>
            <p className="text-muted-foreground text-center mb-4">
              Adicione arquivos relacionados a este projeto para compartilhar com a equipe.
            </p>
            <Button onClick={() => setNewFileDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Arquivo
            </Button>
          </div>
        ) : (
          <div className="bg-card border rounded-lg">
            <div className="grid grid-cols-4 gap-4 p-4 font-medium text-sm border-b">
              <div className="col-span-2">Nome</div>
              <div>Adicionado por</div>
              <div>Data</div>
            </div>
            {selectedProject.files?.map(file => (
              <div key={file.id} className="grid grid-cols-4 gap-4 p-4 border-b last:border-0 items-center hover:bg-muted/40">
                <div className="col-span-2 flex items-center">
                  <div className="h-8 w-8 rounded bg-primary/10 text-primary flex items-center justify-center mr-3">
                    <File className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.size}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarFallback className="text-xs">{file.uploadedBy.avatar}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{file.uploadedBy.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{formatDate(file.uploadedAt)}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <PenLine className="h-4 w-4 mr-2" />
                        Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <User className="h-4 w-4 mr-2" />
                        Alterar responsável
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => deleteFile(file.id)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Finance view rendering
  const renderFinanceView = () => {
    if (!selectedProject) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Selecione um projeto para visualizar</p>
        </div>
      );
    }

    // Calculate totals
    const totalIncome = selectedProject.financeItems?.reduce((sum, item) => 
      item.type === "income" ? sum + item.amount : sum, 0) || 0;
      
    const totalExpenses = selectedProject.financeItems?.reduce((sum, item) => 
      item.type === "expense" ? sum + item.amount : sum, 0) || 0;
    
    const balance = totalIncome - totalExpenses;
    
    // Group by status
    const paid = selectedProject.financeItems?.filter(item => item.status === "paid") || [];
    const pending = selectedProject.financeItems?.filter(item => item.status === "pending") || [];
    const overdue = selectedProject.financeItems?.filter(item => item.status === "overdue") || [];

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="font-medium">Financeiro do Projeto</h3>
          <Dialog open={newFinanceItemDialogOpen} onOpenChange={setNewFinanceItemDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Item Financeiro</DialogTitle>
                <DialogDescription>Registre receitas ou despesas deste projeto</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddFinanceItem}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Input id="description" name="description" placeholder="Descrição do item" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="amount">Valor</Label>
                      <Input id="amount" name="amount" type="number" step="0.01" min="0" placeholder="0,00" required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="type">Tipo</Label>
                      <Select name="type" defaultValue="income">
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">Receita</SelectItem>
                          <SelectItem value="expense">Despesa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="status">Status</Label>
                      <Select name="status" defaultValue="pending">
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paid">Pago</SelectItem>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="overdue">Vencido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="category">Categoria</Label>
                      <Select name="category">
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Faturamento">Faturamento</SelectItem>
                          <SelectItem value="Ferramentas">Ferramentas</SelectItem>
                          <SelectItem value="Pessoal">Pessoal</SelectItem>
                          <SelectItem value="Marketing">Marketing</SelectItem>
                          <SelectItem value="Outros">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Data</Label>
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
                  <Button type="button" variant="outline" onClick={() => setNewFinanceItemDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Adicionar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Receitas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(totalIncome)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Despesas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{formatCurrency(totalExpenses)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${balance >= 0 ? "text-green-600" : "text-destructive"}`}>
                {formatCurrency(balance)}
              </div>
            </CardContent>
          </Card>
        </div>

        {(!selectedProject.financeItems || selectedProject.financeItems.length === 0) ? (
          <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg">
            <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
            <h4 className="font-medium text-lg mb-2">Nenhum item financeiro</h4>
            <p className="text-muted-foreground text-center mb-4">
              Adicione receitas e despesas para gerenciar as finanças deste projeto.
            </p>
            <Button onClick={() => setNewFinanceItemDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Item
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-card border rounded-lg">
              <div className="grid grid-cols-6 gap-4 p-4 font-medium text-sm border-b">
                <div className="col-span-2">Descrição</div>
                <div>Categoria</div>
                <div>Data</div>
                <div>Status</div>
                <div className="text-right">Valor</div>
              </div>
              {selectedProject.financeItems?.map(item => (
                <div key={item.id} className="grid grid-cols-6 gap-4 p-4 border-b last:border-0 items-center hover:bg-muted/40">
                  <div className="col-span-2 flex items-center">
                    <div className={`h-8 w-8 rounded flex items-center justify-center mr-3 ${
                      item.type === "income" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                    }`}>
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{item.description}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-sm">{item.category || "Não categorizado"}</span>
                  </div>
                  <div>
                    <span className="text-sm">{formatDate(item.date)}</span>
                  </div>
                  <div>
                    <Badge variant={
                      item.status === "paid" ? "outline" : 
                      item.status === "pending" ? "secondary" : 
                      "destructive"
                    }>
                      {item.status === "paid" ? "Pago" : 
                       item.status === "pending" ? "Pendente" : "Vencido"}
                    </Badge>
                  </div>
                  <div className="text-right flex items-center justify-end">
                    <span className={`font-medium ${
                      item.type === "income" ? "text-green-600" : "text-destructive"
                    }`}>
                      {item.type === "income" ? "+" : "-"}{formatCurrency(item.amount)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="ml-2">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <PenLine className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <CheckCheck className="h-4 w-4 mr-2" />
                          Marcar como pago
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteFinanceItem(item.id)}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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

  // Edit list dialog
  const renderEditListDialog = () => (
    <Dialog open={editListDialogOpen} onOpenChange={setEditListDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Etapa</DialogTitle>
          <DialogDescription>Altere o nome da etapa</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleEditList}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="listName">Nome da Etapa</Label>
              <Input 
                id="listName" 
                name="listName" 
                placeholder="Nome da etapa" 
                defaultValue={editingList?.name}
                required 
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditListDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  // Render project detail view
  const renderProjectDetail = () => {
    if (!selectedProject) {
      return (
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-lg mb-4 text-muted-foreground">Selecione um projeto ou crie um novo</p>
          <Button onClick={() => setNewProjectDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Criar Projeto
          </Button>
        </div>
      );
    }

    return (
      <div>
        <div className="mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => setViewMode("list")}
                >
                  <X className="h-4 w-4" />
                </Button>
                <h2 className="text-xl font-bold">{selectedProject.name}</h2>
                <Badge variant={selectedProject.status === "completed" ? "outline" : "default"}>
                  {selectedProject.status === "active" ? "Ativo" : selectedProject.status === "completed" ? "Concluído" : "Arquivado"}
                </Badge>
              </div>
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
        
          <div className="mb-6">
            <Tabs 
              defaultValue="board" 
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="board">
                  <Kanban className="h-4 w-4 mr-2" />
                  Etapas
                </TabsTrigger>
                <TabsTrigger value="list">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Tarefas
                </TabsTrigger>
                <TabsTrigger value="files">
                  <File className="h-4 w-4 mr-2" />
                  Arquivos
                </TabsTrigger>
                <TabsTrigger value="calendar">
                  <CalendarIcon2 className="h-4 w-4 mr-2" />
                  Calendário
                </TabsTrigger>
                <TabsTrigger value="finance">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Financeiro
                </TabsTrigger>
              </TabsList>
              <TabsContent value="board">
                {renderBoardView()}
              </TabsContent>
              <TabsContent value="list">
                {renderListView()}
              </TabsContent>
              <TabsContent value="files">
                {renderFilesView()}
              </TabsContent>
              <TabsContent value="calendar">
                {renderCalendarView()}
              </TabsContent>
              <TabsContent value="finance">
                {renderFinanceView()}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gerenciamento de Projetos</h1>
        {viewMode === "list" && (
          <Button onClick={() => setNewProjectDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Projeto
          </Button>
        )}
      </div>

      {/* Main content */}
      {viewMode === "list" ? renderProjectsList() : renderProjectDetail()}
      
      {/* Dialogs */}
      {renderNewTaskDialog()}
      {renderEditListDialog()}
    </div>
  );
};

export default Projects;
