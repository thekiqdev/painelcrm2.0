import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X, Users, Kanban, ClipboardList, File, DollarSign, Calendar as CalendarIcon2, LayoutGrid, Filter, Settings, MoreVertical, ChevronDown, ChevronUp, Upload } from "lucide-react";
import { toast } from "@/components/ui/sonner";
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
import { TaskFormDialog } from "@/components/tasks";
import { NewListDialog } from "@/components/projects/NewListDialog";
import { EditListDialog } from "@/components/projects/EditListDialog";

// Importações de tipos e dados
import { Project, ProjectList, Task, ChecklistItem, TaskStatus } from "@/components/projects/types";
import { Member } from "@/components/shared/types";
import { projectsService, Project as ApiProject, ProjectList as ApiProjectList, ProjectTask as ApiProjectTask, type ProjectVersion } from "@/services/projects";
import { membersService } from "@/services/members";
import { teamsService, type Team } from "@/services/teams";

// Add import for ProjectFinance
import { ProjectFinance } from "@/components/projects/ProjectFinance";
import { ProjectSettingsDialog } from "@/components/projects/ProjectSettingsDialog";
import { SaveAsTemplateDialog } from "@/components/projects/SaveAsTemplateDialog";
import { ProjectAreasSection, AreaProgress } from "@/components/projects/ProjectAreasSection";
import { ProjectVersionDialog } from "@/components/projects/ProjectVersionDialog";
import { MoveProjectTaskDialog } from "@/components/projects/MoveProjectTaskDialog";
import { CopyProjectTaskDialog } from "@/components/projects/CopyProjectTaskDialog";
import { ProjectPublishVersionDialog } from "@/components/projects/ProjectPublishVersionDialog";
import { ProjectDuplicateVersionDialog } from "@/components/projects/ProjectDuplicateVersionDialog";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { ProjectVersionControlPanel } from "@/components/projects/ProjectVersionControlPanel";
import { ProjectDriveWorkspace } from "@/components/projects/ProjectDriveWorkspace";
import { hasAreas, hasVersions } from "@/lib/projectFeatures";
import {
  deriveInitialVersionSelection,
  versionSelectionToQuery,
  versionSelectionToTaskFilter,
  versionIdForTaskCreate,
  normalizeVersionSelection,
  type ProjectVersionSelection,
} from "@/lib/projectVersionSelection";
import { TaskSidePanel } from "@/components/tasks";
import type { UnifiedTask } from "@/lib/taskUnified";
import { projectUITaskToUnified } from "@/lib/taskUnified";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { clientsService } from "@/services/clients";
import { prepareProjectsFromCsv } from "@/utils/importProjectsCsv";
import {
  prepareTasksFromProjectTasksCsv,
  prepareTasksFromProjectTasksXlsx,
} from "@/utils/importProjectTasksXlsx";
import { getProjectUrl } from "@/lib/projectRoutes";

// Padrão de página única para toda a funcionalidade de projetos
const MODULE_PROJECTS = "projects";
const MODULE_TASKS = "tasks";

const PROJECTS_QUERY_KEY = ["projects"] as const;

