
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X, Users, Kanban, ClipboardList, File, DollarSign, Calendar as CalendarIcon2, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// Importações de componentes
import { ProjectsListView } from "@/components/projects/ProjectsListView";
import { BoardView } from "@/components/projects/BoardView";
import { TaskListView } from "@/components/projects/TaskListView";
import { CalendarView } from "@/components/projects/CalendarView";
import { TaskDetailDialog } from "@/components/projects/TaskDetailDialog";
import { NewTaskDialog } from "@/components/projects/NewTaskDialog";
import { NewListDialog } from "@/components/projects/NewListDialog";
import { EditListDialog } from "@/components/projects/EditListDialog";
import { NewProjectDialog, ProjectFormData } from "@/components/projects/NewProjectDialog";

// Importações de tipos e dados
import { Project, ProjectList, Task, ChecklistItem, TaskStatus } from "@/components/projects/types";
import { Member } from "@/components/shared/types";
import { mockMembers, initialProjects } from "@/components/projects/mockData";

// Padrão de página única para toda a funcionalidade de projetos
const Projects = () => {
  // Estados principais
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [projects, setProjects] = useState<Project[]>(() => {
    // Initialize projects with kanbanStage
    return initialProjects.map(project => ({
      ...project,
      kanbanStage: "backlog" // Default all projects to backlog stage initially
    }));
  });
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState("board");
  const [projectsViewType, setProjectsViewType] = useState<"grid" | "kanban">("grid");
  const [kanbanStages, setKanbanStages] = useState<ProjectList[]>([
    { id: "backlog", name: "Backlog", tasks: [], order: 0 },
    { id: "in-progress", name: "Em Andamento", tasks: [], order: 1 },
    { id: "review", name: "Revisão", tasks: [], order: 2 },
    { id: "done", name: "Concluído", tasks: [], order: 3 },
  ]);

  // Estados de diálogos
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [editListDialogOpen, setEditListDialogOpen] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<ProjectList | null>(null);
  const [selectedTask, setSelectedTask] = useState<{task: Task, listId: string} | null>(null);
  const [newChecklistItemText, setNewChecklistItemText] = useState("");
  const [newTagText, setNewTagText] = useState("");
  const [tagsInput, setTagsInput] = useState<string[]>([]);

  // Funções para gestão de projetos
  const handleCreateProject = (event: React.FormEvent, data: ProjectFormData) => {
    event.preventDefault();
    
    // Criar o novo projeto com os dados do formulário
    const newProject: Project = {
      id: `p${projects.length + 1}`,
      name: data.name,
      description: data.description,
      status: "active",
      dueDate: data.dueDate ? format(data.dueDate, 'yyyy-MM-dd') : undefined,
      members: data.members,
      tags: data.tags,
      lists: [
        { id: `l-${Date.now()}-1`, name: "A Fazer", tasks: [], order: 0 },
        { id: `l-${Date.now()}-2`, name: "Em Andamento", tasks: [], order: 1 },
        { id: `l-${Date.now()}-3`, name: "Revisão", tasks: [], order: 2 },
        { id: `l-${Date.now()}-4`, name: "Concluídos", tasks: [], order: 3 },
      ],
      files: data.files.map((file, index) => ({
        id: `f-${Date.now()}-${index}`,
        name: file.name,
        type: file.type,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        uploadedBy: mockMembers[0], // Usuário atual
        uploadedAt: new Date().toISOString(),
        url: URL.createObjectURL(file) // Url temporária
      })),
      financeItems: [],
      kanbanStage: 'backlog' // Default to backlog stage
    };

    setProjects([...projects, newProject]);
    setSelectedProject(newProject);
    setViewMode("detail");
    setNewProjectDialogOpen(false);
    toast.success("Projeto criado com sucesso!");
  };

  // Funções para gestão de listas e etapas do kanban
  const handleCreateList = (event: React.FormEvent) => {
    event.preventDefault();
    
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const listName = formData.get('listName') as string;

    if (viewMode === "detail" && selectedProject) {
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
    } else {
      // Add stage to kanban board when in list view
      const highestOrder = Math.max(...kanbanStages.map(list => list.order));
      
      const newStage: ProjectList = {
        id: `stage-${Date.now()}`,
        name: listName,
        tasks: [],
        order: highestOrder + 1
      };

      setKanbanStages([...kanbanStages, newStage]);
    }
    
    setNewListDialogOpen(false);
    toast.success("Etapa criada com sucesso!");
  };

  const handleEditList = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingList) return;

    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const listName = formData.get('listName') as string;

    if (viewMode === "detail" && selectedProject) {
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
    } else {
      // Update stage in kanban board
      setKanbanStages(kanbanStages.map(stage => 
        stage.id === editingList.id 
          ? { ...stage, name: listName }
          : stage
      ));
    }

    setEditListDialogOpen(false);
    setEditingList(null);
    toast.success("Etapa atualizada com sucesso!");
  };

  const deleteList = (listId: string) => {
    if (viewMode === "detail" && selectedProject) {
      // Não excluir se a lista contém tarefas
      const listToDelete = selectedProject.lists.find(list => list.id === listId);
      if (listToDelete && listToDelete.tasks.length > 0) {
        toast.error("Não é possível excluir uma etapa que contém tarefas");
        return;
      }

      const updatedProject = {
        ...selectedProject,
        lists: selectedProject.lists.filter(list => list.id !== listId)
      };

      setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
      setSelectedProject(updatedProject);
    } else {
      // Delete stage from kanban board when in list view
      // Only if it doesn't have projects
      if (projects.some(p => p.id === listId)) {
        toast.error("Não é possível excluir uma etapa que contém projetos");
        return;
      }
      
      setKanbanStages(kanbanStages.filter(stage => stage.id !== listId));
    }

    toast.success("Etapa removida com sucesso!");
  };

  // Mover projeto entre etapas no kanban
  const moveProject = (projectId: string, newStageId: string) => {
    const projectToMove = projects.find(p => p.id === projectId);
    if (!projectToMove) return;

    // Update the project with the new stage id
    const updatedProjects = projects.map(p => 
      p.id === projectId ? { ...p, kanbanStage: newStageId } : p
    );
    
    setProjects(updatedProjects);
    toast.success(`Projeto movido para ${kanbanStages.find(s => s.id === newStageId)?.name}`);
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
    
    // Criar nova tarefa - Garantir que status seja um valor válido de TaskStatus
    const newTask: Task = {
      id: `t-${Date.now()}`,
      title,
      description,
      status: "todo" as TaskStatus, // Corrigido: usando um valor literal do tipo TaskStatus
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
            
            // Corrigido: Usando valores corretos de TaskStatus
            const newStatus: TaskStatus = task.status === "completed" ? "todo" : "completed";
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
            
            // Corrigido: Usando valores corretos de TaskStatus
            const newStatus: TaskStatus = allCompleted ? "completed" : task.status;
            
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
              <div className="flex flex-wrap gap-2 mt-1">
                {selectedProject.tags && selectedProject.tags.map(tag => (
                  <span key={tag} className="text-xs bg-muted px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-2" dangerouslySetInnerHTML={{ __html: selectedProject.description }} />
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
                {selectedProject.files && selectedProject.files.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedProject.files.map(file => (
                      <div key={file.id} className="border rounded-md p-4 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-medium">{file.name}</h4>
                            <p className="text-xs text-muted-foreground">{file.size} • {file.type}</p>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Enviado por {file.uploadedBy?.name} em {new Date(file.uploadedAt).toLocaleDateString()}
                        </div>
                        <div className="mt-auto pt-2">
                          <Button variant="outline" size="sm" className="w-full" onClick={() => window.open(file.url, '_blank')}>
                            Visualizar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-8 text-muted-foreground">
                    Nenhum arquivo adicionado a este projeto
                  </div>
                )}
              </TabsContent>
              <TabsContent value="calendar">
                <CalendarView 
                  project={selectedProject}
                  onTaskClick={openTaskDetail}
                />
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
          <div className="flex items-center gap-2">
            <div className="border rounded-md p-0.5 flex">
              <Button 
                variant={projectsViewType === "grid" ? "default" : "ghost"} 
                size="sm" 
                onClick={() => setProjectsViewType("grid")}
                className="rounded-r-none"
              >
                <LayoutGrid className="h-4 w-4 mr-1" />
                Grade
              </Button>
              <Button 
                variant={projectsViewType === "kanban" ? "default" : "ghost"} 
                size="sm" 
                onClick={() => setProjectsViewType("kanban")}
                className="rounded-l-none"
              >
                <Kanban className="h-4 w-4 mr-1" />
                Kanban
              </Button>
            </div>
            <Button onClick={() => setNewProjectDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Projeto
            </Button>
          </div>
        )}
      </div>

      {/* Conteúdo principal */}
      {viewMode === "list" ? (
        projectsViewType === "grid" ? (
          <ProjectsListView 
            projects={projects}
            onViewDetails={(project) => {
              setSelectedProject(project);
              setViewMode("detail");
            }}
            onNewProject={() => setNewProjectDialogOpen(true)}
          />
        ) : (
          <BoardView 
            lists={kanbanStages}
            onToggleTaskStatus={() => {}}
            onTaskClick={() => {}}
            onAddTask={() => {}}
            onEditList={(list) => {
              setEditingList(list);
              setEditListDialogOpen(true);
            }}
            onDeleteList={deleteList}
            onAddList={() => setNewListDialogOpen(true)}
            isProjectView={true}
            projects={projects}
            onProjectClick={(project) => {
              setSelectedProject(project);
              setViewMode("detail");
            }}
            onAddProject={() => setNewProjectDialogOpen(true)}
            onMoveProject={moveProject}
          />
        )
      ) : (
        renderProjectDetail()
      )}
      
      {/* Diálogos */}
      <NewProjectDialog 
        open={newProjectDialogOpen}
        onOpenChange={setNewProjectDialogOpen}
        onSave={handleCreateProject}
        availableMembers={mockMembers}
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
        tagsInput={tagsInput}
        setTagsInput={setTagsInput}
        newTagText={newTagText}
        setNewTagText={setNewTagText}
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
        newChecklistItemText={newChecklistItemText}
        setNewChecklistItemText={setNewChecklistItemText}
      />
    </div>
  );
};

export default Projects;
