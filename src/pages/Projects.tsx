import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X, Users, Kanban, ClipboardList, File, DollarSign, Calendar as CalendarIcon2, LayoutGrid, Filter, Settings, MoreVertical, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sanitizeHtml } from "@/lib/sanitize";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
import { projectsService, Project as ApiProject, ProjectList as ApiProjectList, ProjectTask as ApiProjectTask } from "@/services/projects";
import { membersService } from "@/services/members";

// Add import for ProjectFinance
import { ProjectFinance } from "@/components/projects/ProjectFinance";
import { ProjectSettingsDialog } from "@/components/projects/ProjectSettingsDialog";
import { SaveAsTemplateDialog } from "@/components/projects/SaveAsTemplateDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Padrão de página única para toda a funcionalidade de projetos
const Projects = () => {
  // Estados principais
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState("board");
  const [projectsViewType, setProjectsViewType] = useState<"grid" | "kanban">("grid");
  const [kanbanStages, setKanbanStages] = useState<ProjectList[]>([
    { id: "backlog", name: "Backlog", tasks: [], order: 0 },
    { id: "in-progress", name: "Em Andamento", tasks: [], order: 1 },
    { id: "review", name: "Revisão", tasks: [], order: 2 },
    { id: "done", name: "Concluído", tasks: [], order: 3 },
  ]);
  const [hideCompletedTasks, setHideCompletedTasks] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});

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
  const [editingTask, setEditingTask] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  // Carregar membros do backend
  useEffect(() => {
    const loadMembers = async () => {
      try {
        const membersData = await membersService.getMembers();
        setMembers(membersData);
      } catch (error) {
        console.error('Erro ao carregar membros:', error);
        // Continuar mesmo se falhar, usando array vazio
        setMembers([]);
      }
    };

    loadMembers();
  }, []);

  // Carregar projetos do backend
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true);
        const apiProjects = await projectsService.getProjects();
        
        // Converter projetos da API para o formato do frontend
        const convertedProjects: Project[] = apiProjects.map(apiProject => ({
          id: apiProject.id,
          name: apiProject.name,
          description: apiProject.description || "",
          status: apiProject.status,
          dueDate: apiProject.due_date || undefined,
          members: [], // Será carregado separadamente se necessário
          tags: apiProject.tags || [],
          lists: [], // Será carregado quando o projeto for selecionado
          files: [],
          financeItems: [],
          kanbanStage: apiProject.kanban_stage || "backlog"
        }));
        
        setProjects(convertedProjects);
      } catch (error) {
        console.error('Erro ao carregar projetos:', error);
        toast.error('Erro ao carregar projetos');
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, []);

  // Carregar listas e tarefas quando um projeto é selecionado
  useEffect(() => {
    const loadProjectDetails = async () => {
      if (!selectedProject) return;
      
      // Verificar se já tem listas carregadas (evitar recarregar desnecessariamente)
      const projectFromState = projects.find(p => p.id === selectedProject.id);
      if (projectFromState && projectFromState.lists.length > 0) {
        // Se o projeto já tem listas no estado, usar essas
        if (selectedProject.lists.length === 0) {
          setSelectedProject(projectFromState);
        }
        return;
      }

      try {
        // Carregar listas do projeto
        const apiLists = await projectsService.getProjectLists(selectedProject.id);
        
        // Carregar tarefas para cada lista
        const listsWithTasks = await Promise.all(
          apiLists.map(async (apiList) => {
            const apiTasks = await projectsService.getProjectTasks(apiList.id);
            
            // Converter tarefas da API para o formato do frontend
            const tasks: Task[] = apiTasks.map(apiTask => ({
              id: apiTask.id,
              title: apiTask.title,
              description: apiTask.description || "",
              status: apiTask.status as TaskStatus,
              priority: apiTask.priority as any,
              dueDate: apiTask.due_date || undefined,
              assignee: apiTask.assignee_id ? members.find(m => m.id === apiTask.assignee_id) : undefined,
              tags: apiTask.tags || [],
              checklist: (apiTask.checklist || []).map((item: any, index: number) => ({
                id: item.id || `checklist-${index}`,
                text: item.text || item.title || "",
                completed: item.completed || false
              }))
            }));

            return {
              id: apiList.id,
              name: apiList.name,
              tasks,
              order: apiList.order_position
            };
          })
        );

        // Atualizar projeto selecionado com listas e tarefas
        setSelectedProject({
          ...selectedProject,
          lists: listsWithTasks
        });
      } catch (error) {
        console.error('Erro ao carregar detalhes do projeto:', error);
        toast.error('Erro ao carregar detalhes do projeto');
      }
    };

    loadProjectDetails();
  }, [selectedProject?.id]);

  // Funções para gestão de projetos
  const handleCreateProject = async (event: React.FormEvent, data: ProjectFormData) => {
    event.preventDefault();
    
    try {
      // Criar projeto no backend
      const apiProject = await projectsService.createProject({
        name: data.name,
        description: data.description || null,
        status: "active",
        due_date: data.dueDate ? format(data.dueDate, 'yyyy-MM-dd') : null,
        tags: data.tags || [],
        kanban_stage: 'backlog'
      });

      // Criar listas padrão
      const defaultLists = [
        { name: "A Fazer", order_position: 0 },
        { name: "Em Andamento", order_position: 1 },
        { name: "Revisão", order_position: 2 },
        { name: "Concluídos", order_position: 3 },
      ];

      const createdLists = await Promise.all(
        defaultLists.map(list => 
          projectsService.createProjectList(apiProject.id, list)
        )
      );

      // Converter para formato do frontend
      const newProject: Project = {
        id: apiProject.id,
        name: apiProject.name,
        description: apiProject.description || "",
        status: apiProject.status,
        dueDate: apiProject.due_date || undefined,
        members: data.members,
        tags: apiProject.tags || [],
        lists: createdLists.map(list => ({
          id: list.id,
          name: list.name,
          tasks: [],
          order: list.order_position
        })),
        files: data.files.map((file, index) => ({
          id: `f-${Date.now()}-${index}`,
          name: file.name,
          type: file.type,
          size: `${(file.size / 1024).toFixed(1)} KB`,
          uploadedBy: members[0] || undefined,
          uploadedAt: new Date().toISOString(),
          url: URL.createObjectURL(file)
        })),
        financeItems: [],
        kanbanStage: apiProject.kanban_stage || 'backlog'
      };

      setProjects([...projects, newProject]);
      setSelectedProject(newProject);
      setViewMode("detail");
      setNewProjectDialogOpen(false);
      toast.success("Projeto criado com sucesso!");
    } catch (error) {
      console.error('Erro ao criar projeto:', error);
      toast.error('Erro ao criar projeto');
    }
  };

  // Funções para gestão de listas e etapas do kanban
  const handleCreateList = async (event: React.FormEvent) => {
    event.preventDefault();
    
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const listName = formData.get('listName') as string;

    if (viewMode === "detail" && selectedProject) {
      try {
        const highestOrder = Math.max(...selectedProject.lists.map(list => list.order), -1);
        
        const apiList = await projectsService.createProjectList(selectedProject.id, {
          name: listName,
          order_position: highestOrder + 1
        });

        const newList: ProjectList = {
          id: apiList.id,
          name: apiList.name,
          tasks: [],
          order: apiList.order_position
        };

        const updatedProject = {
          ...selectedProject,
          lists: [...selectedProject.lists, newList]
        };

        setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
        setSelectedProject(updatedProject);
        setNewListDialogOpen(false);
        toast.success("Etapa criada com sucesso!");
      } catch (error) {
        console.error('Erro ao criar lista:', error);
        toast.error('Erro ao criar lista');
      }
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
      setNewListDialogOpen(false);
      toast.success("Etapa criada com sucesso!");
    }
  };

  const handleEditList = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingList) return;

    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const listName = formData.get('listName') as string;

    if (viewMode === "detail" && selectedProject) {
      try {
        await projectsService.updateProjectList(editingList.id, {
          name: listName
        });

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
        toast.success("Etapa atualizada com sucesso!");
      } catch (error) {
        console.error('Erro ao atualizar lista:', error);
        toast.error('Erro ao atualizar lista');
      }
    } else {
      // Update stage in kanban board
      setKanbanStages(kanbanStages.map(stage => 
        stage.id === editingList.id 
          ? { ...stage, name: listName }
          : stage
      ));
      setEditListDialogOpen(false);
      setEditingList(null);
      toast.success("Etapa atualizada com sucesso!");
    }
  };

  const deleteList = async (listId: string) => {
    if (viewMode === "detail" && selectedProject) {
      // Não excluir se a lista contém tarefas
      const listToDelete = selectedProject.lists.find(list => list.id === listId);
      if (listToDelete && listToDelete.tasks.length > 0) {
        toast.error("Não é possível excluir uma etapa que contém tarefas");
        return;
      }

      try {
        await projectsService.deleteProjectList(listId);

        const updatedProject = {
          ...selectedProject,
          lists: selectedProject.lists.filter(list => list.id !== listId)
        };

        setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
        setSelectedProject(updatedProject);
        toast.success("Etapa removida com sucesso!");
      } catch (error) {
        console.error('Erro ao deletar lista:', error);
        toast.error('Erro ao deletar lista');
      }
    } else {
      // Delete stage from kanban board when in list view
      // Only if it doesn't have projects
      if (projects.some(p => p.id === listId)) {
        toast.error("Não é possível excluir uma etapa que contém projetos");
        return;
      }
      
      setKanbanStages(kanbanStages.filter(stage => stage.id !== listId));
      toast.success("Etapa removida com sucesso!");
    }
  };

  // Mover projeto entre etapas no kanban
  const moveProject = async (projectId: string, newStageId: string) => {
    const projectToMove = projects.find(p => p.id === projectId);
    if (!projectToMove) return;

    try {
      // Atualizar no backend
      await projectsService.updateProject(projectId, {
        kanban_stage: newStageId
      });

      // Update the project with the new stage id
      const updatedProjects = projects.map(p => 
        p.id === projectId ? { ...p, kanbanStage: newStageId } : p
      );
      
      setProjects(updatedProjects);
      toast.success(`Projeto movido para ${kanbanStages.find(s => s.id === newStageId)?.name}`);
    } catch (error) {
      console.error('Erro ao mover projeto:', error);
      toast.error('Erro ao mover projeto');
    }
  };

  // Funções para gestão de tarefas
  const handleCreateTask = async (formData: FormData) => {
    if (!selectedProject || !selectedListId) return;
    
    try {
      // Obter dados do formulário
      const title = formData.get('title') as string;
      const description = formData.get('description') as string;
      const priority = (formData.get('priority') as string) || "medium";
      const dueDate = formData.get('dueDate') as string;
      const assigneeId = formData.get('assignee') as string;
      const tagsJson = formData.get('tags') as string;
      const tags = tagsJson ? JSON.parse(tagsJson) : [];
      
      // Criar tarefa no backend
      const apiTask = await projectsService.createProjectTask(selectedListId, {
        title,
        description: description || null,
        status: "todo",
        priority,
        due_date: dueDate || null,
        assignee_id: assigneeId || null,
        tags: tags || [],
        checklist: []
      });
      
      // Encontrar o membro selecionado
      let assignee;
      if (assigneeId) {
        assignee = members.find(m => m.id === assigneeId);
      }
      
      // Converter para formato do frontend
      const newTask: Task = {
        id: apiTask.id,
        title: apiTask.title,
        description: apiTask.description || "",
        status: apiTask.status as TaskStatus,
        priority: apiTask.priority as any,
        dueDate: apiTask.due_date || undefined,
        assignee,
        tags: apiTask.tags || [],
        checklist: (apiTask.checklist || []).map((item: any, index: number) => ({
          id: item.id || `checklist-${index}`,
          text: item.text || item.title || "",
          completed: item.completed || false
        }))
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
    } catch (error) {
      console.error('Erro ao criar tarefa:', error);
      toast.error('Erro ao criar tarefa');
    }
  };

  // Move task between lists
  const moveTask = async (taskId: string, sourceListId: string, targetListId: string) => {
    if (!selectedProject) return;
    
    try {
      // Get task from source list
      const sourceList = selectedProject.lists.find(list => list.id === sourceListId);
      if (!sourceList) return;
      
      const taskToMove = sourceList.tasks.find(task => task.id === taskId);
      if (!taskToMove) return;
      
      // Update the task status based on target list
      const targetList = selectedProject.lists.find(list => list.id === targetListId);
      if (!targetList) return;
      
      // Map list IDs to task statuses
      let newStatus: TaskStatus = taskToMove.status;
      
      // Find the target list's name or position to determine appropriate status
      const targetListName = targetList.name.toLowerCase();
      if (targetListName.includes("concluído") || targetListName.includes("done") || targetListName.includes("completed")) {
        newStatus = "completed";
      } else if (targetListName.includes("revisão") || targetListName.includes("review")) {
        newStatus = "review";
      } else if (targetListName.includes("andamento") || targetListName.includes("progress")) {
        newStatus = "in-progress";
      } else if (targetListName.includes("fazer") || targetListName.includes("todo")) {
        newStatus = "todo";
      }
      
      // Atualizar tarefa no backend
      await projectsService.updateProjectTask(taskId, {
        status: newStatus,
        // Atualizar list_id seria ideal, mas a API atual não suporta isso diretamente
        // Por enquanto, apenas atualizamos o status
      });
      
      const updatedTask = { ...taskToMove, status: newStatus };
      
      // Create updated project
      const updatedProject = {
      ...selectedProject,
      lists: selectedProject.lists.map(list => {
        if (list.id === sourceListId) {
          return {
            ...list,
            tasks: list.tasks.filter(task => task.id !== taskId)
          };
        } else if (list.id === targetListId) {
          return {
            ...list,
            tasks: [...list.tasks, updatedTask]
          };
        }
        return list;
      })
    };
    
      // Update state
      setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
      setSelectedProject(updatedProject);
      
      toast.success(`Tarefa movida para ${targetList.name}`);
    } catch (error) {
      console.error('Erro ao mover tarefa:', error);
      toast.error('Erro ao mover tarefa');
    }
  };

  const toggleTaskStatus = async (listId: string, taskId: string) => {
    if (!selectedProject) return;
    
    try {
      const task = selectedProject.lists
        .find(list => list.id === listId)
        ?.tasks.find(t => t.id === taskId);
      
      if (!task) return;
      
      const newStatus: TaskStatus = task.status === "completed" ? "todo" : "completed";
      
      // Atualizar no backend
      await projectsService.updateProjectTask(taskId, {
        status: newStatus
      });
      
      const updatedProject = {
        ...selectedProject,
        lists: selectedProject.lists.map(list => {
          if (list.id !== listId) return list;
          
          return {
            ...list,
            tasks: list.tasks.map(t => {
              if (t.id !== taskId) return t;
              
              if (newStatus === "completed") {
                toast.success("Tarefa concluída!");
              }
              
              return {
                ...t,
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
          const updatedTask = updatedList.tasks.find(t => t.id === taskId);
          if (updatedTask) {
            setSelectedTask({task: updatedTask, listId});
          }
        }
      }
    } catch (error) {
      console.error('Erro ao atualizar status da tarefa:', error);
      toast.error('Erro ao atualizar status da tarefa');
    }
  };

  const deleteTask = async (listId: string, taskId: string) => {
    if (!selectedProject) return;
    
    try {
      await projectsService.deleteProjectTask(taskId);
      
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
    } catch (error) {
      console.error('Erro ao deletar tarefa:', error);
      toast.error('Erro ao deletar tarefa');
    }
  };

  // Função para atualizar uma tarefa existente
  const updateTask = async (listId: string, taskId: string, updatedTaskData: Partial<Task>) => {
    if (!selectedProject) return;
    
    try {
      // Preparar dados para atualização no backend
      const updateData: any = {};
      if (updatedTaskData.title !== undefined) updateData.title = updatedTaskData.title;
      if (updatedTaskData.description !== undefined) updateData.description = updatedTaskData.description;
      if (updatedTaskData.status !== undefined) updateData.status = updatedTaskData.status;
      if (updatedTaskData.priority !== undefined) updateData.priority = updatedTaskData.priority;
      if (updatedTaskData.dueDate !== undefined) updateData.due_date = updatedTaskData.dueDate || null;
      if (updatedTaskData.assignee !== undefined) updateData.assignee_id = updatedTaskData.assignee?.id || null;
      if (updatedTaskData.tags !== undefined) updateData.tags = updatedTaskData.tags;
      if (updatedTaskData.checklist !== undefined) {
        updateData.checklist = updatedTaskData.checklist.map(item => ({
          id: item.id,
          text: item.text,
          completed: item.completed
        }));
      }
      
      // Atualizar no backend
      await projectsService.updateProjectTask(taskId, updateData);
      
      const updatedProject = {
        ...selectedProject,
        lists: selectedProject.lists.map(list => {
          if (list.id !== listId) return list;
          
          return {
            ...list,
            tasks: list.tasks.map(task => {
              if (task.id !== taskId) return task;
              
              return {
                ...task,
                ...updatedTaskData
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
      
      toast.success("Tarefa atualizada com sucesso!");
    } catch (error) {
      console.error('Erro ao atualizar tarefa:', error);
      toast.error('Erro ao atualizar tarefa');
    }
  };

  // Funções para gestão do checklist
  const toggleChecklistItem = async (itemId: string) => {
    if (!selectedTask || !selectedProject) return;
    
    try {
      const task = selectedTask.task;
      const updatedChecklist = (task.checklist || []).map(item => 
        item.id === itemId ? { ...item, completed: !item.completed } : item
      );
      
      // Verificar se todos os itens estão completos
      const allCompleted = updatedChecklist.length > 0 && updatedChecklist.every(item => item.completed);
      const newStatus: TaskStatus = allCompleted ? "completed" : task.status;
      
      // Atualizar no backend
      await projectsService.updateProjectTask(task.id, {
        checklist: updatedChecklist.map(item => ({
          id: item.id,
          text: item.text,
          completed: item.completed
        })),
        status: newStatus
      });
      
      const updatedProject = {
        ...selectedProject,
        lists: selectedProject.lists.map(list => {
          if (list.id !== selectedTask.listId) return list;
          
          return {
            ...list,
            tasks: list.tasks.map(t => {
              if (t.id !== task.id) return t;
              
              if (allCompleted && t.status !== "completed") {
                toast.success("Todas as tarefas concluídas!");
              }
              
              return {
                ...t,
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
        const updatedTask = updatedList.tasks.find(t => t.id === task.id);
        if (updatedTask) {
          setSelectedTask({task: updatedTask, listId: selectedTask.listId});
        }
      }
    } catch (error) {
      console.error('Erro ao atualizar checklist:', error);
      toast.error('Erro ao atualizar checklist');
    }
  };

  const addChecklistItem = async (text: string) => {
    if (!selectedTask || !selectedProject || !text.trim()) return;
    
    try {
      const task = selectedTask.task;
      const newItem: ChecklistItem = {
        id: `cl-${Date.now()}`,
        text: text.trim(),
        completed: false
      };
      
      const updatedChecklist = [...(task.checklist || []), newItem];
      
      // Atualizar no backend
      await projectsService.updateProjectTask(task.id, {
        checklist: updatedChecklist.map(item => ({
          id: item.id,
          text: item.text,
          completed: item.completed
        }))
      });
      
      const updatedProject = {
        ...selectedProject,
        lists: selectedProject.lists.map(list => {
          if (list.id !== selectedTask.listId) return list;
          
          return {
            ...list,
            tasks: list.tasks.map(t => {
              if (t.id !== task.id) return t;
              
              return {
                ...t,
                checklist: updatedChecklist
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
        const updatedTask = updatedList.tasks.find(t => t.id === task.id);
        if (updatedTask) {
          setSelectedTask({task: updatedTask, listId: selectedTask.listId});
        }
      }
      
      toast.success("Item adicionado à lista de verificação");
    } catch (error) {
      console.error('Erro ao adicionar item ao checklist:', error);
      toast.error('Erro ao adicionar item ao checklist');
    }
  };

  const deleteChecklistItem = async (itemId: string) => {
    if (!selectedTask || !selectedProject) return;
    
    try {
      const task = selectedTask.task;
      const updatedChecklist = (task.checklist || []).filter(item => item.id !== itemId);
      
      // Atualizar no backend
      await projectsService.updateProjectTask(task.id, {
        checklist: updatedChecklist.map(item => ({
          id: item.id,
          text: item.text,
          completed: item.completed
        }))
      });
      
      const updatedProject = {
        ...selectedProject,
        lists: selectedProject.lists.map(list => {
          if (list.id !== selectedTask.listId) return list;
          
          return {
            ...list,
            tasks: list.tasks.map(t => {
              if (t.id !== task.id) return t;
              
              return {
                ...t,
                checklist: updatedChecklist
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
        const updatedTask = updatedList.tasks.find(t => t.id === task.id);
        if (updatedTask) {
          setSelectedTask({task: updatedTask, listId: selectedTask.listId});
        }
      }
      
      toast.success("Item removido da lista de verificação");
    } catch (error) {
      console.error('Erro ao remover item do checklist:', error);
      toast.error('Erro ao remover item do checklist');
    }
  };

  // Funções utilitárias
  const openTaskDetail = (task: Task, listId: string) => {
    setSelectedTask({task, listId});
    setEditingTask(false);
    setTaskDetailOpen(true);
  };

  // Add function to update project
  const handleUpdateProject = (updatedProject: Project) => {
    const newProjects = projects.map(p => 
      p.id === updatedProject.id ? updatedProject : p
    );
    setProjects(newProjects);
    setSelectedProject(updatedProject);
  };

  // Filtrar tarefas concluídas se a opção estiver habilitada
  const getFilteredLists = (lists: ProjectList[]) => {
    if (!hideCompletedTasks) return lists;
    
    return lists.map(list => ({
      ...list,
      tasks: list.tasks.filter(task => task.status !== "completed")
    }));
  };

  // Função auxiliar para verificar se o texto precisa ser truncado
  const needsTruncation = (text: string): boolean => {
    if (!text) return false;
    // Remove HTML tags para contar caracteres reais
    const textWithoutHtml = text.replace(/<[^>]*>/g, '');
    return textWithoutHtml.length > 100;
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

    // Filtrar listas conforme necessário
    const filteredLists = getFilteredLists(selectedProject.lists);

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
              {selectedProject.description && (
                <div className="mt-2">
                  <div 
                    className={`text-sm text-muted-foreground ${
                      expandedDescriptions[selectedProject.id] 
                        ? '' 
                        : 'line-clamp-2'
                    }`}
                    style={!expandedDescriptions[selectedProject.id] ? {
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      wordBreak: 'break-word',
                    } : {
                      wordBreak: 'break-word',
                    }}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedProject.description) }} 
                  />
                  {selectedProject.description && needsTruncation(selectedProject.description) && (
                    <button
                      type="button"
                      className="mt-1 inline-flex items-center text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer bg-transparent border-0 p-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const newState = !expandedDescriptions[selectedProject.id];
                        setExpandedDescriptions(prev => ({
                          ...prev,
                          [selectedProject.id]: newState
                        }));
                      }}
                    >
                      {expandedDescriptions[selectedProject.id] ? (
                        <>
                          <ChevronUp className="h-3 w-3 mr-1" />
                          Ler menos
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3 mr-1" />
                          Ler mais
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSaveAsTemplateOpen(true)}>
                    <File className="h-4 w-4 mr-2" />
                    Salvar como Modelo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="secondary" onClick={() => setProjectSettingsOpen(true)}>
                <Settings className="h-4 w-4 mr-1" />
                Configurações do Projeto
              </Button>
            </div>
          </div>
        
          <div className="mb-4 flex items-center">
            <div className="flex items-center space-x-2">
              <Switch 
                id="hide-completed" 
                checked={hideCompletedTasks}
                onCheckedChange={setHideCompletedTasks}
              />
              <Label htmlFor="hide-completed">Ocultar tarefas concluídas</Label>
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
                  lists={filteredLists}
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
                  onMoveTask={moveTask}
                />
              </TabsContent>
              
              <TabsContent value="list">
                <TaskListView 
                  lists={filteredLists}
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
                <ProjectFinance 
                  project={selectedProject} 
                  onUpdateProject={handleUpdateProject} 
                />
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
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Carregando projetos...</p>
        </div>
      ) : viewMode === "list" ? (
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
        availableMembers={members}
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
        members={members}
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
        editMode={editingTask}
        setEditMode={setEditingTask}
        onUpdateTask={updateTask}
      />
      
      {selectedProject && (
        <>
          <ProjectSettingsDialog
            open={projectSettingsOpen}
            onOpenChange={setProjectSettingsOpen}
            project={selectedProject}
            members={members}
            onSave={(updatedProject) => {
              setProjects(projects.map(p => 
                p.id === selectedProject.id 
                  ? { ...p, ...updatedProject }
                  : p
              ));
              setSelectedProject({ ...selectedProject, ...updatedProject } as Project);
            }}
          />
          
          <SaveAsTemplateDialog
            open={saveAsTemplateOpen}
            onOpenChange={setSaveAsTemplateOpen}
            project={selectedProject}
          />
        </>
      )}
    </div>
  );
};

export default Projects;
