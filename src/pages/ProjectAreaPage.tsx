import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Kanban, ClipboardList, MessageCircle, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { BoardView } from "@/components/projects/BoardView";
import { TaskListView } from "@/components/projects/TaskListView";
import { TaskDetailDialog } from "@/components/projects/TaskDetailDialog";
import { TaskSidePanel, TaskFormDialog } from "@/components/tasks";
import type { UnifiedTask } from "@/lib/taskUnified";
import { ProjectList, Task, TaskStatus } from "@/components/projects/types";
import { ProjectArea } from "@/components/projects/types";
import { projectsService, type AreaComment } from "@/services/projects";
import { membersService } from "@/services/members";
import { Member } from "@/components/shared/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { Textarea } from "@/components/ui/textarea";

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
  const [hideCompletedTasks, setHideCompletedTasks] = useState(false);
  const [fullViewTask, setFullViewTask] = useState<UnifiedTask | null>(null);
  const [comments, setComments] = useState<AreaComment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSending, setCommentSending] = useState(false);
  const { user: currentUser } = useAuth();

  const refreshComments = useCallback(async () => {
    if (!projectId || !areaId) return;
    setCommentsLoading(true);
    try {
      const list = await projectsService.getAreaComments(projectId, areaId);
      setComments(list);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar comentários");
    } finally {
      setCommentsLoading(false);
    }
  }, [projectId, areaId]);

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
            customFields: apiTask.custom_fields ?? {},
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

  useEffect(() => {
    if (projectId && areaId && area) void refreshComments();
  }, [projectId, areaId, area, refreshComments]);

  const handleSendComment = async () => {
    const text = commentInput.trim();
    if (!text || !projectId || !areaId) return;
    setCommentSending(true);
    try {
      const newComment = await projectsService.createAreaComment(projectId, areaId, text);
      setComments((prev) => [...prev, newComment]);
      setCommentInput("");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao enviar comentário");
    } finally {
      setCommentSending(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!projectId || !areaId) return;
    try {
      await projectsService.deleteAreaComment(projectId, areaId, commentId);
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, body: null, deleted_at: new Date().toISOString() } : c))
      );
    } catch (e) {
      console.error(e);
      toast.error("Erro ao excluir comentário");
    }
  };

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
          customFields: apiTask.custom_fields ?? {},
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

  const handleFullViewUpdate = async (
    taskId: string,
    updates: Record<string, unknown>
  ) => {
    if (!fullViewTask) return;
    try {
      const payload: Record<string, unknown> = {};
      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.priority !== undefined) payload.priority = updates.priority;
      if (updates.due_date !== undefined) payload.due_date = updates.due_date;
      if (updates.list_id !== undefined) payload.list_id = updates.list_id;
      if (updates.assignee_id !== undefined) payload.assignee_id = updates.assignee_id;
      if (updates.assignee_name !== undefined) payload.assignee_name = updates.assignee_name;
      if (updates.tags !== undefined) payload.tags = updates.tags;
      if (updates.custom_fields !== undefined) payload.custom_fields = updates.custom_fields;
      if (updates.checklist !== undefined) payload.checklist = updates.checklist;
      if (updates.start_date !== undefined) payload.start_date = updates.start_date;
      if (updates.start_time !== undefined) payload.start_time = updates.start_time;
      if (updates.end_time !== undefined) payload.end_time = updates.end_time;
      if (updates.estimated_effort_hours !== undefined) payload.estimated_effort_hours = updates.estimated_effort_hours;
      if (updates.estimated_story_points !== undefined) payload.estimated_story_points = updates.estimated_story_points;
      if (updates.watchers !== undefined) payload.watchers = updates.watchers;
      if (updates.visibility !== undefined) payload.visibility = updates.visibility;
      if (updates.billable !== undefined) payload.billable = updates.billable;
      if (updates.hourly_rate !== undefined) payload.hourly_rate = updates.hourly_rate;
      if (updates.budget_cap !== undefined) payload.budget_cap = updates.budget_cap;
      if (updates.recurrence_rule !== undefined) payload.recurrence_rule = updates.recurrence_rule;
      if (updates.meeting_location !== undefined) payload.meeting_location = updates.meeting_location;
      if (updates.meeting_link !== undefined) payload.meeting_link = updates.meeting_link;
      if (updates.severity !== undefined) payload.severity = updates.severity;
      if (Object.keys(payload).length > 0) {
        await projectsService.updateProjectTask(taskId, payload);
      }
      setFullViewTask((prev) =>
        prev
          ? {
              ...prev,
              ...(updates as Partial<UnifiedTask>),
              listId: (updates.list_id as string) ?? prev.listId,
              clientName: (updates.client_name as string) ?? prev.clientName,
              deal: (updates.deal as string) ?? prev.deal,
              assigneeId: (updates.assignee_id as string) ?? prev.assigneeId ?? null,
              assigneeName: (updates.assignee_name as string) ?? prev.assigneeName,
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
              checklist: Array.isArray(updates.checklist) ? (updates.checklist as UnifiedTask["checklist"]) : (prev.checklist ?? []),
              tags: (updates.tags as string[]) ?? prev.tags ?? [],
              customFields: (updates.custom_fields as Record<string, unknown>) ?? prev.customFields ?? {},
            }
          : null
      );
      toast.success("Tarefa atualizada");
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
            <TabsTrigger value="comments">
              <MessageCircle className="h-4 w-4 mr-2" />
              Comentários
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
          projectId={projectId}
          areaId={areaId}
          onOpenFull={setFullViewTask}
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
          projectId={projectId}
          areaId={areaId}
          onOpenFull={setFullViewTask}
        />
      )}

      {activeTab === "comments" && (
        <div className="rounded-lg border bg-card">
          <div className="p-4 max-h-[60vh] flex flex-col">
            <div className="flex-1 overflow-y-auto space-y-4 min-h-[200px]">
              {commentsLoading ? (
                <p className="text-sm text-muted-foreground py-4">Carregando comentários...</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhum comentário. Seja o primeiro a comentar.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {(c.author_name || "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{c.author_name}</span>
                        {currentUser?.id === c.user_id && !c.deleted_at && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteComment(c.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {c.deleted_at || c.body == null ? (
                          <em className="text-muted-foreground">Comentário excluído</em>
                        ) : (
                          c.body
                        )}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 pt-4 border-t">
              <Textarea
                placeholder="Escreva um comentário... (Enter para enviar)"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendComment();
                  }
                }}
                className="min-h-[80px] resize-none"
                disabled={commentSending}
              />
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={handleSendComment}
                disabled={!commentInput.trim() || commentSending}
              >
                Enviar
              </Button>
            </div>
          </div>
        </div>
      )}

      {projectId && areaId && selectedListId ? (
        <TaskFormDialog
          key={`${selectedListId}-${areaId}`}
          open={newTaskDialogOpen}
          onOpenChange={setNewTaskDialogOpen}
          canSubmit
          context={{
            origin: "project",
            projectId,
            listId: selectedListId,
            areaId,
            projectName,
          }}
          onSuccess={(r) => {
            if (r.origin === "project") {
              setNewTaskDialogOpen(false);
              void refreshTasks();
            }
          }}
        />
      ) : null}

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

      <TaskSidePanel
        task={fullViewTask}
        open={!!fullViewTask}
        onOpenChange={(open) => !open && setFullViewTask(null)}
        listName={
          fullViewTask
            ? lists.find((l) => l.id === fullViewTask.listId)?.name ?? null
            : null
        }
        lists={lists.map((l) => ({ id: l.id, name: l.name }))}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        onUpdate={handleFullViewUpdate}
        onDelete={
          fullViewTask
            ? (taskId) =>
                deleteTask(taskId).then(() => setFullViewTask(null))
            : undefined
        }
        onToggleStatus={
          fullViewTask
            ? (taskId) => {
                toggleTaskStatus(fullViewTask.listId ?? "", taskId);
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
      />
    </div>
  );
}
