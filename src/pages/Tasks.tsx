
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  CheckCircle,
  User,
  Circle,
  CheckSquare,
  MoreHorizontal,
  X,
  Edit,
  FileText,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { tasksService, Task, ChecklistItem, taskLooksCompleted } from "@/services/tasks";
import { getMyTenantUsers } from "@/services/tenantLimits";
import { clientsService, Client } from "@/services/clients";
import { Skeleton } from "@/components/ui/skeleton";
import {
  tasksInfiniteListQueryKey,
  tasksSummaryQueryKey,
  invalidateTenantUserTasksQueries,
  type TasksListFilterKey,
} from "@/lib/queryKeys/tasks";
import {
  UnifiedTaskCard,
  TaskSummaryPopover,
  TaskFullView,
  TaskFormDialog,
  TasksKanbanBoard,
} from "@/components/tasks";
import { projectsService } from "@/services/projects";
import { globalTaskToUnified, type UnifiedTask } from "@/lib/taskUnified";
import { SystemRichEditor, SystemRichEditorReadOnly } from "@/components/editor";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { resolveTasksGranularFromLegacy } from "@/permissions/permissionCatalog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClientEntityLink } from "@/components/entities";
import {
  mapKanbanColumnToClientLeadStatus,
  mapKanbanColumnToProjectStatus,
  mapKanbanColumnToStandaloneStatus,
  type KanbanColumnId,
} from "@/utils/tasksKanbanStatus";

const TASKS_VIEW_MODE_KEY = "tasks_view_mode";
const TASKS_PAGE_SIZE = 50;

function taskLooksPending(task: Pick<Task, "status" | "normalized_status">) {
  return !taskLooksCompleted(task);
}

function originBadgeLabel(task: Task): string {
  const o = task.origin;
  if (!o || o === "standalone") return "Avulsa";
  if (o === "project") return task.project_name ? `Projeto: ${task.project_name}` : "Projeto";
  if (o === "client") return task.client_name ? `Cliente: ${task.client_name}` : "Cliente";
  if (o === "lead") return task.lead_name ? `Lead: ${task.lead_name}` : "Lead";
  return "Avulsa";
}

