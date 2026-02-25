import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Kanban, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { BoardView } from "@/components/projects/BoardView";
import { TaskListView } from "@/components/projects/TaskListView";
import { TaskDetailDialog } from "@/components/projects/TaskDetailDialog";
import { NewTaskDialog } from "@/components/projects/NewTaskDialog";
import { ProjectList, Task, TaskStatus } from "@/components/projects/types";
import { ProjectArea } from "@/components/projects/types";
import { projectsService } from "@/services/projects";
import { membersService } from "@/services/members";
import { Member } from "@/components/shared/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

export default function ProjectAreaPage() {
  const { projectId, areaId } = useParams<{ projectId: string; areaId: string }>();
  const navigate = useNavigate();
  const [area, setArea] = useState<ProjectArea | null>(null);
  const [projectName, setProjectName] = useState("");
  const [lists, setLists] = useState<ProjectList[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("board");
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<{ task: Task; listId: string } | null>(null);
  const [editingTask, setEditingTask] = useState(false);
  const [newChecklistItemText, setNewChecklistItemText] = useState("");
  const [tagsInput, setTagsInput] = useState<string[]>([]);
  const [newTagText, setNewTagText] = useState("");
  const [hideCompletedTasks, setHideCompletedTasks] = useState(false);

  useEffect(() => {
    if (!projectId || !areaId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [project, apiLists, areaTasks, membersData] = await Promise.all([
          projectsService.getProjectById(projectId),
          projectsService.getProjectLists(projectId),
          projectsService.getProjectTasksByArea(projectId, areaId),
          membersService.getMembers(),
        ]);
        setProjectName(project.name);
        setMembers(membersData || []);
        const foundArea = (project.areas || []).find((a: ProjectArea) => a.id === areaId);
        setArea(foundArea || null);

        const listsWithTasks: ProjectList[] = apiLists.map((apiList) => {
          const listTasks = areaTasks.filter((t: any) => t.list_id === apiList.id);
          const tasks: Task[] = listTasks.map((apiTask: any) => ({
            id: apiTask.id,
            title: apiTask.title,
            description: apiTask.description || "",
            status: apiTask.status as TaskStatus,
            priority: apiTask.priority as any,
            dueDate: apiTask.due_date || undefined,
            assignee: apiTask.assignee_id ? membersData?.find((m) => m.id === apiTask.assignee_id) : undefined,
            tags: apiTask.tags || [],
            checklist: (apiTask.checklist || []).map((item: any, index: number) => ({
              id: item.id || `checklist-${index}`,
              text: item.text || item.title || "",
              completed: item.completed || false,
            })),
          }));
          return {
            id: apiList.id,
            name: apiList.name,
            tasks,
            order: apiList.order_position,
          };
        });
        setLists(listsWithTasks);
      } catch (e) {
        console.error(e);
        toast.error("Erro ao carregar área");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, areaId]);

  const refreshTasks = async () => {
    if (!projectId || !areaId) return;
    try {
      const areaTasks = await projectsService.getProjectTasksByArea(projectId, areaId);
      const apiLists = await projectsService.getProjectLists(projectId);
      const listsWithTasks: ProjectList[] = apiLists.map((apiList) => {
        const listTasks = areaTasks.filter((t: any) => t.list_id === apiList.id);
        const tasks: Task[] = listTasks.map((apiTask: any) => ({
          id: apiTask.id,
          title: apiTask.title,
          description: apiTask.description || "",
          status: apiTask.status as TaskStatus,
          priority: apiTask.priority as any,
          dueDate: apiTask.due_date || undefined,
          assignee: apiTask.assignee_id ? members.find((m) => m.id === apiTask.assignee_id) : undefined,
          tags: apiTask.tags || [],
          checklist: (apiTask.checklist || []).map((item: any, index: number) => ({
            id: item.id || `checklist-${index}`,
            text: item.text || item.title || "",
            completed: item.completed || false,
          })),
        }));
        return { id: apiList.id, name: apiList.name, tasks, order: apiList.order_position };
      });
      setLists(listsWithTasks);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredLists = hideCompletedTasks
    ? lists.map((list) => ({
        ...list,
        tasks: list.tasks.filter((t) => t.status !== "completed"),
      }))
    : lists;

  const handleCreateTask = async (formData: FormData) => {
    if (!selectedListId || !areaId) return;
    try {
      const title = formData.get("title") as string;
      const description = formData.get("description") as string;
      const priority = (formData.get("priority") as string) || "medium";
      const dueDate = formData.get("dueDate") as string;
      const assigneeId = formData.get("assignee") as string;
      const tagsJson = formData.get("tags") as string;
      const tags = tagsJson ? JSON.parse(tagsJson) : [];
      await projectsService.createProjectTask(selectedListId, {
        title,
        description: description || null,
        status: "todo",
        priority,
        due_date: dueDate || null,
        assignee_id: assigneeId || null,
        tags: tags || [],
        checklist: [],
        area_id: areaId,
      });
      toast.success("Tarefa criada com sucesso!");
      setNewTaskDialogOpen(false);
      refreshTasks();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao criar tarefa");
    }
  };

  const toggleTaskStatus = async (listId: string, taskId: string) => {
    const list = lists.find((l) => l.id === listId);
    const task = list?.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newStatus = task.status === "completed" ? "todo" : "completed";
    try {
      await projectsService.updateProjectTask(taskId, { status: newStatus });
      refreshTasks();
    } catch (e) {
      toast.error("Erro ao atualizar tarefa");
    }
  };

  const moveTask = async (taskId: string, sourceListId: string, targetListId: string) => {
    try {
      await projectsService.updateProjectTask(taskId, { list_id: targetListId } as any);
      refreshTasks();
    } catch (e) {
      toast.error("Erro ao mover tarefa");
    }
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    try {
      await projectsService.updateProjectTask(taskId, {
        title: updates.title,
        description: updates.description ?? undefined,
        status: updates.status,
        priority: updates.priority,
        due_date: updates.dueDate ?? undefined,
        assignee_id: (updates.assignee as any)?.id ?? undefined,
        tags: updates.tags,
      });
      toast.success("Tarefa atualizada");
      setEditingTask(false);
      refreshTasks();
    } catch (e) {
      toast.error("Erro ao atualizar tarefa");
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await projectsService.deleteProjectTask(taskId);
      setTaskDetailOpen(false);
      setSelectedTask(null);
      toast.success("Tarefa excluída");
      refreshTasks();
    } catch (e) {
      toast.error("Erro ao excluir tarefa");
    }
  };

  const totalTasks = lists.reduce((acc, list) => acc + list.tasks.length, 0);
  const completedTasks = lists.reduce(
    (acc, list) => acc + list.tasks.filter((t) => t.status === "completed").length,
    0
  );
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Carregando área...</p>
      </div>
    );
  }

  if (!area) {
    return (
      <div className="p-6">
        <p className="text-destructive">Área não encontrada.</p>
        <Button variant="outline" className="mt-2" onClick={() => navigate("/projects", { state: projectId ? { openProjectId: projectId } : undefined })}>
          Voltar
        </Button>
      </div>
    );
  }

  const goToProjectHome = () => {
    navigate("/projects", { state: { openProjectId: projectId } });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={goToProjectHome}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <Button variant="ghost" size="sm" onClick={goToProjectHome}>
          {projectName}
        </Button>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-semibold">{area.name}</h1>
      </div>

      <div className="rounded-lg border p-4 bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Progresso da área</span>
          <span className="text-sm text-muted-foreground">
            {completedTasks}/{totalTasks} tarefas
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="board">
              <Kanban className="h-4 w-4 mr-2" />
              Etapas
            </TabsTrigger>
            <TabsTrigger value="list">
              <ClipboardList className="h-4 w-4 mr-2" />
              Tarefas
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideCompletedTasks}
            onChange={(e) => setHideCompletedTasks(e.target.checked)}
          />
          Ocultar concluídas
        </label>
      </div>

      {activeTab === "board" && (
        <BoardView
          lists={filteredLists}
          onToggleTaskStatus={toggleTaskStatus}
          onTaskClick={(task, listId) => {
            setSelectedTask({ task, listId });
            setTaskDetailOpen(true);
          }}
          onAddTask={(listId) => {
            setSelectedListId(listId);
            setNewTaskDialogOpen(true);
          }}
          onEditList={() => {}}
          onDeleteList={() => {}}
          onAddList={() => {}}
          onMoveTask={moveTask}
        />
      )}
      {activeTab === "list" && (
        <TaskListView
          lists={filteredLists}
          onToggleTaskStatus={toggleTaskStatus}
          onTaskClick={(task, listId) => {
            setSelectedTask({ task, listId });
            setTaskDetailOpen(true);
          }}
        />
      )}

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
        task={selectedTask?.task ?? null}
        listId={selectedTask?.listId ?? null}
        lists={lists}
        onToggleTaskStatus={toggleTaskStatus}
        onToggleChecklistItem={async () => {}}
        onAddChecklistItem={async () => {}}
        onDeleteChecklistItem={async () => {}}
        newChecklistItemText={newChecklistItemText}
        setNewChecklistItemText={setNewChecklistItemText}
        editMode={editingTask}
        setEditMode={setEditingTask}
        onUpdateTask={updateTask}
      />
    </div>
  );
}
