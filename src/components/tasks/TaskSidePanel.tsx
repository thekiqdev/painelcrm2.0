/**
 * Painel lateral deslizante para visualização/edição de tarefa.
 * Renderizado via portal em document.body para cobrir toda a viewport (incluindo header).
 * Overlay: fixed 0,0 100vw 100vh; painel: fixed top-0 right-0 height 100vh; z-index acima do header.
 */
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SystemRichEditor } from "@/components/editor";
import { SystemRichEditorReadOnly } from "@/components/editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CalendarIcon,
  User,
  X,
  Trash2,
  MessageSquare,
  Tag,
  Edit,
  History,
  ArrowLeft,
  Settings2,
  Check,
  Clock,
  LayoutList,
} from "lucide-react";
import { TaskAdvancedFields, unifiedTaskToFormValue, formValueToApiPayload } from "./TaskAdvancedFields";
import type { TaskAdvancedFormValue } from "./TaskAdvancedFields";
import { TaskChecklistEditor } from "./TaskChecklistEditor";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type {
  UnifiedTask,
  UnifiedTaskPriority,
  UnifiedTaskStatus,
  UnifiedChecklistItem,
} from "@/lib/taskUnified";
import {
  formatUnifiedDate,
  formatUnifiedTime,
  getUnifiedStatusLabel,
  getUnifiedPriorityColor,
  getUnifiedPriorityBadgeClass,
} from "./utils";

export interface TaskSidePanelList {
  id: string;
  name: string;
}

export interface TaskSidePanelProps {
  task: UnifiedTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listName?: string | null;
  lists?: TaskSidePanelList[];
  /** Membros para Observadores (Watchers) nas Opções avançadas. */
  members?: { id: string; name: string }[];
  onUpdate?: (taskId: string, updates: Record<string, unknown>) => void | Promise<void>;
  onDelete?: (taskId: string) => void | Promise<void>;
  onToggleStatus?: (taskId: string) => void | Promise<void>;
}

const STATUS_OPTIONS: { value: UnifiedTaskStatus; label: string }[] = [
  { value: "pending", label: "Pendente" },
  { value: "todo", label: "A fazer" },
  { value: "in-progress", label: "Em andamento" },
  { value: "review", label: "Revisão" },
  { value: "completed", label: "Concluída" },
];

const PRIORITY_OPTIONS: { value: UnifiedTaskPriority; label: string }[] = [
  { value: "high", label: "Alta" },
  { value: "medium", label: "Média" },
  { value: "low", label: "Baixa" },
];

/** z-index para dropdowns/popovers dentro do painel (acima do aside z-[9999]). */
const PANEL_DROPDOWN_Z = "!z-[10000]";

const TAG_PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

/** Toggle circular de conclusão: feedback visual imediato, ícone de check quando concluído, animação suave. */
function CompletionToggle({
  completed,
  onToggle,
  ariaLabel,
}: {
  completed: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={ariaLabel}
      aria-pressed={completed}
      className={cn(
        "shrink-0 flex items-center justify-center rounded-full border-2 transition-all duration-200 ease-out",
        "min-w-[44px] min-h-[44px] w-11 h-11",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        completed
          ? "bg-emerald-500 border-emerald-500 text-white shadow-sm hover:bg-emerald-600 hover:border-emerald-600"
          : "bg-background border-muted-foreground/40 text-muted-foreground hover:border-primary/50 hover:bg-muted/50"
      )}
    >
      {completed ? (
        <Check className="h-6 w-6 shrink-0 animate-in zoom-in-50 duration-200" strokeWidth={2.5} />
      ) : (
        <span className="w-5 h-5 rounded-full border-2 border-current opacity-50" />
      )}
    </button>
  );
}

