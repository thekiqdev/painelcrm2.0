
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X, Users, Kanban, ClipboardList, File, DollarSign, Calendar as CalendarIcon2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// Importações de componentes
import { ProjectsListView } from "@/components/projects/ProjectsListView";
import { BoardView } from "@/components/projects/BoardView";
import { TaskListView } from "@/components/projects/TaskListView";
import { TaskDetailDialog } from "@/components/projects/TaskDetailDialog";
import { NewTaskDialog } from "@/components/projects/NewTaskDialog";
import { NewListDialog } from "@/components/projects/NewListDialog";
import { EditListDialog } from "@/components/projects/EditListDialog";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";

// Importações de tipos e dados
import { Project, ProjectList, Task, ChecklistItem } from "@/components/projects/types";
import { initialProjects, mockMembers } from "@/components/projects/mockData";

// Padrão de página única para toda a funcionalidade de projetos
const Projects = () => {
  // Estados principais
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState("board");

  // Estados de diálogos
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [editListDialogOpen, setEditListDialogOpen] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<ProjectList | null>(null);
  const [selectedTask, setSelectedTask] = useState<{task: Task, listId: string} | null>(null);

  // Funções para gestão de projetos
  const handleCreateProject = (event: React.FormEvent) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);

    const newProject: Project = {
      id: `p${projects.length + 1}`,
      name: formData.get('projectName') as string,
      description: formData.get('description') as string,
      status: "active",
      dueDate: formData.get('dueDate') as string,
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
    setViewMode("detail");
    setNewProjectDialogOpen(false);
    toast.success("Projeto criado com sucesso!");
  };

  // Funções para gestão de listas
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

  const deleteList = (listId: string) => {
    if (!selectedProject) return;

    // Não excluir se a lista contém tarefas
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

  // Funções para gestão de tarefas
  const handleCreateTask = (formData: FormData) => {
    if (!selectedProject || !selectedListId) return;
    
    // Obter dados do formulário
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const priority = (formData.get('priority') as string) || "medium";
    const dueDate = formData.get('dueDate') as string;
    const assigneeId = formData.get('assignee') as string;
    const tagsJson = formData.get('tags') as string;
    const tags = tagsJson ? JSON.parse(tagsJson) : [];
    
    // Encontrar o membro selecionado
    let assignee;
    if (assigneeId) {
      assignee = mockMembers.find(m => m.id === assigneeId);
    }
    
    // Criar nova tarefa
    const newTask: Task = {
      id: `t-${Date.now()}`,
      title,
      description,
      status: "todo",
      priority: priority as any,
      dueDate,
      assignee,
      tags,
      checklist: []
    };
    
    // Atualizar o projeto
    const updatedProject = {
      ...selectedProject,
      lists: selectedProject.lists.map(list => {
        if (list.id !== selectedListId) return list;
        
        return {
          ...list,
          tasks: [...list.tasks, newTask]
        };
      })
    };
    
    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    setNewTaskDialogOpen(false);
    toast.success("Tarefa criada com sucesso!");
  };

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
            
            const newStatus = task.status === "completed" ? "todo" : "completed";
            if (newStatus === "completed") {
              toast.success("Tarefa concluída!");
            }
            
            return {
              ...task,
              status: newStatus,
            };
          })
        };
      })
    };
    
    // Atualizar states
    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    
    // Atualizar a tarefa selecionada, se estiver aberta no modal
    if (selectedTask && selectedTask.task.id === taskId) {
      const updatedList = updatedProject.lists.find(list => list.id === listId);
      if (updatedList) {
        const updatedTask = updatedList.tasks.find(task => task.id === taskId);
        if (updatedTask) {
          setSelectedTask({task: updatedTask, listId});
        }
      }
    }
  };

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
    
    if (selectedTask?.task.id === taskId) {
      setTaskDetailOpen(false);
      setSelectedTask(null);
    }
    
    toast.success("Tarefa excluída com sucesso!");
  };

  // Funções para gestão do checklist
  const toggleChecklistItem = (itemId: string) => {
    if (!selectedTask || !selectedProject) return;
    
    const updatedProject = {
      ...selectedProject,
      lists: selectedProject.lists.map(list => {
        if (list.id !== selectedTask.listId) return list;
        
        return {
          ...list,
          tasks: list.tasks.map(task => {
            if (task.id !== selectedTask.task.id) return task;
            
            const updatedChecklist = (task.checklist || []).map(item => 
              item.id === itemId ? { ...item, completed: !item.completed } : item
            );
            
            // Verificar se todos os itens estão completos
            const allCompleted = updatedChecklist.length > 0 && updatedChecklist.every(item => item.completed);
            const newStatus = allCompleted ? "completed" : task.status;
            
            if (allCompleted && task.status !== "completed") {
              toast.success("Todas as tarefas concluídas!");
            }
            
            return {
              ...task,
              status: newStatus,
              checklist: updatedChecklist
            };
          })
        };
      })
    };

    // Atualizar states
    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    
    // Atualizar a tarefa selecionada
    const updatedList = updatedProject.lists.find(list => list.id === selectedTask.listId);
    if (updatedList) {
      const updatedTask = updatedList.tasks.find(task => task.id === selectedTask.task.id);
      if (updatedTask) {
        setSelectedTask({task: updatedTask, listId: selectedTask.listId});
      }
    }
  };

  const addChecklistItem = (text: string) => {
    if (!selectedTask || !selectedProject || !text.trim()) return;
    
    const newItem: ChecklistItem = {
      id: `cl-${Date.now()}`,
      text: text.trim(),
      completed: false
    };
    
    const updatedProject = {
      ...selectedProject,
      lists: selectedProject.lists.map(list => {
        if (list.id !== selectedTask.listId) return list;
        
        return {
          ...list,
          tasks: list.tasks.map(task => {
            if (task.id !== selectedTask.task.id) return task;
            
            return {
              ...task,
              checklist: [...(task.checklist || []), newItem]
            };
          })
        };
      })
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    
    // Atualizar a tarefa selecionada
    const updatedList = updatedProject.lists.find(list => list.id === selectedTask.listId);
    if (updatedList) {
      const updatedTask = updatedList.tasks.find(task => task.id === selectedTask.task.id);
      if (updatedTask) {
        setSelectedTask({task: updatedTask, listId: selectedTask.listId});
      }
    }
    
    toast.success("Item adicionado à lista de verificação");
  };

  const deleteChecklistItem = (itemId: string) => {
    if (!selectedTask || !selectedProject) return;
    
    const updatedProject = {
      ...selectedProject,
      lists: selectedProject.lists.map(list => {
        if (list.id !== selectedTask.listId) return list;
        
        return {
          ...list,
          tasks: list.tasks.map(task => {
            if (task.id !== selectedTask.task.id) return task;
            
            return {
              ...task,
              checklist: (task.checklist || []).filter(item => item.id !== itemId)
            };
          })
        };
      })
    };

    setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    
    // Atualizar a tarefa selecionada
    const updatedList = updatedProject.lists.find(list => list.id === selectedTask.listId);
    if (updatedList) {
      const updatedTask = updatedList.tasks.find(task => task.id === selectedTask.task.id);
      if (updatedTask) {
        setSelectedTask({task: updatedTask, listId: selectedTask.listId});
      }
    }
    
    toast.success("Item removido da lista de verificação");
  };

  // Funções utilitárias
  const openTaskDetail = (task: Task, listId: string) => {
    setSelectedTask({task, listId});
    setTaskDetailOpen(true);
  };

  // Renderização condicional da interface principal
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
              </div>
              <p className="text-muted-foreground">{selectedProject.description}</p>
            </div>
            <div className="flex items-center gap-2">
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
                <BoardView 
                  lists={selectedProject.lists}
                  onToggleTaskStatus={toggleTaskStatus}
                  onTaskClick={openTaskDetail}
                  onAddTask={(listId) => {
                    setSelectedListId(listId);
                    setNewTaskDialogOpen(true);
                  }}
                  onEditList={(list) => {
                    setEditingList(list);
                    setEditListDialogOpen(true);
                  }}
                  onDeleteList={deleteList}
                  onAddList={() => setNewListDialogOpen(true)}
                />
              </TabsContent>
              <TabsContent value="list">
                <TaskListView 
                  lists={selectedProject.lists}
                  onToggleTaskStatus={toggleTaskStatus}
                  onTaskClick={openTaskDetail}
                />
              </TabsContent>
              <TabsContent value="files">
                <div className="text-center p-8 text-muted-foreground">
                  Funcionalidade de arquivos carregará aqui
                </div>
              </TabsContent>
              <TabsContent value="calendar">
                <div className="text-center p-8 text-muted-foreground">
                  Funcionalidade de calendário carregará aqui
                </div>
              </TabsContent>
              <TabsContent value="finance">
                <div className="text-center p-8 text-muted-foreground">
                  Funcionalidade financeira carregará aqui
                </div>
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

      {/* Conteúdo principal */}
      {viewMode === "list" ? (
        <ProjectsListView 
          projects={projects}
          onViewDetails={(project) => {
            setSelectedProject(project);
            setViewMode("detail");
          }}
          onNewProject={() => setNewProjectDialogOpen(true)}
        />
      ) : (
        renderProjectDetail()
      )}
      
      {/* Diálogos */}
      <NewProjectDialog 
        open={newProjectDialogOpen}
        onOpenChange={setNewProjectDialogOpen}
        onSave={handleCreateProject}
      />
      
      <NewListDialog
        open={newListDialogOpen}
        onOpenChange={setNewListDialogOpen}
        onSave={handleCreateList}
      />
      
      <EditListDialog
        open={editListDialogOpen}
        onOpenChange={setEditListDialogOpen}
        list={editingList}
        onSave={handleEditList}
      />
      
      <NewTaskDialog
        open={newTaskDialogOpen}
        onOpenChange={setNewTaskDialogOpen}
        members={selectedProject?.members || []}
        onAddTask={handleCreateTask}
      />
      
      <TaskDetailDialog
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        task={selectedTask?.task || null}
        listId={selectedTask?.listId || null}
        lists={selectedProject?.lists || []}
        onToggleTaskStatus={toggleTaskStatus}
        onToggleChecklistItem={toggleChecklistItem}
        onAddChecklistItem={addChecklistItem}
        onDeleteChecklistItem={deleteChecklistItem}
      />
    </div>
  );
};

export default Projects;