const Tasks = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState<{ id: string; name: string }[]>([]);

  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [taskTab, setTaskTab] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dueFilter, setDueFilter] = useState("");

  const { permissions } = useModulePermissions();
  const tasksG = useMemo(() => resolveTasksGranularFromLegacy(permissions), [permissions]);

  const [listScope, setListScope] = useState<string | undefined>(undefined);
  const [originFilter, setOriginFilter] = useState<string | undefined>(undefined);

  const scopeForApi = listScope ?? (tasksG.view_all ? "todas" : "minhas");

  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const userId = user?.id ?? "";

  const listFilters: TasksListFilterKey = useMemo(
    () => ({
      scope: scopeForApi,
      origin: originFilter ?? "",
      q: debouncedSearch,
      due: dueFilter,
      sort: "due",
    }),
    [scopeForApi, originFilter, debouncedSearch, dueFilter],
  );

  const invalidateTasksCache = useCallback(() => {
    if (!tenantId || !userId) return;
    invalidateTenantUserTasksQueries(queryClient, tenantId, userId);
  }, [queryClient, tenantId, userId]);

  const {
    data: tasksInfiniteData,
    isPending: tasksLoading,
    isFetching: tasksFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: tasksInfiniteListQueryKey(tenantId, userId, listFilters),
    queryFn: async ({ pageParam }) => {
      const rows = await tasksService.getTasks({
        scope: scopeForApi,
        ...(originFilter ? { origin: originFilter } : {}),
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
        ...(dueFilter ? { due: dueFilter } : {}),
        sort: "due",
        limit: TASKS_PAGE_SIZE,
        offset: pageParam,
      });
      return rows.map((t: Task) => ({ ...t, date: t.date || "" }));
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastOffset) => {
      if (!lastPage.length || lastPage.length < TASKS_PAGE_SIZE) return undefined;
      return lastOffset + TASKS_PAGE_SIZE;
    },
    enabled: Boolean(tenantId && userId),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });

  const tasks = useMemo(
    () => tasksInfiniteData?.pages.flatMap((p) => p) ?? [],
    [tasksInfiniteData],
  );

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "task-picker", tenantId, userId],
    queryFn: () => clientsService.getClients(),
    enabled: Boolean(tenantId && userId),
    staleTime: 120_000,
  });

  const { data: tasksSummary } = useQuery({
    queryKey: tasksSummaryQueryKey(tenantId, userId),
    queryFn: () => tasksService.getTasksSummary(),
    enabled: Boolean(tenantId && userId),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  useEffect(() => {
    getMyTenantUsers()
      .then((users) =>
        setAssigneeOptions(
          users.map((u) => ({
            id: u.id,
            name: u.full_name?.trim() || u.email || u.id,
          }))
        )
      )
      .catch(() => setAssigneeOptions([]));
  }, []);

  useEffect(() => {
    try {
      const v = localStorage.getItem(TASKS_VIEW_MODE_KEY);
      if (v === "kanban" || v === "list") setViewMode(v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TASKS_VIEW_MODE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(id);
  }, [searchInput]);

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
    if (!tid || !tenantId || !userId || tasksLoading) return;
    const t = tasks.find((x) => x.id === tid);
    if (t) {
      setFullViewTask(globalTaskToUnified(t));
    } else if (tasks.length > 0) {
      clearTaskQuery();
    }
  }, [searchParams, tasks, tasksLoading, clearTaskQuery, tenantId, userId]);

  
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

  const [fullViewTask, setFullViewTask] = useState<UnifiedTask | null>(null);

  const taskParticipant = useCallback((task: Task, uid: string | undefined) => {
    if (!uid) return false;
    return (
      task.user_id === uid || (task.assignee_id != null && task.assignee_id === uid)
    );
  }, []);

  const canEditTask = useCallback(
    (task: Task) => {
      if (!tasksG.edit) return false;
      if (!tasksG.edit_own) return true;
      return taskParticipant(task, user?.id);
    },
    [tasksG.edit, tasksG.edit_own, taskParticipant, user?.id]
  );

  const canDeleteTask = useCallback(
    (task: Task) =>
      task.origin != null &&
      task.origin !== "standalone"
        ? false
        : tasksG.delete && (!tasksG.delete_own || taskParticipant(task, user?.id)),
    [tasksG.delete, tasksG.delete_own, taskParticipant, user?.id]
  );

  const kanbanMoveBlockedReason = useCallback(
    (task: Task): string | null => {
      if (!canEditTask(task)) return "Sem permissão para editar esta tarefa.";
      return null;
    },
    [canEditTask]
  );

  const handleToggleTaskStatus = async (taskId: string) => {
    try {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if (!canEditTask(task)) {
        toast.error("Sem permissão para alterar esta tarefa.");
        return;
      }

      const becomingDone = !taskLooksCompleted(task);
      const o = task.origin ?? "standalone";

      if (o === "standalone") {
        const newStatus = becomingDone ? "completed" : "pending";
        const updatedTask = await tasksService.updateTask(taskId, { status: newStatus });
        const normalized = { ...updatedTask, date: updatedTask.date || "" };
        if (selectedTask?.id === taskId) setSelectedTask(normalized);
        invalidateTasksCache();
        toast.success(becomingDone ? "Tarefa concluída!" : "Tarefa reaberta.");
        return;
      }

      if (o === "project") {
        await projectsService.updateProjectTask(taskId, {
          status: becomingDone ? "done" : "todo",
        });
        invalidateTasksCache();
        toast.success(becomingDone ? "Tarefa concluída!" : "Tarefa reaberta.");
        return;
      }

      if (o === "client") {
        await clientsService.updateClientTask(taskId, {
          status: becomingDone ? "Concluído" : "Pendente",
        });
        invalidateTasksCache();
        toast.success(becomingDone ? "Tarefa concluída!" : "Tarefa reaberta.");
        return;
      }

      if (o === "lead") {
        await tasksService.updateLeadTask(taskId, {
          status: becomingDone ? "Concluído" : "Pendente",
        });
        invalidateTasksCache();
        toast.success(becomingDone ? "Tarefa concluída!" : "Tarefa reaberta.");
      }
    } catch (error) {
      console.error("Erro ao atualizar status da tarefa:", error);
      toast.error("Erro ao atualizar tarefa");
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
      status: taskLooksCompleted(task) ? "completed" : "pending",
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
    if (!canEditTask(selectedTask)) {
      toast.error("Sem permissão para editar esta tarefa.");
      return;
    }

    const updatedChecklist = selectedTask.checklist?.map(item => 
      item.id === itemId ? { ...item, completed: !item.completed } : item
    ) || [];
    
    // Verificar se todos os itens estão completos
    const allCompleted = updatedChecklist.length > 0 && 
                         updatedChecklist.every(item => item.completed);
    
    try {
      const updatedTask = await tasksService.updateTask(selectedTask.id, {
        checklist: updatedChecklist,
        status: allCompleted
          ? "completed"
          : taskLooksCompleted(selectedTask)
            ? "completed"
            : "pending",
      });
      
      const formattedTask = { ...updatedTask, date: updatedTask.date || "" };
      setSelectedTask(formattedTask);
      invalidateTasksCache();

    // Notificar se todos os itens foram concluídos
    if (allCompleted && !taskLooksCompleted(selectedTask)) {
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
    if (!canEditTask(selectedTask)) {
      toast.error("Sem permissão para editar esta tarefa.");
      return;
    }

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
      invalidateTasksCache();
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
    if (!canEditTask(selectedTask)) {
      toast.error("Sem permissão para editar esta tarefa.");
      return;
    }

    const updatedChecklist = selectedTask.checklist.filter(item => item.id !== itemId);
    
    try {
      const updatedTask = await tasksService.updateTask(selectedTask.id, {
        checklist: updatedChecklist,
      });
      
      const formattedTask = { ...updatedTask, date: updatedTask.date || "" };
      setSelectedTask(formattedTask);
      invalidateTasksCache();
    toast.success("Item removido da lista de verificação");
    } catch (error) {
      console.error("Erro ao remover item do checklist:", error);
      toast.error("Erro ao remover item");
    }
  };

  const saveTaskEdits = async () => {
    if (!selectedTask) return;
    if (!canEditTask(selectedTask)) {
      toast.error("Sem permissão para editar esta tarefa.");
      return;
    }
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
      invalidateTasksCache();
    setSelectedTask(updatedTask);
      setIsEditingTask(false);
      toast.success("Tarefa atualizada com sucesso!");
    } catch (error) {
      console.error("Erro ao atualizar tarefa:", error);
      toast.error("Não foi possível atualizar a tarefa");
    }
  };

  const filteredByTab = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    switch (taskTab) {
      case "today":
        return tasks.filter((task) => task.date === today && taskLooksPending(task));
      case "upcoming":
        return tasks.filter(
          (task) => !!task.date && task.date > today && taskLooksPending(task)
        );
      case "completed":
        return tasks.filter((task) => taskLooksCompleted(task));
      default:
        /** “Todas”: só não concluídas — concluídas ficam só na aba Concluídas. */
        return tasks.filter((task) => !taskLooksCompleted(task));
    }
  }, [tasks, taskTab]);

  const handleKanbanMove = async (taskId: string, column: KanbanColumnId) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (!canEditTask(task)) {
      toast.error("Sem permissão para editar esta tarefa.");
      return;
    }
    try {
      const o = task.origin ?? "standalone";
      if (o === "standalone") {
        await tasksService.updateTask(taskId, {
          status: mapKanbanColumnToStandaloneStatus(column),
        });
      } else if (o === "project") {
        await projectsService.updateProjectTask(taskId, {
          status: mapKanbanColumnToProjectStatus(column),
        });
      } else if (o === "client") {
        await clientsService.updateClientTask(taskId, {
          status: mapKanbanColumnToClientLeadStatus(column),
        });
      } else if (o === "lead") {
        await tasksService.updateLeadTask(taskId, {
          status: mapKanbanColumnToClientLeadStatus(column),
        });
      }
      invalidateTasksCache();
      toast.success("Status atualizado");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o status");
    }
  };

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
    const row = tasks.find((t) => t.id === taskId);
    if (!row || !canEditTask(row)) {
      toast.error("Sem permissão para editar esta tarefa.");
      return;
    }
    try {
      const toApiStatus = (): "pending" | "completed" => {
        if (updates.status !== undefined) {
          const s = String(updates.status).toLowerCase();
          return s === "completed" ? "completed" : "pending";
        }
        return fullViewTask.status === "completed" ? "completed" : "pending";
      };
      const payload: Partial<Task> = {
        title:
          updates.title !== undefined ? String(updates.title) : fullViewTask.title,
        description:
          updates.description !== undefined
            ? ((updates.description as string | null) ?? undefined)
            : fullViewTask.description ?? undefined,
        date:
          updates.due_date !== undefined
            ? (updates.due_date as string | null)
            : fullViewTask.dueDate ?? null,
        time:
          updates.due_time !== undefined
            ? (updates.due_time as string | null)
            : fullViewTask.dueTime ?? null,
        status: toApiStatus(),
        priority:
          updates.priority !== undefined
            ? (updates.priority as Task["priority"])
            : fullViewTask.priority,
        client:
          updates.client_name !== undefined
            ? (updates.client_name as string | null)
            : fullViewTask.clientName ?? null,
        deal:
          updates.deal !== undefined
            ? (updates.deal as string | null)
            : fullViewTask.deal ?? null,
        assignee_id:
          updates.assignee_id !== undefined
            ? (updates.assignee_id as string | null)
            : fullViewTask.assigneeId ?? null,
        assignee:
          updates.assignee_name !== undefined
            ? (updates.assignee_name as string | null)
            : fullViewTask.assigneeName ?? null,
        checklist:
          updates.checklist !== undefined
            ? (updates.checklist as ChecklistItem[])
            : fullViewTask.checklist ?? [],
      };
      const updatedTask = await tasksService.updateTask(taskId, payload);
      const normalized = { ...updatedTask, date: updatedTask.date || "" };
      invalidateTasksCache();
      setFullViewTask(globalTaskToUnified(updatedTask));
      if (selectedTask?.id === taskId) setSelectedTask(normalized);
      toast.success("Tarefa atualizada");
    } catch (error) {
      console.error("Erro ao atualizar tarefa:", error);
      toast.error("Não foi possível atualizar a tarefa");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const row = tasks.find((t) => t.id === taskId);
    if (!row || !canDeleteTask(row)) {
      toast.error("Sem permissão para excluir esta tarefa.");
      return;
    }
    try {
      await tasksService.deleteTask(taskId);
      invalidateTasksCache();
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

  const fullViewBackTask = useMemo(
    () => (fullViewTask ? tasks.find((t) => t.id === fullViewTask.id) : undefined),
    [fullViewTask, tasks]
  );

  if (!tenantId || !userId) {
    return (
      <div className="flex items-center justify-center p-10">
        <p className="text-muted-foreground">A carregar sessão…</p>
      </div>
    );
  }

  if (tasksLoading && tasks.length === 0) {
    return (
      <div className="space-y-4 p-4 md:p-0">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {tasksFetching && tasks.length > 0 ? (
        <div className="h-0.5 w-full overflow-hidden rounded bg-muted" aria-hidden>
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}
      {tasksG.view_own && !tasksG.view_all ? (
        <Alert className="border-primary/30 bg-primary/5">
          <AlertDescription className="text-sm">
            Você está vendo tarefas criadas ou atribuídas a você.
          </AlertDescription>
        </Alert>
      ) : null}
      {tasksSummary ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">Minhas (total)</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0">
              <p className="text-2xl font-semibold tabular-nums">{tasksSummary.mine_total}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">Atrasadas</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0">
              <p className="text-2xl font-semibold tabular-nums text-destructive">{tasksSummary.overdue}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">Hoje</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0">
              <p className="text-2xl font-semibold tabular-nums">{tasksSummary.due_today}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">Esta semana</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0">
              <p className="text-2xl font-semibold tabular-nums">{tasksSummary.due_this_week}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}
      <div className="md:hidden sticky top-0 z-30 -mx-0.5 border-b border-border/70 bg-background/95 px-0.5 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <MobilePageHeader
          title="Tarefas"
          primaryAction={
            tasksG.create
              ? {
                  label: "Nova tarefa",
                  icon: <Plus className="h-4 w-4" aria-hidden />,
                  onClick: () => setIsAddTaskDialogOpen(true),
                }
              : undefined
          }
        />
      </div>
      <div className="hidden md:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">Tarefas</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
            <Button
              type="button"
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="gap-1"
              onClick={() => setViewMode("list")}
            >
              <ListIcon className="h-4 w-4" />
              Lista
            </Button>
            <Button
              type="button"
              variant={viewMode === "kanban" ? "default" : "ghost"}
              size="sm"
              className="gap-1"
              onClick={() => setViewMode("kanban")}
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </Button>
          </div>
          {tasksG.create ? (
            <Button type="button" onClick={() => setIsAddTaskDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Tarefa
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex md:hidden justify-end -mx-0.5 px-0.5 pb-2">
        <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
          <Button
            type="button"
            variant={viewMode === "list" ? "default" : "ghost"}
            size="icon"
            className="h-9 w-9"
            aria-label="Lista"
            onClick={() => setViewMode("list")}
          >
            <ListIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "kanban" ? "default" : "ghost"}
            size="icon"
            className="h-9 w-9"
            aria-label="Kanban"
            onClick={() => setViewMode("kanban")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <TaskFormDialog
        open={isAddTaskDialogOpen}
        onOpenChange={setIsAddTaskDialogOpen}
        context={{ origin: "standalone" }}
        canSubmit={tasksG.create}
        onSuccess={(r) => {
          if (r.origin === "standalone") {
            invalidateTasksCache();
          }
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5 min-w-[200px]">
          <Label className="text-xs text-muted-foreground">Escopo</Label>
          <Select
            value={listScope ?? (tasksG.view_all ? "todas" : "minhas")}
            onValueChange={(v) => setListScope(v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escopo" />
            </SelectTrigger>
            <SelectContent>
              {tasksG.view_all ? <SelectItem value="todas">Todas (equipe)</SelectItem> : null}
              <SelectItem value="minhas">Minhas (criadas ou atribuídas)</SelectItem>
              <SelectItem value="atribuidas">Atribuídas a mim</SelectItem>
              <SelectItem value="criadas">Criadas por mim</SelectItem>
              <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-[200px]">
          <Label className="text-xs text-muted-foreground">Origem</Label>
          <Select
            value={originFilter ?? "all"}
            onValueChange={(v) => setOriginFilter(v === "all" ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              <SelectItem value="standalone">Avulsas</SelectItem>
              <SelectItem value="project">Projetos</SelectItem>
              <SelectItem value="client">Clientes</SelectItem>
              <SelectItem value="lead">Leads</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-[200px] flex-1 max-w-md">
          <Label className="text-xs text-muted-foreground">Busca</Label>
          <Input
            placeholder="Título ou descrição…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[180px]">
          <Label className="text-xs text-muted-foreground">Prazo</Label>
          <Select
            value={dueFilter || "all"}
            onValueChange={(v) => setDueFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Prazo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Esta semana</SelectItem>
              <SelectItem value="overdue">Atrasadas</SelectItem>
              <SelectItem value="none">Sem prazo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1 w-full max-w-full overflow-x-auto">
          {[
            { id: "all", label: "Todas" },
            { id: "today", label: "Hoje" },
            { id: "upcoming", label: "Próximas" },
            { id: "completed", label: "Concluídas" },
          ].map((tab) => (
            <Button
              key={tab.id}
              type="button"
              variant={taskTab === tab.id ? "default" : "ghost"}
              size="sm"
              className="rounded-md shrink-0"
              onClick={() => setTaskTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {viewMode === "list" ? (
          <TaskList
            tasks={filteredByTab}
            onToggleTaskStatus={handleToggleTaskStatus}
            getPriorityColor={getPriorityColor}
            onTaskClick={openTaskDetail}
            onOpenFull={setFullViewTask}
            canEditTask={canEditTask}
          />
        ) : (
          <TasksKanbanBoard
            tasks={filteredByTab}
            onMoveTask={handleKanbanMove}
            canMoveTask={canEditTask}
            moveBlockedReason={kanbanMoveBlockedReason}
            onOpenTask={(t) => setFullViewTask(globalTaskToUnified(t))}
          />
        )}
        {hasNextPage ? (
          <div className="flex justify-center pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              {isFetchingNextPage ? "A carregar…" : "Carregar mais"}
            </Button>
          </div>
        ) : null}
      </div>

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
        assigneeOptions={assigneeOptions}
        onUpdate={
          fullViewBackTask && canEditTask(fullViewBackTask) ? handleFullViewUpdate : undefined
        }
        onDelete={
          fullViewBackTask && canDeleteTask(fullViewBackTask) ? handleDeleteTask : undefined
        }
        onToggleStatus={
          fullViewTask && fullViewBackTask && canEditTask(fullViewBackTask)
            ? (taskId) => {
                handleToggleTaskStatus(taskId);
                setFullViewTask((prev) =>
                  prev && prev.id === taskId
                    ? {
                        ...prev,
                        status: prev.status === "completed" ? "todo" : "completed",
                      }
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
                  checked={taskLooksCompleted(selectedTask)} 
                  onCheckedChange={() => handleToggleTaskStatus(selectedTask.id)}
                  disabled={!canEditTask(selectedTask)}
                  className="mr-1"
                />
                <DialogTitle className={cn({"line-through opacity-70": taskLooksCompleted(selectedTask)})}>
                  {selectedTask.title}
                </DialogTitle>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="secondary">{originBadgeLabel(selectedTask)}</Badge>
                {selectedTask.client && (
                  <Badge variant="outline" className="gap-1 text-xs font-normal">
                    <span className="text-muted-foreground">Cliente:</span>
                    {selectedTask.clientId ? (
                      <ClientEntityLink
                        clientId={selectedTask.clientId}
                        name={selectedTask.client}
                        variant="compact"
                        className="text-xs font-normal"
                      />
                    ) : (
                      <span>{selectedTask.client}</span>
                    )}
                  </Badge>
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
                        disabled={!canEditTask(selectedTask)}
                        className="mr-2"
                      />
                      <span className={cn("flex-1 text-sm", {"line-through text-muted-foreground": item.completed})}>
                        {item.text}
                      </span>
                      {canEditTask(selectedTask) ? (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0" 
                        onClick={() => removeChecklistItem(item.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      ) : null}
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
                    disabled={!canEditTask(selectedTask)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newChecklistItem.trim()) {
                        addChecklistItem();
                      }
                    }}
                  />
                  <Button onClick={addChecklistItem} disabled={!newChecklistItem.trim() || !canEditTask(selectedTask)}>
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
                    {canEditTask(selectedTask) ? (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIsEditingTask(true)}
                    >
                      Editar tarefa
                    </Button>
                    ) : null}
                    {canEditTask(selectedTask) ? (
                    <Button 
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleToggleTaskStatus(selectedTask.id)}
                    >
                      {taskLooksCompleted(selectedTask) ? "Marcar como pendente" : "Marcar como concluída"}
                    </Button>
                    ) : null}
                    {canDeleteTask(selectedTask) ? (
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => handleDeleteTask(selectedTask.id)}
                    >
                      Excluir tarefa
                    </Button>
                    ) : null}
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
  canEditTask?: (task: Task) => boolean;
};

const TaskList = ({
  tasks,
  onToggleTaskStatus,
  getPriorityColor,
  onTaskClick,
  onOpenFull,
  canEditTask: canEditTaskProp,
}: TaskListProps) => {
  const allowEdit = canEditTaskProp ?? (() => true);
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
              <div className="space-y-1">
                <Badge variant="secondary" className="text-[11px] font-normal">
                  {originBadgeLabel(task)}
                </Badge>
                <UnifiedTaskCard
                  task={unified}
                  onToggleStatus={
                    allowEdit(task) ? () => onToggleTaskStatus(task.id) : undefined
                  }
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
            {"opacity-80": taskLooksCompleted(task) }
          )}
          onClick={() => onTaskClick(task)}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <Checkbox 
                checked={taskLooksCompleted(task)} 
                onCheckedChange={() => onToggleTaskStatus(task.id)}
                disabled={!allowEdit(task)}
                className="mt-1"
                onClick={(e) => {
                  // Evita que o clique do checkbox propague e abra o modal de detalhes
                  e.stopPropagation();
                }}
              />
              
              <div className="flex-1">
                <Badge variant="secondary" className="mb-2 text-[11px] font-normal">
                  {originBadgeLabel(task)}
                </Badge>
                <div className="flex items-center justify-between mb-1">
                  <h3 className={cn("font-medium", {"line-through opacity-70": taskLooksCompleted(task)})}>
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
                  <p className={cn("text-sm text-muted-foreground mb-3", {"line-through opacity-70": taskLooksCompleted(task)})}>
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
                      <Badge variant="outline" className="gap-1 text-xs">
                        <span className="text-muted-foreground">Cliente:</span>
                        {task.clientId ? (
                          <ClientEntityLink
                            clientId={task.clientId}
                            name={task.client}
                            variant="compact"
                            className="text-xs"
                            stopPropagationOnClick
                          />
                        ) : (
                          <span>{task.client}</span>
                        )}
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
