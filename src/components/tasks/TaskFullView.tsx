import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Clock,
  User,
  CheckSquare,
  Edit,
  Save,
  X,
  Trash2,
  Paperclip,
  Video,
  MapPin,
  Repeat,
  Gauge,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Settings2,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  getChecklistProgressFromItems,
  getUnifiedStatusLabel,
  getUnifiedPriorityColor,
} from "./utils";

export interface TaskFullViewList {
  id: string;
  name: string;
}

/** Lista de clientes para select de Cliente (tarefas globais). */
export interface TaskFullViewClient {
  id: string;
  name: string;
}

export interface TaskFullViewProps {
  task: UnifiedTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome da etapa/lista atual (contexto projeto). */
  listName?: string | null;
  /** Listas para mover tarefa (contexto projeto). */
  lists?: TaskFullViewList[];
  /** Clientes para select de Cliente (tarefas globais). */
  clients?: TaskFullViewClient[];
  /** Atualizar tarefa (payload conforme API: global ou projeto). */
  onUpdate?: (taskId: string, updates: Record<string, unknown>) => void | Promise<void>;
  /** Excluir tarefa. */
  onDelete?: (taskId: string) => void | Promise<void>;
  /** Alternar status concluída/pendente. */
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

export function TaskFullView({
  task,
  open,
  onOpenChange,
  listName,
  lists = [],
  clients = [],
  onUpdate,
  onDelete,
  onToggleStatus,
}: TaskFullViewProps) {
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<UnifiedTaskPriority>("medium");
  const [editStatus, setEditStatus] = useState<UnifiedTaskStatus>("todo");
  const [editDueDate, setEditDueDate] = useState<string | null>(null);
  const [editDueTime, setEditDueTime] = useState<string | null>(null);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editListId, setEditListId] = useState<string | null>(null);
  const [editClientName, setEditClientName] = useState("");
  const [editDeal, setEditDeal] = useState("");
  const [editAssigneeName, setEditAssigneeName] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [localChecklist, setLocalChecklist] = useState<UnifiedChecklistItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setEditDescription(task.description ?? "");
      setEditPriority(task.priority);
      setEditStatus(task.status);
      setEditDueDate(task.dueDate);
      setEditDueTime(task.dueTime ?? null);
      setEditTags(task.tags ?? []);
      setEditListId(task.listId);
      setEditClientName(task.clientName ?? "");
      setEditDeal(task.deal ?? "");
      setEditAssigneeName(task.assigneeName ?? "");
      setLocalChecklist(task.checklist ?? []);
      if (task.source === "global" && (task.clientName || task.deal || task.assigneeName)) {
        setAdvancedOpen(true);
      } else if (task?.source === "global") {
        setAdvancedOpen(false);
      }
    }
  }, [task]);

  const isProject = task?.source === "project";
  const checklist = localChecklist;
  const progress = getChecklistProgressFromItems(checklist);

  const handleSave = async () => {
    if (!task || !onUpdate) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        title: editTitle,
        description: editDescription || null,
        priority: editPriority,
        status: editStatus,
        due_date: editDueDate,
        tags: editTags,
        checklist: checklist,
      };
      if (isProject && editListId && editListId !== task.listId) {
        updates.list_id = editListId;
      }
      if (!isProject) {
        updates.client_name = editClientName.trim() || null;
        updates.deal = editDeal.trim() || null;
        updates.assignee_name = editAssigneeName.trim() || null;
        updates.due_time = editDueTime || null;
      }
      await onUpdate(task.id, updates);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !onDelete) return;
    if (!confirm("Excluir esta tarefa?")) return;
    await onDelete(task.id);
    onOpenChange(false);
  };

  const persistChecklist = (nextChecklist: UnifiedChecklistItem[]) => {
    setLocalChecklist(nextChecklist);
    if (onUpdate && task) {
      onUpdate(task.id, { checklist: nextChecklist });
    }
  };

  const handleToggleChecklistItem = (itemId: string) => {
    const next = localChecklist.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    persistChecklist(next);
  };

  const handleAddChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    const next = [
      ...localChecklist,
      {
        id: `cl-${Date.now()}`,
        text: newChecklistItem.trim(),
        completed: false,
      },
    ];
    setLocalChecklist(next);
    setNewChecklistItem("");
    if (onUpdate && task) {
      onUpdate(task.id, { checklist: next });
    }
  };

  const handleRemoveChecklistItem = (itemId: string) => {
    const next = localChecklist.filter((item) => item.id !== itemId);
    persistChecklist(next);
  };

  const addTag = () => {
    if (newTag.trim() && !editTags.includes(newTag.trim())) {
      setEditTags((prev) => [...prev, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setEditTags((prev) => prev.filter((t) => t !== tag));
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] sm:w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        aria-describedby={undefined}
      >
        <DialogDescription id="task-full-view-description" className="sr-only">
          Detalhes completos da tarefa: {task.title}. Pressione Escape para fechar.
        </DialogDescription>

        <DialogHeader className="shrink-0">
          <div className="flex items-start gap-2">
            {onToggleStatus && !editMode && (
              <Checkbox
                checked={task.status === "completed"}
                onCheckedChange={() => onToggleStatus(task.id)}
                className="mt-1"
              />
            )}
            {editMode ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="font-semibold text-lg"
                placeholder="Título"
              />
            ) : (
              <DialogTitle
                className={cn(
                  "flex-1",
                  task.status === "completed" && "line-through opacity-70"
                )}
              >
                {task.title}
              </DialogTitle>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {!editMode ? (
              <>
                {listName && (
                  <Badge variant="outline">Etapa: {listName}</Badge>
                )}
                <Badge variant="outline">
                  {getUnifiedStatusLabel(task.status)}
                </Badge>
                <Badge
                  className={cn(
                    "font-normal",
                    getUnifiedPriorityColor(task.priority)
                  )}
                >
                  {task.priority === "high"
                    ? "Alta"
                    : task.priority === "medium"
                      ? "Média"
                      : "Baixa"}
                </Badge>
                {(task.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </>
            ) : (
              <>
                <Select
                  value={editStatus}
                  onValueChange={(v) => setEditStatus(v as UnifiedTaskStatus)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={editPriority}
                  onValueChange={(v) => setEditPriority(v as UnifiedTaskPriority)}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isProject && lists.length > 0 && (
                  <Select
                    value={editListId ?? ""}
                    onValueChange={(v) => setEditListId(v || null)}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {lists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-2">
          {/* Descrição */}
          <section>
            <Label className="text-sm font-semibold">Descrição</Label>
            {editMode ? (
              <div className="mt-1">
                <SystemRichEditor
                  value={editDescription}
                  onChange={setEditDescription}
                  placeholder="Descreva a tarefa..."
                  className="min-h-[120px] rounded-md border"
                />
              </div>
            ) : task.description?.trim() ? (
              <SystemRichEditorReadOnly
                html={task.description}
                className="mt-1 text-sm"
              />
            ) : (
              <p className="text-sm text-muted-foreground mt-1 italic">
                Sem descrição
              </p>
            )}
          </section>

          {/* Datas e responsável (antes do botão expandir, igual ao formulário Nova Tarefa) */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">Datas</Label>
              <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                {task.dueDate && (
                  <li className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Vencimento: {formatUnifiedDate(task.dueDate)}
                    {task.dueTime && ` ${formatUnifiedTime(task.dueTime)}`}
                  </li>
                )}
                {(task.startDate || task.startTime) && (
                  <li className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Início:{" "}
                    {task.startDate && formatUnifiedDate(task.startDate)}
                    {task.startTime && ` ${formatUnifiedTime(task.startTime)}`}
                  </li>
                )}
                {task.endTime && (
                  <li className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Fim: {formatUnifiedTime(task.endTime)}
                  </li>
                )}
                {!task.dueDate && !task.startDate && !task.startTime && (
                  <li>Nenhuma data definida</li>
                )}
              </ul>
            </div>
            {editMode && (
              <>
                <div>
                  <Label className="text-sm font-semibold">Data de vencimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full mt-1 justify-start"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editDueDate
                          ? format(new Date(editDueDate), "PPP")
                          : "Escolher data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={
                          editDueDate ? new Date(editDueDate) : undefined
                        }
                        onSelect={(date) =>
                          setEditDueDate(date ? format(date, "yyyy-MM-dd") : null)
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                {!isProject && (
                  <div>
                    <Label className="text-sm font-semibold">Horário</Label>
                    <Input
                      type="time"
                      value={editDueTime ?? ""}
                      onChange={(e) =>
                        setEditDueTime(e.target.value ? e.target.value : null)
                      }
                      className="mt-1"
                    />
                  </div>
                )}
              </>
            )}
            {!editMode && (
              <div>
                <Label className="text-sm font-semibold">Responsável</Label>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {task.assigneeName ?? "—"}
                </p>
              </div>
            )}
          </section>

          {/* Configurações avançadas (tarefas GLOBAIS): Seguimento (Cliente, Negócio, Responsável).
              Tarefas de projeto usam TaskSidePanel > Opções avançadas com TaskAdvancedFields (datas, checklist, anexos, watchers, etc.). Ver PLANO-CONFIGURACOES-AVANCADAS-TAREFAS.md. */}
          {task.source === "global" && (
            <Collapsible
              open={advancedOpen}
              onOpenChange={setAdvancedOpen}
              className="space-y-2"
            >
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    {advancedOpen ? "Ocultar" : "Expandir"} configurações avançadas
                  </span>
                  {advancedOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <section className="space-y-4 pt-2 border rounded-md p-4 bg-muted/30">
                  <Label className="text-sm font-semibold">Seguimento do projeto</Label>
                  {editMode ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {clients.length > 0 ? (
                        <div>
                          <Label className="text-xs text-muted-foreground">Cliente</Label>
                          <Select
                            value={
                              editClientName === ""
                                ? "none"
                                : clients.find((c) => c.name === editClientName)?.id ?? "custom"
                            }
                            onValueChange={(v) => {
                              if (v === "none") setEditClientName("");
                              else if (v === "custom") return;
                              else {
                                const c = clients.find((x) => x.id === v);
                                setEditClientName(c?.name ?? "");
                              }
                            }}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Selecione o cliente" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum</SelectItem>
                              {clients.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                              {editClientName && !clients.find((c) => c.name === editClientName) && (
                                <SelectItem value="custom">{editClientName}</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div>
                          <Label className="text-xs text-muted-foreground">Cliente</Label>
                          <Input
                            value={editClientName}
                            onChange={(e) => setEditClientName(e.target.value)}
                            placeholder="Nome do cliente"
                            className="mt-1"
                          />
                        </div>
                      )}
                      <div>
                        <Label className="text-xs text-muted-foreground">Negócio</Label>
                        <Input
                          value={editDeal}
                          onChange={(e) => setEditDeal(e.target.value)}
                          placeholder="Negócio ou oportunidade"
                          className="mt-1"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs text-muted-foreground">Responsável</Label>
                        <Input
                          value={editAssigneeName}
                          onChange={(e) => setEditAssigneeName(e.target.value)}
                          placeholder="Responsável pela tarefa"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                      {(task.clientName || task.deal || task.assigneeName) && (
                        <>
                          {task.clientName && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              Cliente: {task.clientName}
                            </div>
                          )}
                          {task.deal && (
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4" />
                              Negócio: {task.deal}
                            </div>
                          )}
                          {task.assigneeName && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              Responsável: {task.assigneeName}
                            </div>
                          )}
                        </>
                      )}
                      {!task.clientName && !task.deal && !task.assigneeName && (
                        <p className="italic">Nenhum cliente, negócio ou responsável definido.</p>
                      )}
                    </div>
                  )}
                </section>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Checklist */}
          <section>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-sm font-semibold">Lista de verificação</Label>
              {checklist.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {checklist.filter((i) => i.completed).length}/{checklist.length}{" "}
                  ({progress}%)
                </span>
              )}
            </div>
            {checklist.length > 0 && (
              <div className="w-full h-2 bg-muted rounded-full mb-3">
                <div
                  className="h-2 bg-primary rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            <ul className="space-y-2 mb-3">
              {checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2 group">
                  <Checkbox
                    checked={item.completed}
                    onCheckedChange={() => handleToggleChecklistItem(item.id)}
                  />
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      item.completed && "line-through text-muted-foreground"
                    )}
                  >
                    {item.text}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100"
                    onClick={() => handleRemoveChecklistItem(item.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                placeholder="Adicionar item"
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddChecklistItem();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddChecklistItem}
                disabled={!newChecklistItem.trim()}
              >
                Adicionar
              </Button>
            </div>
          </section>

          {/* Tags (edição) */}
          {editMode && (
            <section>
              <Label className="text-sm font-semibold">Tags</Label>
              <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                {editTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => removeTag(tag)}
                  >
                    {tag} <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Nova tag"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addTag} disabled={!newTag.trim()}>
                  Adicionar
                </Button>
              </div>
            </section>
          )}

          {/* Esforço e orçamento */}
          {(task.estimatedEffortHours != null ||
            task.estimatedStoryPoints != null ||
            task.hourlyRate != null ||
            task.budgetCap != null) && (
            <section>
              <Label className="text-sm font-semibold">Esforço e orçamento</Label>
              <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                {(task.estimatedEffortHours != null ||
                  task.estimatedStoryPoints != null) && (
                  <li className="flex items-center gap-2">
                    <Gauge className="h-4 w-4" />
                    {task.estimatedEffortHours != null &&
                      `${task.estimatedEffortHours}h`}
                    {task.estimatedEffortHours != null &&
                      task.estimatedStoryPoints != null &&
                      " · "}
                    {task.estimatedStoryPoints != null &&
                      `${task.estimatedStoryPoints} pts`}
                  </li>
                )}
                {task.hourlyRate != null && (
                  <li className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Taxa/hora: R$ {Number(task.hourlyRate).toFixed(2)}
                  </li>
                )}
                {task.budgetCap != null && (
                  <li className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Teto: R$ {Number(task.budgetCap).toFixed(2)}
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* Anexos */}
          {task.attachments?.length > 0 && (
            <section>
              <Label className="text-sm font-semibold">Anexos</Label>
              <ul className="text-sm mt-1 space-y-1">
                {task.attachments.map((att, i) => (
                  <li key={att.id ?? i} className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    {att.url ? (
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        {att.name ?? "Anexo"}
                      </a>
                    ) : (
                      <span>{att.name ?? "Anexo"}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Reunião */}
          {(task.meetingLink || task.meetingLocation) && (
            <section>
              <Label className="text-sm font-semibold">Reunião</Label>
              <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                {task.meetingLink && (
                  <li className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    <a
                      href={task.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Link da reunião
                    </a>
                  </li>
                )}
                {task.meetingLocation && (
                  <li className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {task.meetingLocation}
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* Recorrência */}
          {task.recurrenceRule != null && (
            <section>
              <Label className="text-sm font-semibold">Recorrência</Label>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                <Repeat className="h-4 w-4" />
                Configurada
              </p>
            </section>
          )}

          {/* Custom fields */}
          {task.customFields &&
            Object.keys(task.customFields).length > 0 && (
              <section>
                <Label className="text-sm font-semibold">Campos personalizados</Label>
                <dl className="text-sm text-muted-foreground mt-1 space-y-1">
                  {Object.entries(task.customFields).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <dt className="font-medium text-foreground">{key}:</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-4">
          {editMode ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditMode(false);
                  if (task) {
                    setLocalChecklist(task.checklist ?? []);
                    setEditTitle(task.title);
                    setEditDescription(task.description ?? "");
                    setEditPriority(task.priority);
                    setEditStatus(task.status);
                    setEditDueDate(task.dueDate);
                    setEditDueTime(task.dueTime ?? null);
                    setEditTags(task.tags ?? []);
                    setEditListId(task.listId);
                    setEditClientName(task.clientName ?? "");
                    setEditDeal(task.deal ?? "");
                    setEditAssigneeName(task.assigneeName ?? "");
                  }
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                Salvar
              </Button>
            </>
          ) : (
            <>
              {onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  className="mr-auto"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </Button>
              )}
              {onToggleStatus && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onToggleStatus(task.id)}
                >
                  <CheckSquare className="mr-2 h-4 w-4" />
                  {task.status === "completed"
                    ? "Marcar como pendente"
                    : "Marcar como concluída"}
                </Button>
              )}
              {onUpdate && (
                <Button type="button" onClick={() => setEditMode(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