/** Barra de contexto do header: responsável (só ícone), área, etiquetas, data, prioridade. */
function TaskContextBar({
  task,
  editPriority,
  editListId,
  listName,
  lists,
  isProject,
  members,
  onPriorityChange,
  onListChange,
  onAssigneeChange,
}: {
  task: UnifiedTask;
  editPriority: UnifiedTaskPriority;
  editListId: string | null;
  listName?: string | null;
  lists: TaskSidePanelList[];
  isProject: boolean;
  members: { id: string; name: string }[];
  onPriorityChange: (v: UnifiedTaskPriority) => void;
  onListChange: (v: string | null) => void;
  onAssigneeChange?: (assigneeId: string | null, assigneeName: string | null) => void;
}) {
  const allTags = [...(task.tags ?? []), ...(task.labels ?? [])].slice(0, 5);
  const displayListName = listName ?? lists.find((l) => l.id === editListId)?.name ?? null;
  const assigneeInitials =
    task.assigneeName?.split(/\s+/).map((s) => s[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {/* Responsável: só ícone de perfil (clicável) */}
      {onAssigneeChange && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={task.assigneeName ? `Responsável: ${task.assigneeName}. Clique para alterar.` : "Selecionar responsável"}
            >
              <Avatar className="h-8 w-8 border-2 border-background shadow-sm">
                {task.assigneeAvatar ? (
                  <AvatarImage src={task.assigneeAvatar} alt={task.assigneeName ?? ""} />
                ) : null}
                <AvatarFallback className="text-xs bg-muted">
                  {task.assigneeName ? assigneeInitials : <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
            </button>
          </PopoverTrigger>
          <PopoverContent className={cn(PANEL_DROPDOWN_Z, "w-56 p-2")} align="start">
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              <button
                type="button"
                className={cn(
                  "w-full text-left px-2 py-2 rounded-md text-sm flex items-center gap-2",
                  !task.assigneeId ? "bg-primary/15 text-primary" : "hover:bg-muted"
                )}
                onClick={() => onAssigneeChange(null, null)}
              >
                <span className="text-muted-foreground">Nenhum</span>
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cn(
                    "w-full text-left px-2 py-2 rounded-md text-sm flex items-center gap-2",
                    task.assigneeId === m.id ? "bg-primary/15 text-primary" : "hover:bg-muted"
                  )}
                  onClick={() => onAssigneeChange(m.id, m.name)}
                >
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-xs">{m.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {m.name}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Área/lista: texto contextual clicável (projeto) */}
      {isProject && (displayListName || lists.length > 0) && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              aria-label={displayListName ? `Área: ${displayListName}. Clique para mover.` : "Selecionar área"}
            >
              <LayoutList className="h-3.5 w-3.5 shrink-0" />
              <span>{lists.length > 0 ? displayListName ?? "Área" : listName ?? "—"}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className={cn(PANEL_DROPDOWN_Z, "w-52 p-1")} align="start">
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm",
                  editListId === list.id ? "bg-primary/15 text-primary font-medium" : "hover:bg-muted"
                )}
                onClick={() => onListChange(list.id)}
              >
                {list.name}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* Etiquetas */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {allTags.map((t) => (
            <Badge key={t} variant="secondary" className="text-xs font-normal py-0">
              {t}
            </Badge>
          ))}
        </div>
      )}

      {/* Data de vencimento */}
      {task.dueDate && (
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground bg-muted/50 text-xs">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {formatUnifiedDate(task.dueDate)}
          {task.dueTime && ` · ${formatUnifiedTime(task.dueTime)}`}
        </span>
      )}

      {/* Prioridade: etiqueta clicável */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors",
              getUnifiedPriorityBadgeClass(editPriority),
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            aria-label={`Prioridade: ${editPriority === "high" ? "Alta" : editPriority === "medium" ? "Média" : "Baixa"}. Clique para alterar.`}
          >
            {editPriority === "high" ? "Alta" : editPriority === "medium" ? "Média" : "Baixa"}
          </button>
        </PopoverTrigger>
        <PopoverContent className={cn(PANEL_DROPDOWN_Z, "w-36 p-1")} align="start">
          {PRIORITY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                editPriority === o.value ? "bg-primary/15 text-primary" : "hover:bg-muted"
              )}
              onClick={() => onPriorityChange(o.value)}
            >
              {o.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function TaskSidePanel({
  task,
  open,
  onOpenChange,
  listName,
  lists = [],
  members = [],
  onUpdate,
  onDelete,
  onToggleStatus,
}: TaskSidePanelProps) {
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [editPriority, setEditPriority] = useState<UnifiedTaskPriority>("medium");
  const [editStatus, setEditStatus] = useState<UnifiedTaskStatus>("todo");
  const [editDueDate, setEditDueDate] = useState<string | null>(null);
  const [editListId, setEditListId] = useState<string | null>(null);
  const [localChecklist, setLocalChecklist] = useState<UnifiedChecklistItem[]>([]);
  const [panelView, setPanelView] = useState<"main" | "advanced">("main");
  const [advancedFormValue, setAdvancedFormValue] = useState<TaskAdvancedFormValue | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setEditDescription(task.description ?? "");
      setEditPriority(task.priority);
      setEditStatus(task.status);
      setEditDueDate(task.dueDate);
      setEditListId(task.listId);
      setLocalChecklist(task.checklist ?? []);
      setAdvancedFormValue(unifiedTaskToFormValue(task));
      setPanelView("main");
    }
  }, [task]);

  const isProject = task?.source === "project";

  const flushTitle = () => {
    if (task && onUpdate && editTitle.trim() !== task.title) {
      onUpdate(task.id, { title: editTitle.trim() || task.title });
    }
  };

  const flushDueDate = (date: string | null) => {
    if (task && onUpdate) onUpdate(task.id, { due_date: date });
  };

  const flushListId = (listId: string | null) => {
    if (task && onUpdate && listId && listId !== task.listId) {
      onUpdate(task.id, { list_id: listId });
    }
  };

  const persistChecklist = (next: UnifiedChecklistItem[]) => {
    setLocalChecklist(next);
    if (onUpdate && task) onUpdate(task.id, { checklist: next });
  };

  const handleDelete = async () => {
    if (!task || !onDelete) return;
    if (!confirm("Excluir esta tarefa?")) return;
    await onDelete(task.id);
    onOpenChange(false);
  };

  const saveDescription = (v: string) => {
    setEditDescription(v);
    if (task && onUpdate) onUpdate(task.id, { description: v || null });
    setDescriptionEditing(false);
  };

  const tagColors = (task?.customFields?.tagColors as Record<string, string> | undefined) ?? {};
  const addTag = () => {
    const name = newTagName.trim();
    if (!name || !task || !onUpdate || task.source !== "project") return;
    const nextTags = [...(task.tags ?? []), name];
    const nextTagColors = { ...tagColors, [name]: newTagColor };
    onUpdate(task.id, {
      tags: nextTags,
      custom_fields: { ...(task.customFields as Record<string, unknown> ?? {}), tagColors: nextTagColors },
    });
    setNewTagName("");
    setNewTagColor("#3b82f6");
    setTagPickerOpen(false);
  };
  const removeTag = (tagName: string) => {
    if (!task || !onUpdate || task.source !== "project") return;
    const nextTags = (task.tags ?? []).filter((t) => t !== tagName);
    const { [tagName]: _, ...restColors } = tagColors;
    onUpdate(task.id, {
      tags: nextTags,
      custom_fields: { ...(task.customFields as Record<string, unknown> ?? {}), tagColors: restColors },
    });
  };

  if (!task) return null;

  const panelContent = (
    <>
      {/* Overlay: cobre toda a viewport (position fixed, top 0 left 0, 100vw 100vh), z-index acima do header */}
      <div
        aria-hidden
        className={cn(
          "fixed top-0 left-0 w-[100vw] h-[100vh] bg-black/20 transition-opacity duration-200",
          "z-[9998]",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => onOpenChange(false)}
      />
      {/* Painel: fixed top 0 right 0, height 100vh, z-index acima do overlay */}
      <aside
        role="dialog"
        aria-label={`Detalhes da tarefa: ${task.title}`}
        className={cn(
          "fixed top-0 right-0 h-[100vh] w-[90vw] sm:w-[40%] min-w-[320px] max-w-[600px]",
          "bg-background border-l shadow-xl flex flex-col z-[9999]",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header fixo: título + pills OU Voltar + Opções avançadas */}
        <header className="shrink-0 border-b bg-muted/40 px-4 py-3">
          {panelView === "advanced" ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setPanelView("main")}
                aria-label="Voltar"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h2 className="text-lg font-semibold truncate">Opções avançadas</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 ml-auto"
                onClick={() => onOpenChange(false)}
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 min-h-0">
                {onToggleStatus && (
                  <CompletionToggle
                    completed={task.status === "completed"}
                    onToggle={() => onToggleStatus(task.id)}
                    ariaLabel={task.status === "completed" ? "Desmarcar conclusão" : "Marcar como concluída"}
                  />
                )}
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={flushTitle}
                  className={cn(
                    "flex-1 min-w-0 text-lg font-semibold border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 min-h-0 h-auto py-1 transition-opacity duration-200",
                    task.status === "completed" && "line-through opacity-70"
                  )}
                  placeholder="Título da tarefa"
                />
                <div className="flex items-center gap-0.5 shrink-0 relative z-10">
                  {onDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete();
                      }}
                      aria-label="Excluir tarefa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenChange(false);
                    }}
                    aria-label="Fechar"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <div className="border-t border-border/80 mt-2 pt-2">
                <TaskContextBar
                  task={task}
                  editPriority={editPriority}
                  editListId={editListId}
                  listName={listName}
                  lists={lists}
                  isProject={isProject}
                  members={members}
                  onPriorityChange={(v) => {
                    setEditPriority(v);
                    if (task && onUpdate) onUpdate(task.id, { priority: v });
                  }}
                  onListChange={(v) => {
                    setEditListId(v);
                    flushListId(v);
                  }}
                  onAssigneeChange={
                    onUpdate
                      ? (assigneeId, assigneeName) =>
                          onUpdate(task.id, { assignee_id: assigneeId, assignee_name: assigneeName })
                      : undefined
                  }
                />
              </div>
            </>
          )}
        </header>

        {/* Corpo: navegação interna com transição lateral */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <div
            className="absolute inset-0 flex transition-transform duration-300 ease-out"
            style={{
              width: "200%",
              transform: panelView === "main" ? "translateX(0)" : "translateX(-50%)",
            }}
          >
            {/* Slide 1: vista principal (50% do container = 100% da área visível) */}
            <div className="w-1/2 flex flex-col min-h-0 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-[1fr,minmax(200px,30%)] gap-0 flex-1 min-h-0">
            {/* Coluna esquerda (70%): Conteúdo */}
            <div className="space-y-5 p-4">
              {/* Descrição: leitura por padrão, botão Editar inline */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Descrição</Label>
                  {!descriptionEditing && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-muted-foreground"
                      onClick={() => setDescriptionEditing(true)}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      Editar
                    </Button>
                  )}
                </div>
                {descriptionEditing ? (
                  <div className="space-y-2">
                    <SystemRichEditor
                      value={editDescription}
                      onChange={setEditDescription}
                      placeholder="Descreva a tarefa..."
                      className="min-h-[120px] rounded-lg border bg-background"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveDescription(editDescription)}>
                        Salvar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditDescription(task.description ?? "");
                          setDescriptionEditing(false);
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : editDescription?.trim() ? (
                  <div
                    className="rounded-lg border border-transparent bg-muted/20 p-3 min-h-[60px] prose prose-sm max-w-none text-foreground/90"
                    onClick={() => setDescriptionEditing(true)}
                  >
                    <SystemRichEditorReadOnly html={editDescription} className="text-sm" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDescriptionEditing(true)}
                    className="w-full rounded-lg border border-dashed bg-muted/10 p-4 text-left text-sm text-muted-foreground hover:bg-muted/20 hover:border-muted-foreground/30 transition-colors"
                  >
                    Adicionar descrição...
                  </button>
                )}
              </section>

              <section className="rounded-lg border bg-card p-3 shadow-sm">
                <TaskChecklistEditor
                  items={localChecklist}
                  onChange={(next) => persistChecklist(next as UnifiedChecklistItem[])}
                />
              </section>

              {/* Comentários (placeholder) */}
              <section>
                <Label className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Comentários
                </Label>
                <div className="rounded-lg border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground text-center">
                  Em breve
                </div>
              </section>

              {/* Atividade (placeholder histórico) */}
              <section>
                <Label className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Atividade
                </Label>
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2 text-muted-foreground">
                    <span className="shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5" />
                    <span>Tarefa criada</span>
                  </li>
                  {task.updatedAt && (
                    <li className="flex gap-2 text-muted-foreground">
                      <span className="shrink-0 w-2 h-2 rounded-full bg-muted-foreground/50 mt-1.5" />
                      <span>Última atualização</span>
                    </li>
                  )}
                  <li className="flex gap-2 text-muted-foreground/70 italic">
                    <span className="shrink-0 w-2 h-2 rounded-full bg-muted mt-1.5" />
                    <span>Histórico completo em breve</span>
                  </li>
                </ul>
              </section>
            </div>

            {/* Coluna direita (30%): Card de metadados */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border-l border-border/50 space-y-4">
              <div className="rounded-lg border bg-background/80 p-4 space-y-4 shadow-sm">
                <section>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Datas
                  </Label>
                  <div className="mt-1.5 space-y-1.5 text-sm">
                    {task.dueDate && (
                      <div className="flex items-center gap-2 font-medium">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        {formatUnifiedDate(task.dueDate)}
                        {task.dueTime && ` · ${formatUnifiedTime(task.dueTime)}`}
                      </div>
                    )}
                    {(task.startDate || task.startTime) && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4 shrink-0" />
                        {task.startDate && formatUnifiedDate(task.startDate)}
                        {task.startTime && ` ${formatUnifiedTime(task.startTime)}`}
                      </div>
                    )}
                    {!task.dueDate && !task.startDate && (
                      <p className="text-muted-foreground italic">Nenhuma data</p>
                    )}
                  </div>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="mt-2 w-full justify-start h-8">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editDueDate ? format(new Date(editDueDate), "dd/MM/yyyy") : "Definir data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className={cn(PANEL_DROPDOWN_Z, "w-auto p-0")} align="start">
                      <Calendar
                        mode="single"
                        selected={editDueDate ? new Date(editDueDate) : undefined}
                        onSelect={(date) => {
                          const next = date ? format(date, "yyyy-MM-dd") : null;
                          setEditDueDate(next);
                          flushDueDate(next);
                          setDatePickerOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </section>

                {isProject && (listName || lists.length > 0) && (
                  <section>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Etapa
                    </Label>
                    {lists.length > 0 ? (
                      <Select
                        value={editListId ?? ""}
                        onValueChange={(v) => {
                          setEditListId(v || null);
                          flushListId(v || null);
                        }}
                      >
                        <SelectTrigger className="mt-1.5 h-8">
                          <SelectValue placeholder="Mover para..." />
                        </SelectTrigger>
                        <SelectContent className={PANEL_DROPDOWN_Z}>
                          {lists.map((list) => {
                            const isAFazer =
                              list.name === "A Fazer" || list.name === "A fazer";
                            return (
                              <SelectItem
                                key={list.id}
                                value={list.id}
                                disabled={isAFazer}
                              >
                                {list.name}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="mt-1.5 text-sm font-medium">{listName ?? "—"}</p>
                    )}
                  </section>
                )}

                <section>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Prioridade
                  </Label>
                  {onUpdate ? (
                    <Select
                      value={editPriority}
                      onValueChange={(v) => {
                        setEditPriority(v as UnifiedTaskPriority);
                        onUpdate(task.id, { priority: v });
                      }}
                    >
                      <SelectTrigger className="mt-1.5 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={PANEL_DROPDOWN_Z}>
                        {PRIORITY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p
                      className={cn(
                        "mt-1.5 text-sm font-medium",
                        getUnifiedPriorityColor(editPriority)
                      )}
                    >
                      {editPriority === "high"
                        ? "Alta"
                        : editPriority === "medium"
                          ? "Média"
                          : "Baixa"}
                    </p>
                  )}
                </section>

                <section>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    Etiquetas
                  </Label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {(task.tags ?? []).map((tag) => {
                      const color = tagColors[tag];
                      const wrapperClassName = cn(
                        "inline-flex items-center gap-1 rounded-md border text-xs font-medium",
                        onUpdate && task.source === "project" && "group",
                        !color && "border-transparent"
                      );
                      const wrapperStyle = color
                        ? {
                            backgroundColor: `${color}20`,
                            borderColor: color,
                            color: color,
                          }
                        : undefined;
                      return (
                        <span
                          key={tag}
                          className={wrapperClassName}
                          style={wrapperStyle}
                        >
                          {color ? (
                            <span className="py-0.5 pl-1.5 pr-1">{tag}</span>
                          ) : (
                            <Badge variant="secondary" className="text-xs font-medium py-0 pr-1 border-0">
                              {tag}
                            </Badge>
                          )}
                          {onUpdate && task.source === "project" && (
                            <button
                              type="button"
                              className="opacity-0 group-hover:opacity-100 rounded-full p-0.5 hover:bg-black/10 shrink-0"
                              onClick={() => removeTag(tag)}
                              aria-label={`Remover etiqueta ${tag}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                    {onUpdate && task.source === "project" && (
                      <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                            <Tag className="h-3 w-3" />
                            Adicionar
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className={cn(PANEL_DROPDOWN_Z, "w-64 p-3")} align="start">
                          <div className="space-y-3">
                            <div>
                              <Label className="text-xs">Nome</Label>
                              <Input
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                placeholder="Ex: Urgente"
                                className="mt-1 h-8"
                                onKeyDown={(e) => e.key === "Enter" && addTag()}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Cor</Label>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {TAG_PRESET_COLORS.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    className={cn(
                                      "w-6 h-6 rounded-full border-2 transition-transform",
                                      newTagColor === c ? "border-foreground scale-110" : "border-transparent"
                                    )}
                                    style={{ backgroundColor: c }}
                                    onClick={() => setNewTagColor(c)}
                                    aria-label={`Cor ${c}`}
                                  />
                                ))}
                              </div>
                              <div className="mt-1.5 flex items-center gap-2">
                                <input
                                  type="color"
                                  value={newTagColor}
                                  onChange={(e) => setNewTagColor(e.target.value)}
                                  className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                                />
                                <span className="text-xs text-muted-foreground">{newTagColor}</span>
                              </div>
                            </div>
                            <Button size="sm" className="w-full" onClick={addTag} disabled={!newTagName.trim()}>
                              Adicionar etiqueta
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    {!(task.tags?.length) && !(onUpdate && task.source === "project") && (
                      <span className="text-xs text-muted-foreground italic">Nenhuma</span>
                    )}
                  </div>
                </section>

                <div className="pt-3 mt-3 border-t border-border/80">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 min-w-0 text-xs"
                    onClick={() => setPanelView("advanced")}
                  >
                    <Settings2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Avançadas</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
          </div>

            {/* Slide 2: Opções avançadas — TaskAdvancedFields (igual ao accordion na criação) */}
            <div className="w-1/2 flex flex-col min-h-0 overflow-y-auto bg-background">
              {advancedFormValue && (
                <div className="p-4 space-y-4">
                  <TaskAdvancedFields
                    value={advancedFormValue}
                    onChange={setAdvancedFormValue}
                    members={members}
                    mode="edit"
                    idPrefix="panel-adv"
                  />
                  <div className="pt-2 border-t">
                    <Button
                      type="button"
                      onClick={() => {
                        if (task && onUpdate) {
                          const payload = {
                            ...formValueToApiPayload(advancedFormValue),
                            checklist: localChecklist,
                            due_date: editDueDate,
                          };
                          onUpdate(task.id, payload);
                        }
                      }}
                    >
                      Salvar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );

  return createPortal(panelContent, document.body);
}