const Projects = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId: routeProjectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const restoringFromUrlRef = useRef(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { canCreate: canCreateProject } = useModulePermissions();

  // Estados principais
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
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
  const [teamFilterSheetOpen, setTeamFilterSheetOpen] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const projectsCsvInputRef = useRef<HTMLInputElement>(null);
  const [projectsCsvImportRunning, setProjectsCsvImportRunning] = useState(false);
  const [projectsCsvImportDialogOpen, setProjectsCsvImportDialogOpen] = useState(false);
  const [projectsCsvImportSummary, setProjectsCsvImportSummary] = useState<{
    created: number;
    failed: { line: number; message: string }[];
    warnings: string[];
  } | null>(null);
  const tasksXlsxInputRef = useRef<HTMLInputElement>(null);
  const tasksImportListIdRef = useRef<string | null>(null);
  const [tasksXlsxImportRunning, setTasksXlsxImportRunning] = useState(false);
  const [tasksXlsxImportDialogOpen, setTasksXlsxImportDialogOpen] = useState(false);
  const [tasksXlsxImportSummary, setTasksXlsxImportSummary] = useState<{
    created: number;
    failed: { line: number; message: string }[];
    warnings: string[];
  } | null>(null);

  // Estados de diálogos
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [editListDialogOpen, setEditListDialogOpen] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<ProjectList | null>(null);
  const [selectedTask, setSelectedTask] = useState<{task: Task, listId: string} | null>(null);
  const [newChecklistItemText, setNewChecklistItemText] = useState("");
  const [editingTask, setEditingTask] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [areaProgress, setAreaProgress] = useState<Record<string, AreaProgress>>({});
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [fullViewTask, setFullViewTask] = useState<UnifiedTask | null>(null);
  const [projectVersions, setProjectVersions] = useState<ProjectVersion[]>([]);
  const [versionSelection, setVersionSelection] = useState<ProjectVersionSelection>({ mode: "none" });
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<ProjectVersion | null>(null);
  const [versionSaving, setVersionSaving] = useState(false);
  const [publishVersionOpen, setPublishVersionOpen] = useState(false);
  const [duplicateVersionOpen, setDuplicateVersionOpen] = useState(false);
  const [versionActionSaving, setVersionActionSaving] = useState(false);
  const [moveTaskDialogOpen, setMoveTaskDialogOpen] = useState(false);
  const [taskToMove, setTaskToMove] = useState<{
    taskId: string;
    listId: string;
    areaId: string | null;
    versionId: string | null;
  } | null>(null);
  const [moveTaskSaving, setMoveTaskSaving] = useState(false);
  const [copyTaskDialogOpen, setCopyTaskDialogOpen] = useState(false);
  const [taskToCopy, setTaskToCopy] = useState<{
    taskId: string;
    listId: string;
    areaId: string | null;
    versionId: string | null;
  } | null>(null);
  const [copyTaskSaving, setCopyTaskSaving] = useState(false);

  // Lista de projetos e equipes em cache – ao voltar na página os dados aparecem na hora
  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: () => teamsService.getTeams(),
  });
  const teams = teamsData ?? [];
  const { data: projectsData, isPending: loading } = useQuery({
    queryKey: [...PROJECTS_QUERY_KEY, teamFilter],
    queryFn: async () => {
      const [teamsList, apiProjects] = await Promise.all([
        teamsService.getTeams(),
        projectsService.getProjects(teamFilter ?? undefined),
      ]);
      const teamMap = new Map(teamsList.map((t) => [t.id, t.name]));
      return apiProjects.map((apiProject) => ({
        id: apiProject.id,
        name: apiProject.name,
        description: apiProject.description || "",
        status: apiProject.status,
        dueDate: apiProject.due_date || undefined,
        members: [],
        tags: apiProject.tags || [],
        lists: [],
        files: [],
        financeItems: [],
        kanbanStage: apiProject.kanban_stage || "backlog",
        project_type: (apiProject.project_type as Project["project_type"]) || "simple",
        client_id: apiProject.client_id ?? null,
        areas: [],
        team_id: apiProject.team_id ?? null,
        teamName: apiProject.team_id ? teamMap.get(apiProject.team_id) ?? null : null,
      })) as Project[];
    },
    enabled: true,
  });
  const projects = projectsData ?? [];
  const setProjects = (updater: Project[] | ((prev: Project[]) => Project[])) => {
    queryClient.setQueryData<Project[]>(
      [...PROJECTS_QUERY_KEY, teamFilter],
      (prev) => (typeof updater === "function" ? updater(prev ?? []) : updater)
    );
  };

  const canImportProjectsCsv = canCreateProject(MODULE_PROJECTS);
  const canImportProjectTasksXlsx = canCreateProject(MODULE_TASKS);
  const currentSelectedVersion =
    selectedProject && hasVersions(selectedProject.project_type) && versionSelection.versionId
      ? projectVersions.find((version) => version.id === versionSelection.versionId) ?? null
      : null;
  const currentSelectedVersionFrozen = currentSelectedVersion?.frozen === true;

  const handleProjectsCsvChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !canImportProjectsCsv) return;

    setProjectsCsvImportRunning(true);
    try {
      const text = await file.text();
      const [clients, memberRows] = await Promise.all([
        clientsService.getClients(),
        membersService.getMembers(),
      ]);

      const { prepared, skipped } = prepareProjectsFromCsv(text, memberRows, clients);
      const failed: { line: number; message: string }[] = skipped.map((s) => ({
        line: s.line,
        message: s.reason,
      }));
      const warnings: string[] = [];
      let created = 0;
      const BATCH = 4;

      for (let i = 0; i < prepared.length; i += BATCH) {
        const chunk = prepared.slice(i, i + BATCH);
        await Promise.all(
          chunk.map(async (row) => {
            try {
              for (const w of row.warnings) warnings.push(w);
              const p = row.payload;
              await projectsService.createProject({
                name: p.name,
                status: p.status,
                project_type: p.project_type,
                due_date: p.due_date,
                start_date: p.start_date,
                end_date: p.end_date,
                tags: p.tags,
                client_id: p.client_id,
                responsible_ids: p.responsible_ids,
                description: p.description,
                kanban_stage: null,
              });
              created++;
            } catch (err) {
              failed.push({
                line: row.lineNumber,
                message: err instanceof Error ? err.message : "Erro ao criar projeto",
              });
            }
          }),
        );
      }

      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      setProjectsCsvImportSummary({ created, failed, warnings });

      if (failed.length > 0 || warnings.length > 0 || created === 0) {
        setProjectsCsvImportDialogOpen(true);
      }

      if (created > 0 && failed.length === 0 && warnings.length === 0) {
        toast.success(`${created} projeto${created === 1 ? "" : "s"} importado${created === 1 ? "" : "s"}.`);
      } else if (created > 0) {
        toast.warning(`${created} criado(s); há falhas ou avisos — ver relatório.`);
      } else if (skipped.length > 0 || failed.length > 0) {
        toast.error("Nenhum projeto criado ou arquivo inválido.");
      } else {
        toast.message("Nenhuma linha válida para importar.");
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao ler o CSV.");
    } finally {
      setProjectsCsvImportRunning(false);
    }
  };

  const refreshProjectBoardLists = async (projectId: string) => {
    const apiLists = await projectsService.getProjectLists(projectId);
    const listsWithTasks = await Promise.all(
      apiLists.map(async (apiList) => {
        const apiTasks = await projectsService.getProjectTasks(apiList.id);
        const tasks: Task[] = apiTasks.map((apiTask: ApiProjectTask) => ({
          id: apiTask.id,
          title: apiTask.title,
          description: apiTask.description || "",
          status: apiTask.status as TaskStatus,
          priority: apiTask.priority as Task["priority"],
          dueDate: apiTask.due_date || undefined,
          assignee: apiTask.assignee_id ? members.find((m) => m.id === apiTask.assignee_id) : undefined,
          tags: apiTask.tags || [],
          customFields: apiTask.custom_fields ?? {},
          checklist: (apiTask.checklist || []).map(
            (
              item: { id?: string; text?: string; title?: string; completed?: boolean },
              index: number,
            ) => ({
              id: item.id || `checklist-${index}`,
              text: item.text || item.title || "",
              completed: item.completed || false,
            }),
          ),
        }));
        return {
          id: apiList.id,
          name: apiList.name,
          tasks,
          order: apiList.order_position,
        };
      }),
    );
    setProjects((pall) =>
      pall.map((p) => (p.id === projectId ? { ...p, lists: listsWithTasks } : p)),
    );
    setSelectedProject((prev) => {
      if (!prev || prev.id !== projectId) return prev;
      return { ...prev, lists: listsWithTasks };
    });
  };

  const handleTasksXlsxChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const listId = tasksImportListIdRef.current;
    tasksImportListIdRef.current = null;
    if (!file || !listId || !selectedProject || !canImportProjectTasksXlsx) return;

    setTasksXlsxImportRunning(true);
    try {
      const memberRows = await membersService.getMembers();
      const lower = file.name.toLowerCase();
      const isCsv = lower.endsWith(".csv") || lower.endsWith(".txt");
      const { prepared, skipped } = isCsv
        ? prepareTasksFromProjectTasksCsv(await file.text(), memberRows)
        : prepareTasksFromProjectTasksXlsx(await file.arrayBuffer(), memberRows);
      const failed: { line: number; message: string }[] = skipped.map((s) => ({
        line: s.line,
        message: s.reason,
      }));
      const warnings: string[] = [];
      let created = 0;
      const BATCH = 4;

      for (let i = 0; i < prepared.length; i += BATCH) {
        const chunk = prepared.slice(i, i + BATCH);
        await Promise.all(
          chunk.map(async (row) => {
            try {
              for (const w of row.warnings) warnings.push(w);
              const p = row.payload;
              await projectsService.createProjectTask(listId, {
                title: p.title,
                status: p.status,
                priority: p.priority,
                due_date: p.due_date,
                start_date: p.start_date,
                assignee_id: p.assignee_id,
                tags: p.tags,
              });
              created++;
            } catch (err) {
              failed.push({
                line: row.lineNumber,
                message: err instanceof Error ? err.message : "Erro ao criar tarefa",
              });
            }
          }),
        );
      }

      await refreshProjectBoardLists(selectedProject.id);
      setTasksXlsxImportSummary({ created, failed, warnings });

      if (failed.length > 0 || warnings.length > 0 || created === 0) {
        setTasksXlsxImportDialogOpen(true);
      }

      if (created > 0 && failed.length === 0 && warnings.length === 0) {
        toast.success(`${created} tarefa${created === 1 ? "" : "s"} importada${created === 1 ? "" : "s"}.`);
      } else if (created > 0) {
        toast.warning(`${created} criada(s); há falhas ou avisos — ver relatório.`);
      } else if (skipped.length > 0 || failed.length > 0) {
        toast.error("Nenhuma tarefa criada ou arquivo inválido.");
      } else {
        toast.message("Nenhuma linha válida para importar.");
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao ler o arquivo.");
    } finally {
      setTasksXlsxImportRunning(false);
    }
  };

  // Deep state: sincronizar painel da tarefa com URL (restaura ao navegar/atualizar)
  useEffect(() => {
    if (restoringFromUrlRef.current) return;
    if (fullViewTask && selectedProject) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("task", fullViewTask.id);
          next.set("project", selectedProject.id);
          return next;
        },
        { replace: true }
      );
    } else if (!fullViewTask && searchParams.get("task")) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("task");
          return next;
        },
        { replace: true }
      );
    }
  }, [fullViewTask?.id, selectedProject?.id, searchParams, setSearchParams]);

  // Restaurar painel a partir da URL ao carregar/selecionar projeto
  useEffect(() => {
    const taskId = searchParams.get("task");
    const projectId = searchParams.get("project");
    if (!taskId || !projectId || !selectedProject || selectedProject.id !== projectId) return;
    if (fullViewTask?.id === taskId) return;
    for (const list of selectedProject.lists ?? []) {
      const task = list.tasks.find((t) => t.id === taskId);
      if (task) {
        restoringFromUrlRef.current = true;
        setFullViewTask(
          projectUITaskToUnified(task, {
            listId: list.id,
            projectId: selectedProject.id,
            areaId: null,
          })
        );
        setTimeout(() => {
          restoringFromUrlRef.current = false;
        }, 0);
        break;
      }
    }
  }, [searchParams, selectedProject, fullViewTask?.id]);

  // Deep link: /projects?project=id ou /projetos/:projectId abre o projeto em modo detalhe
  useEffect(() => {
    const projectId = routeProjectId ?? searchParams.get("project");
    if (!projectId || projects.length === 0) return;
    if (selectedProject?.id === projectId) {
      if (viewMode === "list") setViewMode("detail");
      return;
    }
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setSelectedProject(project);
      setViewMode("detail");
      return;
    }
    projectsService.getProjectById(projectId)
      .then((apiProject) => {
        setSelectedProject({
          id: apiProject.id,
          name: apiProject.name,
          description: apiProject.description || "",
          status: apiProject.status,
          dueDate: apiProject.due_date || undefined,
          members: [],
          tags: apiProject.tags || [],
          lists: [],
          files: [],
          financeItems: [],
          kanbanStage: apiProject.kanban_stage || "backlog",
          project_type: (apiProject.project_type as Project["project_type"]) || "simple",
          client_id: apiProject.client_id ?? null,
          areas: apiProject.areas || [],
          versions: apiProject.versions,
          team_id: apiProject.team_id ?? null,
          teamName: apiProject.team_id ? teams.find(t => t.id === apiProject.team_id)?.name ?? null : null,
        });
        setViewMode("detail");
      })
      .catch(() => toast.error("Projeto não encontrado"));
  }, [routeProjectId, searchParams, projects, selectedProject?.id, viewMode, teams]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "financeiro" || tab === "finance") {
      setActiveTab("finance");
    } else if (tab === "documentos" || tab === "files") {
      setActiveTab("files");
    } else if (tab === "calendario" || tab === "calendar") {
      setActiveTab("calendar");
    }
  }, [searchParams]);

  // Membros em cache para carregamento rápido
  const { data: membersData } = useQuery({
    queryKey: ["members"],
    queryFn: () => membersService.getMembers(),
  });
  useEffect(() => {
    setMembers(membersData ?? []);
  }, [membersData]);

  // Em projetos com áreas, as abas Etapas/Tarefas não existem; manter aba válida (Documentos, Calendário ou Financeiro)
  useEffect(() => {
    if (!selectedProject) return;
    if (hasAreas(selectedProject.project_type) && (activeTab === "board" || activeTab === "list")) {
      setActiveTab("files");
    }
  }, [selectedProject?.id, selectedProject?.project_type]);

  // Abrir home do projeto quando voltar da página de uma área (state.openProjectId)
  useEffect(() => {
    const openProjectId = (location.state as { openProjectId?: string } | null)?.openProjectId;
    if (!openProjectId) return;
    const openProject = async () => {
      const fromList = projects.find((p) => p.id === openProjectId);
      if (fromList) {
        setSelectedProject(fromList);
        setViewMode("detail");
      } else {
        try {
          const project = await projectsService.getProjectById(openProjectId);
          const teamName = project.team_id && teams.length ? teams.find(t => t.id === project.team_id)?.name ?? null : null;
          setSelectedProject({
            id: project.id,
            name: project.name,
            description: project.description || "",
            status: project.status,
            dueDate: project.due_date || undefined,
            members: [],
            tags: project.tags || [],
            lists: [],
            files: [],
            financeItems: [],
            kanbanStage: project.kanban_stage || "backlog",
            project_type: (project.project_type as Project["project_type"]) || "simple",
            client_id: project.client_id ?? null,
            areas: project.areas || [],
            team_id: project.team_id ?? null,
            teamName: teamName ?? null,
          });
          setViewMode("detail");
        } catch (e) {
          console.error(e);
        }
      }
      navigate("/projects", { replace: true, state: {} });
    };
    openProject();
  }, [location.state, navigate, projects]);

  // Carregar listas, tarefas, project_type e áreas quando um projeto é selecionado
  useEffect(() => {
    const loadProjectDetails = async () => {
      if (!selectedProject) return;

      try {
        const apiProjectFull = await projectsService.getProjectById(selectedProject.id);
        const projectType = (apiProjectFull.project_type as Project["project_type"]) || "simple";
        const versionsList = apiProjectFull.versions ?? [];
        let effectiveVersionSelection = versionSelection;
        if (hasVersions(projectType)) {
          setProjectVersions(versionsList);
          if (
            versionSelection.mode !== "all" &&
            !(
              versionSelection.mode === "version" &&
              versionSelection.versionId &&
              versionsList.some((version) => version.id === versionSelection.versionId && !version.archived_at)
            )
          ) {
            effectiveVersionSelection = deriveInitialVersionSelection(versionsList);
            setVersionSelection(effectiveVersionSelection);
          }
        } else {
          setProjectVersions([]);
        }
        const versionFilter = hasVersions(projectType)
          ? versionSelectionToTaskFilter(effectiveVersionSelection, versionsList)
          : undefined;

        // Projetos com áreas: não carregar listas/tarefas na tela principal (só na página da área)
        if (hasAreas(projectType)) {
          const areasList = apiProjectFull.areas || [];
          const teamName = apiProjectFull.team_id && teams.length ? teams.find(t => t.id === apiProjectFull.team_id)?.name ?? null : null;
          setSelectedProject({
            ...selectedProject,
            project_type: projectType,
            client_id: apiProjectFull.client_id ?? null,
            areas: areasList,
            versions: hasVersions(projectType) ? versionsList : undefined,
            lists: [],
            team_id: apiProjectFull.team_id ?? null,
            teamName: teamName ?? null,
          });
          // Carregar progresso de tarefas por área para os cards
          if (areasList.length > 0) {
            const progressMap: Record<string, AreaProgress> = {};
            await Promise.all(
              areasList.map(async (a: { id: string }) => {
                try {
                  const tasks = await projectsService.getProjectTasksByArea(
                    selectedProject.id,
                    a.id,
                    versionFilter,
                  );
                  const completed = tasks.filter((t: { status: string }) => t.status === "completed").length;
                  progressMap[a.id] = { total: tasks.length, completed };
                } catch {
                  progressMap[a.id] = { total: 0, completed: 0 };
                }
              })
            );
            setAreaProgress(progressMap);
          } else {
            setAreaProgress({});
          }
          return;
        }
        setAreaProgress({});

        const apiLists = await projectsService.getProjectLists(selectedProject.id);

        const listsWithTasks = await Promise.all(
          apiLists.map(async (apiList) => {
            const apiTasks = await projectsService.getProjectTasks(apiList.id, versionFilter);
            
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
              customFields: apiTask.custom_fields ?? {},
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

        const teamName = apiProjectFull.team_id && teams.length ? teams.find(t => t.id === apiProjectFull.team_id)?.name ?? null : null;
        setSelectedProject({
          ...selectedProject,
          project_type: (apiProjectFull.project_type as Project["project_type"]) || "simple",
          client_id: apiProjectFull.client_id ?? null,
          areas: apiProjectFull.areas || [],
          versions: hasVersions(projectType) ? versionsList : undefined,
          lists: listsWithTasks,
          team_id: apiProjectFull.team_id ?? null,
          teamName: teamName ?? null,
        });
      } catch (error) {
        console.error('Erro ao carregar detalhes do projeto:', error);
        toast.error('Erro ao carregar detalhes do projeto');
      }
    };

    loadProjectDetails();
  }, [selectedProject?.id, teams, versionSelection]);

  useEffect(() => {
    setProjectVersions([]);
    setVersionSelection({ mode: "version" });
  }, [selectedProject?.id]);

  const reloadProjectVersions = async () => {
    if (!selectedProject || !hasVersions(selectedProject.project_type)) return;
    const versions = await projectsService.getProjectVersions(selectedProject.id);
    setProjectVersions(versions);
    setSelectedProject((prev) => (prev ? { ...prev, versions } : prev));
  };

  const handleSaveProjectVersion = async (payload: {
    name: string;
    description: string | null;
    status: ProjectVersion["status"];
    start_date: string | null;
    due_date: string | null;
    is_default?: boolean;
  }) => {
    if (!selectedProject) return;
    setVersionSaving(true);
    try {
      if (editingVersion) {
        await projectsService.updateProjectVersion(selectedProject.id, editingVersion.id, payload);
        toast.success("Versão atualizada");
      } else {
        const created = await projectsService.createProjectVersion(selectedProject.id, payload);
        setVersionSelection({ mode: "version", versionId: created.id });
        toast.success("Versão criada");
      }
      setVersionDialogOpen(false);
      setEditingVersion(null);
      await reloadProjectVersions();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar versão");
    } finally {
      setVersionSaving(false);
    }
  };

  const handleArchiveProjectVersion = async (version: ProjectVersion) => {
    if (!selectedProject) return;
    setVersionSaving(true);
    try {
      await projectsService.archiveProjectVersion(selectedProject.id, version.id);
      toast.success("Versão arquivada");
      setVersionDialogOpen(false);
      setEditingVersion(null);
      if (versionSelection.mode === "version" && versionSelection.versionId === version.id) {
        setVersionSelection(deriveInitialVersionSelection(projectVersions));
      }
      await reloadProjectVersions();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao arquivar versão");
    } finally {
      setVersionSaving(false);
    }
  };

  const handlePublishProjectVersion = async (payload: {
    move_incomplete_to_version_id?: string | null;
    archive_after_publish: boolean;
    freeze_version: boolean;
    generate_release_notes: boolean;
  }) => {
    if (!selectedProject || !currentSelectedVersion) return;
    setVersionActionSaving(true);
    try {
      await projectsService.publishProjectVersion(selectedProject.id, currentSelectedVersion.id, payload);
      toast.success("Versão publicada");
      setPublishVersionOpen(false);
      await reloadProjectVersions();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao publicar versão");
    } finally {
      setVersionActionSaving(false);
    }
  };

  const handleDuplicateProjectVersion = async (payload: {
    name: string;
    copy_open_tasks: boolean;
    copy_completed_tasks: boolean;
    copy_checklists: boolean;
  }) => {
    if (!selectedProject || !currentSelectedVersion) return;
    setVersionActionSaving(true);
    try {
      const created = await projectsService.duplicateProjectVersion(selectedProject.id, currentSelectedVersion.id, payload);
      toast.success("Versão duplicada");
      setVersionSelection({ mode: "version", versionId: created.id });
      setDuplicateVersionOpen(false);
      await reloadProjectVersions();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao duplicar versão");
    } finally {
      setVersionActionSaving(false);
    }
  };

  const handleMoveProjectTask = async (payload: {
    list_id: string;
    version_id: string;
    area_id: string | null;
  }) => {
    if (!taskToMove) return;
    setMoveTaskSaving(true);
    try {
      await projectsService.moveProjectTask(taskToMove.taskId, payload);
      toast.success("Tarefa transferida");
      setMoveTaskDialogOpen(false);
      setTaskToMove(null);
      setFullViewTask(null);
      if (selectedProject) {
        const apiProjectFull = await projectsService.getProjectById(selectedProject.id);
        const projectType = (apiProjectFull.project_type as Project["project_type"]) || "simple";
        if (!hasAreas(projectType)) {
          const versionFilter = hasVersions(projectType)
            ? versionSelectionToTaskFilter(versionSelection, projectVersions)
            : undefined;
          const apiLists = await projectsService.getProjectLists(selectedProject.id);
          const listsWithTasks = await Promise.all(
            apiLists.map(async (apiList) => {
              const apiTasks = await projectsService.getProjectTasks(apiList.id, versionFilter);
              const tasks: Task[] = apiTasks.map((apiTask: ApiProjectTask) => ({
                id: apiTask.id,
                title: apiTask.title,
                description: apiTask.description || "",
                status: apiTask.status as TaskStatus,
                priority: apiTask.priority as Task["priority"],
                dueDate: apiTask.due_date || undefined,
                assignee: apiTask.assignee_id ? members.find((m) => m.id === apiTask.assignee_id) : undefined,
                tags: apiTask.tags || [],
                customFields: apiTask.custom_fields ?? {},
                checklist: (apiTask.checklist || []).map(
                  (
                    item: { id?: string; text?: string; title?: string; completed?: boolean },
                    index: number,
                  ) => ({
                    id: item.id || `checklist-${index}`,
                    text: item.text || item.title || "",
                    completed: item.completed || false,
                  }),
                ),
              }));
              return {
                id: apiList.id,
                name: apiList.name,
                tasks,
                order: apiList.order_position,
              };
            }),
          );
          setSelectedProject((prev) => (prev ? { ...prev, lists: listsWithTasks } : prev));
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao transferir tarefa");
    } finally {
      setMoveTaskSaving(false);
    }
  };

  const handleCopyProjectTask = async (payload: {
    list_id: string;
    version_id: string;
    area_id: string | null;
    copy_checklist: boolean;
    copy_assignee: boolean;
    copy_due_date: boolean;
    copy_metadata: boolean;
  }) => {
    if (!taskToCopy) return;
    setCopyTaskSaving(true);
    try {
      await projectsService.copyProjectTask(taskToCopy.taskId, payload);
      toast.success("Tarefa copiada");
      setCopyTaskDialogOpen(false);
      setTaskToCopy(null);
      if (selectedProject && !hasAreas(selectedProject.project_type)) {
        const versionFilter = hasVersions(selectedProject.project_type)
          ? versionSelectionToTaskFilter(versionSelection, projectVersions)
          : undefined;
        const apiLists = await projectsService.getProjectLists(selectedProject.id);
        const listsWithTasks = await Promise.all(
          apiLists.map(async (apiList) => {
            const apiTasks = await projectsService.getProjectTasks(apiList.id, versionFilter);
            const tasks: Task[] = apiTasks.map((apiTask: ApiProjectTask) => ({
              id: apiTask.id,
              title: apiTask.title,
              description: apiTask.description || "",
              status: apiTask.status as TaskStatus,
              priority: apiTask.priority as Task["priority"],
              dueDate: apiTask.due_date || undefined,
              assignee: apiTask.assignee_id ? members.find((m) => m.id === apiTask.assignee_id) : undefined,
              tags: apiTask.tags || [],
              customFields: apiTask.custom_fields ?? {},
              checklist: (apiTask.checklist || []).map(
                (
                  item: { id?: string; text?: string; title?: string; completed?: boolean },
                  index: number,
                ) => ({
                  id: item.id || `checklist-${index}`,
                  text: item.text || item.title || "",
                  completed: item.completed || false,
                }),
              ),
            }));
            return {
              id: apiList.id,
              name: apiList.name,
              tasks,
              order: apiList.order_position,
            };
          }),
        );
        setSelectedProject((prev) => (prev ? { ...prev, lists: listsWithTasks } : prev));
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao copiar tarefa");
    } finally {
      setCopyTaskSaving(false);
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

  // Áreas do projeto (tipos areas e advanced)
  const handleCreateArea = async (name: string) => {
    if (!selectedProject) throw new Error("Projeto não selecionado");
    const area = await projectsService.createProjectArea(selectedProject.id, { name });
    toast.success("Área criada com sucesso!");
    return area;
  };
  const handleUpdateArea = async (
    areaId: string,
    data: { name: string; responsible_ids?: string[]; team_ids?: string[] }
  ) => {
    const area = await projectsService.updateProjectArea(areaId, data);
    toast.success("Área atualizada!");
    return area;
  };
  const handleDeleteArea = async (areaId: string) => {
    await projectsService.deleteProjectArea(areaId);
    toast.success("Área excluída.");
  };
  const handleAreasChange = (areas: Project["areas"]) => {
    if (!selectedProject) return;
    const updated = { ...selectedProject, areas: areas ?? [] };
    setSelectedProject(updated);
    setProjects(projects.map((p) => (p.id === selectedProject.id ? updated : p)));
    setAreaProgress((prev) => {
      const next = { ...prev };
      (areas ?? []).forEach((a) => {
        if (!next[a.id]) next[a.id] = { total: 0, completed: 0 };
      });
      return next;
    });
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

  const applyNewProjectTask = (apiTask: ApiProjectTask, listId: string) => {
    if (!selectedProject) return;
    const assignee = apiTask.assignee_id
      ? members.find((m) => m.id === apiTask.assignee_id)
      : undefined;
    const newTask: Task = {
      id: apiTask.id,
      title: apiTask.title,
      description: apiTask.description || "",
      status: apiTask.status as TaskStatus,
      priority: apiTask.priority as Task["priority"],
      dueDate: apiTask.due_date || undefined,
      assignee,
      tags: apiTask.tags || [],
      checklist: (apiTask.checklist || []).map((item: any, index: number) => ({
        id: item.id || `checklist-${index}`,
        text: item.text || item.title || "",
        completed: item.completed || false,
      })),
    };
    const updatedProject = {
      ...selectedProject,
      lists: selectedProject.lists.map((list) => {
        if (list.id !== listId) return list;
        return { ...list, tasks: [...list.tasks, newTask] };
      }),
    };
    setProjects(projects.map((p) => (p.id === selectedProject.id ? updatedProject : p)));
    setSelectedProject(updatedProject);
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

  // Atualizar tarefa a partir do TaskFullView (payload em formato API)
  const handleFullViewUpdate = async (
    taskId: string,
    updates: Record<string, unknown>
  ) => {
    if (!selectedProject || !fullViewTask) return;
    try {
      const updateData: Record<string, unknown> = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.description !== undefined)
        updateData.description = updates.description;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.due_date !== undefined) updateData.due_date = updates.due_date;
      if (updates.list_id !== undefined) updateData.list_id = updates.list_id;
      if (updates.assignee_id !== undefined) updateData.assignee_id = updates.assignee_id;
      if (updates.assignee_name !== undefined) updateData.assignee_name = updates.assignee_name;
      if (updates.tags !== undefined) updateData.tags = updates.tags;
      if (updates.custom_fields !== undefined) updateData.custom_fields = updates.custom_fields;
      if (updates.checklist !== undefined) updateData.checklist = updates.checklist;
      if (updates.start_date !== undefined) updateData.start_date = updates.start_date;
      if (updates.start_time !== undefined) updateData.start_time = updates.start_time;
      if (updates.end_time !== undefined) updateData.end_time = updates.end_time;
      if (updates.estimated_effort_hours !== undefined) updateData.estimated_effort_hours = updates.estimated_effort_hours;
      if (updates.estimated_story_points !== undefined) updateData.estimated_story_points = updates.estimated_story_points;
      if (updates.watchers !== undefined) updateData.watchers = updates.watchers;
      if (updates.visibility !== undefined) updateData.visibility = updates.visibility;
      if (updates.billable !== undefined) updateData.billable = updates.billable;
      if (updates.hourly_rate !== undefined) updateData.hourly_rate = updates.hourly_rate;
      if (updates.budget_cap !== undefined) updateData.budget_cap = updates.budget_cap;
      if (updates.recurrence_rule !== undefined) updateData.recurrence_rule = updates.recurrence_rule;
      if (updates.meeting_location !== undefined) updateData.meeting_location = updates.meeting_location;
      if (updates.meeting_link !== undefined) updateData.meeting_link = updates.meeting_link;
      if (updates.severity !== undefined) updateData.severity = updates.severity;

      if (Object.keys(updateData).length > 0) {
        await projectsService.updateProjectTask(taskId, updateData);
      }

      const currentListId = fullViewTask.listId;
      const targetListId = (updates.list_id as string) ?? currentListId;
      const taskList = selectedProject.lists.find((l) => l.id === currentListId);
      const task = taskList?.tasks.find((t) => t.id === taskId);
      if (!task) return;

      const updatedTask: Task = {
        ...task,
        title: (updates.title as string) ?? task.title,
        description: (updates.description as string) ?? task.description,
        status: (updates.status as Task["status"]) ?? task.status,
        priority: (updates.priority as Task["priority"]) ?? task.priority,
        dueDate: (updates.due_date as string) ?? task.dueDate,
        tags: (updates.tags as string[]) ?? task.tags,
        customFields: (updates.custom_fields as Record<string, unknown>) ?? task.customFields,
        checklist: Array.isArray(updates.checklist)
          ? (updates.checklist as { id: string; text: string; completed: boolean }[])
          : task.checklist,
      };

      const updatedProject: Project = {
        ...selectedProject,
        lists: selectedProject.lists.map((list) => {
          if (list.id === currentListId && currentListId === targetListId) {
            return {
              ...list,
              tasks: list.tasks.map((t) =>
                t.id === taskId ? updatedTask : t
              ),
            };
          }
          if (list.id === currentListId) {
            return {
              ...list,
              tasks: list.tasks.filter((t) => t.id !== taskId),
            };
          }
          if (list.id === targetListId) {
            return {
              ...list,
              tasks: [...list.tasks, updatedTask],
            };
          }
          return list;
        }),
      };

      setProjects(projects.map((p) => (p.id === selectedProject.id ? updatedProject : p)));
      setSelectedProject(updatedProject);
      setFullViewTask((prev) =>
        prev
          ? {
              ...prev,
              title: updatedTask.title,
              description: updatedTask.description ?? null,
              status: updatedTask.status as UnifiedTask["status"],
              priority: updatedTask.priority as UnifiedTask["priority"],
              dueDate: (updates.due_date as string) ?? prev.dueDate ?? null,
              tags: (updates.tags as string[]) ?? prev.tags ?? [],
              customFields: (updates.custom_fields as Record<string, unknown>) ?? prev.customFields ?? {},
              checklist: Array.isArray(updates.checklist) ? (updates.checklist as UnifiedTask["checklist"]) : (prev.checklist ?? []),
              listId: targetListId,
              clientName: (updates.client_name as string) ?? prev.clientName ?? null,
              deal: (updates.deal as string) ?? prev.deal ?? null,
              assigneeId: (updates.assignee_id as string) ?? prev.assigneeId ?? null,
              assigneeName: (updates.assignee_name as string) ?? prev.assigneeName ?? null,
              assigneeAvatar: (updates.assignee_name as string)
                ? (updates.assignee_name as string).split(/\s+/).map((s) => s[0]).join("").toUpperCase().slice(0, 2)
                : prev.assigneeAvatar ?? null,
              startDate: (updates.start_date as string) ?? prev.startDate ?? null,
              startTime: (updates.start_time as string) ?? prev.startTime ?? null,
              endTime: (updates.end_time as string) ?? prev.endTime ?? null,
              estimatedEffortHours: (updates.estimated_effort_hours as number) ?? prev.estimatedEffortHours ?? null,
              estimatedStoryPoints: (updates.estimated_story_points as number) ?? prev.estimatedStoryPoints ?? null,
              billable: (updates.billable as boolean) ?? prev.billable ?? false,
              hourlyRate: (updates.hourly_rate as number) ?? prev.hourlyRate ?? null,
              budgetCap: (updates.budget_cap as number) ?? prev.budgetCap ?? null,
              recurrenceRule: updates.recurrence_rule ?? prev.recurrenceRule ?? null,
              meetingLocation: (updates.meeting_location as string) ?? prev.meetingLocation ?? null,
              meetingLink: (updates.meeting_link as string) ?? prev.meetingLink ?? null,
              severity: (updates.severity as string) ?? prev.severity ?? null,
            }
          : null
      );
      toast.success("Tarefa atualizada");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar tarefa");
    }
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
          {canCreateProject(MODULE_PROJECTS) && (
          <Button asChild>
            <Link to="/projects/new">
              <Plus className="mr-2 h-4 w-4" />
              Criar Projeto
            </Link>
          </Button>
          )}
        </div>
      );
    }

    // Filtrar listas conforme necessário
    const filteredLists = getFilteredLists(selectedProject.lists);
    const selectedVersion = currentSelectedVersion;
    const selectedVersionFrozen = currentSelectedVersionFrozen;
    const isAdvancedProject = selectedProject.project_type === "advanced";

    const handleBackToProjects = () => {
      if (routeProjectId) {
        navigate("/projects", { replace: true });
        return;
      }
      setViewMode("list");
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("project");
          next.delete("task");
          return next;
        },
        { replace: true }
      );
    };

    return (
      <div>
        <div className="mb-4 space-y-3">
          <ProjectHeader
            project={selectedProject}
            onBack={handleBackToProjects}
            onSettings={() => setProjectSettingsOpen(true)}
            onSaveAsTemplate={() => setSaveAsTemplateOpen(true)}
            onNewVersion={
              hasVersions(selectedProject.project_type)
                ? () => {
                    setEditingVersion(null);
                    setVersionDialogOpen(true);
                  }
                : undefined
            }
          />

          {selectedProject.description ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
              <div
                className={`text-sm text-muted-foreground ${
                  expandedDescriptions[selectedProject.id] ? "" : "line-clamp-2"
                }`}
                style={
                  !expandedDescriptions[selectedProject.id]
                    ? {
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        wordBreak: "break-word",
                      }
                    : { wordBreak: "break-word" }
                }
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedProject.description) }}
              />
              {needsTruncation(selectedProject.description) ? (
                <button
                  type="button"
                  className="mt-2 inline-flex items-center text-xs text-primary hover:text-primary/80"
                  onClick={() =>
                    setExpandedDescriptions((prev) => ({
                      ...prev,
                      [selectedProject.id]: !prev[selectedProject.id],
                    }))
                  }
                >
                  {expandedDescriptions[selectedProject.id] ? (
                    <>
                      <ChevronUp className="mr-1 h-3 w-3" />
                      Ler menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-1 h-3 w-3" />
                      Ler mais
                    </>
                  )}
                </button>
              ) : null}
            </div>
          ) : null}

          {hasVersions(selectedProject.project_type) ? (
            <ProjectVersionControlPanel
              projectId={selectedProject.id}
              tenantId={user?.tenant_id ?? null}
              versions={projectVersions}
              selection={versionSelection}
              selectedVersion={selectedVersion}
              onSelectionChange={(selection) =>
                setVersionSelection(normalizeVersionSelection(selection, projectVersions))
              }
              onCreateVersion={() => {
                setEditingVersion(null);
                setVersionDialogOpen(true);
              }}
              onEditVersion={(version) => {
                setEditingVersion(version);
                setVersionDialogOpen(true);
              }}
              onPublish={() => setPublishVersionOpen(true)}
              onDuplicate={() => setDuplicateVersionOpen(true)}
              onUnfreeze={async () => {
                if (!selectedVersion) return;
                await projectsService.updateProjectVersion(selectedProject.id, selectedVersion.id, { frozen: false });
                toast.success("Versão descongelada");
                await reloadProjectVersions();
              }}
            />
          ) : null}
        
          {!hasAreas(selectedProject.project_type) && (
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
          )}

          <ProjectAreasSection
            projectType={selectedProject.project_type}
            projectId={selectedProject.id}
            areas={selectedProject.areas ?? []}
            areaProgress={areaProgress}
            members={members}
            teams={teams.map((t) => ({ id: t.id, name: t.name }))}
            projectResponsibleIds={selectedProject.responsible_ids ?? []}
            projectTeamIds={selectedProject.team_ids ?? (selectedProject.team_id ? [selectedProject.team_id] : [])}
            onAreasChange={handleAreasChange}
            onCreateArea={handleCreateArea}
            onUpdateArea={handleUpdateArea}
            onDeleteArea={handleDeleteArea}
            versionQuery={
              hasVersions(selectedProject.project_type)
                ? versionSelectionToQuery(versionSelection)
                : undefined
            }
          />

          {hasAreas(selectedProject.project_type) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {isAdvancedProject
                ? "Clique em uma área para ver e gerenciar as tarefas dessa release."
                : (
                    <>
                      Clique em <strong>Abrir</strong> em uma área para ver e gerenciar as tarefas dessa área.
                    </>
                  )}
            </p>
          )}

          <Collapsible defaultOpen={!isAdvancedProject} className={isAdvancedProject ? "mb-4 mt-2 rounded-2xl border border-border/70 bg-card/70 shadow-sm" : "mb-4 mt-2 rounded-xl border border-border/70 bg-card/80 shadow-sm"}>
            <CollapsibleTrigger className={isAdvancedProject ? "flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/25" : "flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-muted/30"}>
              <div className="min-w-0">
                <h3 className={isAdvancedProject ? "text-base font-semibold" : "text-sm font-semibold"}>
                  {isAdvancedProject ? "Workspace do projeto" : hasAreas(selectedProject.project_type) ? "Complementos do projeto" : "Módulos do projeto"}
                </h3>
                <p className={isAdvancedProject ? "mt-0.5 text-xs text-muted-foreground" : "text-xs text-muted-foreground"}>
                  {isAdvancedProject
                    ? "Documentos, calendário e financeiro conectados à release ativa."
                    : "Documentos, calendário e financeiro ficam separados da gestão de releases."}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </CollapsibleTrigger>
            <CollapsibleContent className={isAdvancedProject ? "px-4 pb-4" : "px-3 pb-3"}>
            {isAdvancedProject ? (
              <div className="mb-3 grid gap-2 md:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Documentos</p>
                  <p className="mt-1 text-sm font-semibold">Drive do projeto</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedProject.client_id ? "Upload, pastas e browser Google Drive." : "Vincule um cliente para ativar o Drive."}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Calendário</p>
                  <p className="mt-1 text-sm font-semibold">{selectedVersion?.due_date ? "Entrega prevista" : "Sem entrega definida"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedVersion?.due_date ?? "Defina prazos na release para montar a agenda."}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Financeiro</p>
                  <p className="mt-1 text-sm font-semibold">{selectedProject.financeItems?.length ?? 0} lançamentos</p>
                  <p className="mt-1 text-xs text-muted-foreground">Resumo financeiro do projeto.</p>
                </div>
              </div>
            ) : null}
            <Tabs
              defaultValue="board"
              value={hasAreas(selectedProject.project_type) && (activeTab === "board" || activeTab === "list") ? "files" : activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className={`${isAdvancedProject ? "flex h-9 w-full justify-start overflow-x-auto rounded-full bg-muted/50 p-1" : `grid h-9 w-full ${hasAreas(selectedProject.project_type) ? 'grid-cols-3' : 'grid-cols-5'}`}`}>
                {!hasAreas(selectedProject.project_type) && (
                  <>
                    <TabsTrigger value="board" className="h-7 text-xs">
                      <Kanban className="mr-1.5 h-3.5 w-3.5" />
                      Etapas
                    </TabsTrigger>
                    <TabsTrigger value="list" className="h-7 text-xs">
                      <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                      Tarefas
                    </TabsTrigger>
                  </>
                )}
                <TabsTrigger value="files" className={isAdvancedProject ? "h-7 rounded-full px-3 text-xs" : "h-7 text-xs"}>
                  <File className="mr-1.5 h-3.5 w-3.5" />
                  Documentos
                </TabsTrigger>
                <TabsTrigger value="calendar" className={isAdvancedProject ? "h-7 rounded-full px-3 text-xs" : "h-7 text-xs"}>
                  <CalendarIcon2 className="mr-1.5 h-3.5 w-3.5" />
                  Calendário
                </TabsTrigger>
                <TabsTrigger value="finance" className={isAdvancedProject ? "h-7 rounded-full px-3 text-xs" : "h-7 text-xs"}>
                  <DollarSign className="mr-1.5 h-3.5 w-3.5" />
                  Financeiro
                </TabsTrigger>
              </TabsList>

              {!hasAreas(selectedProject.project_type) && (
                <>
                  <TabsContent value="board">
                    <BoardView
                      lists={filteredLists}
                      onToggleTaskStatus={toggleTaskStatus}
                      onTaskClick={openTaskDetail}
                      projectId={selectedProject.id}
                      onOpenFull={setFullViewTask}
                      onAddTask={(listId) => {
                        if (selectedVersionFrozen) {
                          toast.error("Versão congelada: não é possível criar tarefas.");
                          return;
                        }
                        setSelectedListId(listId);
                        setNewTaskDialogOpen(true);
                      }}
                      onEditList={(list) => {
                        setEditingList(list);
                        setEditListDialogOpen(true);
                      }}
                      onDeleteList={deleteList}
                      importTasksDisabled={tasksXlsxImportRunning}
                      onImportTasks={
                        canImportProjectTasksXlsx
                          ? (listId) => {
                              tasksImportListIdRef.current = listId;
                              tasksXlsxInputRef.current?.click();
                            }
                          : undefined
                      }
                      onAddList={() => setNewListDialogOpen(true)}
                      onMoveTask={selectedVersionFrozen ? undefined : moveTask}
                    />
                  </TabsContent>
                  <TabsContent value="list">
                    <TaskListView
                      lists={filteredLists}
                      onToggleTaskStatus={toggleTaskStatus}
                      onTaskClick={openTaskDetail}
                      projectId={selectedProject.id}
                      onOpenFull={setFullViewTask}
                    />
                  </TabsContent>
                </>
              )}

              <TabsContent value="files">
                {isAdvancedProject ? (
                  selectedProject.client_id ? (
                    activeTab === "files" ? (
                      <ProjectDriveWorkspace
                        clientId={selectedProject.client_id}
                        projectName={selectedProject.name}
                        selectedVersion={selectedVersion}
                        canUpload={canCreateProject(MODULE_PROJECTS)}
                      />
                    ) : null
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                      Vincule este projeto a um cliente para usar a central Google Drive existente do CRM.
                    </div>
                  )
                ) : selectedProject.files && selectedProject.files.length > 0 ? (
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
                {isAdvancedProject && activeTab !== "calendar" ? null : (
                  <CalendarView
                    project={selectedProject}
                    onTaskClick={openTaskDetail}
                  />
                )}
              </TabsContent>

              <TabsContent value="finance">
                {isAdvancedProject && activeTab !== "finance" ? null : (
                  <ProjectFinance
                    project={selectedProject}
                    onUpdateProject={handleUpdateProject}
                  />
                )}
              </TabsContent>
            </Tabs>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    );
  };

  return (
    <div>
      <input
        ref={projectsCsvInputRef}
        type="file"
        accept=".csv,text/csv,.txt"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleProjectsCsvChange}
      />
      <input
        ref={tasksXlsxInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleTasksXlsxChange}
      />
      {viewMode === "list" ? (
        <>
          <Sheet open={teamFilterSheetOpen} onOpenChange={setTeamFilterSheetOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[70vh] rounded-t-2xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 md:hidden"
            >
              <SheetHeader className="text-left">
                <SheetTitle>Equipe</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <Select
                  value={teamFilter ?? "all"}
                  onValueChange={(v) => {
                    setTeamFilter(v === "all" ? null : v);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as equipes</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <SheetClose asChild>
                <Button type="button" className="mt-4 w-full">
                  Concluir
                </Button>
              </SheetClose>
            </SheetContent>
          </Sheet>
          <div className="md:hidden sticky top-0 z-30 -mx-0.5 mb-6 border-b border-border/70 bg-background/95 px-0.5 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/90">
            <MobilePageHeader
              title="Projetos"
              secondaryActions={[
                ...(canImportProjectsCsv
                  ? [
                      {
                        icon: <Upload className="h-4 w-4" aria-hidden />,
                        ariaLabel: "Importar projetos (CSV)",
                        onClick: () => projectsCsvInputRef.current?.click(),
                        disabled: projectsCsvImportRunning,
                      },
                    ]
                  : []),
                {
                  icon: <LayoutGrid className="h-4 w-4" aria-hidden />,
                  ariaLabel: "Vista em grade",
                  onClick: () => setProjectsViewType("grid"),
                },
                {
                  icon: <Kanban className="h-4 w-4" aria-hidden />,
                  ariaLabel: "Vista em kanban",
                  onClick: () => setProjectsViewType("kanban"),
                },
                {
                  icon: <Users className="h-4 w-4" aria-hidden />,
                  ariaLabel: "Filtrar por equipe",
                  onClick: () => setTeamFilterSheetOpen(true),
                },
              ]}
              primaryAction={
                canCreateProject(MODULE_PROJECTS)
                  ? { label: "Novo projeto", icon: <Plus className="h-4 w-4" aria-hidden />, href: "/projects/new" }
                  : undefined
              }
            />
          </div>
        </>
      ) : null}

      <div
        className={
          viewMode === "list"
            ? "mb-6 hidden md:flex md:items-center md:justify-between"
            : "mb-6 flex items-center justify-between"
        }
      >
        <h1 className="text-2xl font-bold">Gerenciamento de Projetos</h1>
        {viewMode === "list" && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={teamFilter ?? "all"} onValueChange={(v) => setTeamFilter(v === "all" ? null : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as equipes</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {canImportProjectsCsv && (
              <Button
                type="button"
                variant="outline"
                disabled={projectsCsvImportRunning}
                onClick={() => projectsCsvInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Importar (CSV)
              </Button>
            )}
            {canCreateProject(MODULE_PROJECTS) && (
              <Button asChild>
                <Link to="/projects/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Projeto
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Conteúdo principal */}
      {loading && projects.length === 0 ? (
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
              navigate(getProjectUrl(project.id));
            }}
            onNewProject={() => navigate("/projects/new")}
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
              navigate(getProjectUrl(project.id));
            }}
            onAddProject={() => navigate("/projects/new")}
            onMoveProject={moveProject}
          />
        )
      ) : (
        renderProjectDetail()
      )}
      
      {/* Diálogos */}
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
      
      {selectedProject && selectedListId ? (
        <TaskFormDialog
          key={selectedListId}
          open={newTaskDialogOpen}
          onOpenChange={setNewTaskDialogOpen}
          canSubmit={canCreateProject(MODULE_TASKS) && !currentSelectedVersionFrozen}
          context={{
            origin: "project",
            projectId: selectedProject.id,
            listId: selectedListId,
            areaId: null,
            versionId: hasVersions(selectedProject.project_type)
              ? versionIdForTaskCreate(versionSelection, projectVersions)
              : undefined,
            projectName: selectedProject.name,
            teams: teams.map((t) => ({ id: t.id, name: t.name })),
          }}
          onSuccess={(r) => {
            if (r.origin === "project") applyNewProjectTask(r.apiTask, r.listId);
          }}
        />
      ) : null}
      
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

      <TaskSidePanel
        task={fullViewTask}
        open={!!fullViewTask}
        onOpenChange={(open) => !open && setFullViewTask(null)}
        listName={
          fullViewTask && selectedProject
            ? selectedProject.lists.find((l) => l.id === fullViewTask.listId)
                ?.name ?? null
            : null
        }
        lists={
          selectedProject?.lists?.map((l) => ({ id: l.id, name: l.name })) ?? []
        }
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        onUpdate={currentSelectedVersionFrozen ? undefined : handleFullViewUpdate}
        onDelete={
          fullViewTask && !currentSelectedVersionFrozen
            ? (taskId) =>
                deleteTask(fullViewTask.listId, taskId).then(() =>
                  setFullViewTask(null)
                )
            : undefined
        }
        onToggleStatus={
          fullViewTask && !currentSelectedVersionFrozen
            ? (taskId) => {
                toggleTaskStatus(fullViewTask.listId, taskId);
                setFullViewTask((prev) =>
                  prev
                    ? {
                        ...prev,
                        status:
                          prev.status === "completed" ? "todo" : "completed",
                      }
                    : null
                );
              }
            : undefined
        }
        onMoveToVersion={
          fullViewTask &&
          selectedProject &&
          hasVersions(selectedProject.project_type) &&
          !currentSelectedVersionFrozen
            ? () => {
                setTaskToMove({
                  taskId: fullViewTask.id,
                  listId: fullViewTask.listId ?? "",
                  areaId: fullViewTask.areaId ?? null,
                  versionId: null,
                });
                setMoveTaskDialogOpen(true);
              }
            : undefined
        }
        onCopyToVersion={
          fullViewTask &&
          selectedProject &&
          hasVersions(selectedProject.project_type) &&
          !currentSelectedVersionFrozen
            ? () => {
                setTaskToCopy({
                  taskId: fullViewTask.id,
                  listId: fullViewTask.listId ?? "",
                  areaId: fullViewTask.areaId ?? null,
                  versionId: versionSelection.versionId ?? null,
                });
                setCopyTaskDialogOpen(true);
              }
            : undefined
        }
      />

      {selectedProject && hasVersions(selectedProject.project_type) ? (
        <>
          <ProjectVersionDialog
            open={versionDialogOpen}
            onOpenChange={setVersionDialogOpen}
            version={editingVersion}
            saving={versionSaving}
            onSave={handleSaveProjectVersion}
            onArchive={editingVersion ? handleArchiveProjectVersion : undefined}
          />
          <ProjectPublishVersionDialog
            open={publishVersionOpen}
            onOpenChange={setPublishVersionOpen}
            version={currentSelectedVersion}
            versions={projectVersions}
            saving={versionActionSaving}
            onPublish={handlePublishProjectVersion}
          />
          <ProjectDuplicateVersionDialog
            open={duplicateVersionOpen}
            onOpenChange={setDuplicateVersionOpen}
            version={currentSelectedVersion}
            saving={versionActionSaving}
            onDuplicate={handleDuplicateProjectVersion}
          />
          <MoveProjectTaskDialog
            open={moveTaskDialogOpen}
            onOpenChange={setMoveTaskDialogOpen}
            versions={projectVersions}
            areas={selectedProject.areas ?? []}
            lists={selectedProject.lists}
            currentListId={taskToMove?.listId ?? ""}
            currentAreaId={taskToMove?.areaId}
            currentVersionId={taskToMove?.versionId}
            saving={moveTaskSaving}
            onMove={handleMoveProjectTask}
          />
          <CopyProjectTaskDialog
            open={copyTaskDialogOpen}
            onOpenChange={setCopyTaskDialogOpen}
            versions={projectVersions}
            areas={selectedProject.areas ?? []}
            lists={selectedProject.lists}
            currentListId={taskToCopy?.listId ?? ""}
            currentAreaId={taskToCopy?.areaId}
            currentVersionId={taskToCopy?.versionId}
            saving={copyTaskSaving}
            onCopy={handleCopyProjectTask}
          />
        </>
      ) : null}
      
      {selectedProject && (
        <>
          <ProjectSettingsDialog
            open={projectSettingsOpen}
            onOpenChange={setProjectSettingsOpen}
            project={selectedProject}
            members={members}
            canDeleteProject={user?.can_manage_plan === true || user?.is_super_admin === true}
            onDeleteProject={async () => {
              await projectsService.deleteProject(selectedProject.id);
              setProjects(projects.filter((p) => p.id !== selectedProject.id));
              setSelectedProject(null);
              setViewMode("list");
              toast.success("Projeto excluído.");
            }}
            teams={teams}
            onSave={async (updatedProject) => {
              setProjects(projects.map(p => 
                p.id === selectedProject.id 
                  ? { ...p, ...updatedProject }
                  : p
              ));
              setSelectedProject({ ...selectedProject, ...updatedProject } as Project);
              try {
                await projectsService.updateProject(selectedProject.id, {
                  name: updatedProject.name,
                  description: updatedProject.description ?? null,
                  status: updatedProject.status,
                  due_date: updatedProject.dueDate ?? null,
                  team_id: updatedProject.team_id ?? null,
                  responsible_ids: updatedProject.responsible_ids,
                  team_ids: updatedProject.team_ids,
                });
              } catch (e) {
                console.error(e);
                toast.error("Erro ao salvar configurações no servidor.");
              }
            }}
          />
          
          <SaveAsTemplateDialog
            open={saveAsTemplateOpen}
            onOpenChange={setSaveAsTemplateOpen}
            project={selectedProject}
          />
        </>
      )}

      <Dialog open={projectsCsvImportDialogOpen} onOpenChange={setProjectsCsvImportDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importação de projetos (CSV)</DialogTitle>
            <DialogDescription>Resumo do ficheiro enviado.</DialogDescription>
          </DialogHeader>
          {projectsCsvImportSummary ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{projectsCsvImportSummary.created}</span>{" "}
                projeto(s) criado(s).
              </p>
              {projectsCsvImportSummary.warnings.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Avisos</p>
                  <ScrollArea className="mt-1 h-[220px] rounded-md border p-3 sm:h-[260px]">
                    <ul className="list-inside list-disc space-y-1 pr-3 text-xs text-muted-foreground">
                      {projectsCsvImportSummary.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              ) : null}
              {projectsCsvImportSummary.failed.length > 0 ? (
                <ScrollArea className="h-[200px] rounded-md border p-3">
                  <ul className="space-y-1.5 text-xs">
                    {projectsCsvImportSummary.failed.map((f, i) => (
                      <li key={`${f.line}-${i}`}>
                        Linha {f.line}: {f.message}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setProjectsCsvImportDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tasksXlsxImportDialogOpen} onOpenChange={setTasksXlsxImportDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importação de tarefas (Excel ou CSV)</DialogTitle>
            <DialogDescription>
              As tarefas foram adicionadas à etapa em que escolheu importar.
            </DialogDescription>
          </DialogHeader>
          {tasksXlsxImportSummary ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{tasksXlsxImportSummary.created}</span>{" "}
                tarefa(s) criada(s).
              </p>
              {tasksXlsxImportSummary.warnings.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Avisos</p>
                  <ScrollArea className="mt-1 h-[220px] rounded-md border p-3 sm:h-[260px]">
                    <ul className="list-inside list-disc space-y-1 pr-3 text-xs text-muted-foreground">
                      {tasksXlsxImportSummary.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              ) : null}
              {tasksXlsxImportSummary.failed.length > 0 ? (
                <ScrollArea className="h-[200px] rounded-md border p-3">
                  <ul className="space-y-1.5 text-xs">
                    {tasksXlsxImportSummary.failed.map((f, i) => (
                      <li key={`${f.line}-${i}`}>
                        Linha {f.line}: {f.message}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setTasksXlsxImportDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Projects;
