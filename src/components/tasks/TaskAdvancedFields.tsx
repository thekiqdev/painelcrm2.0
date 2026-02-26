/**
 * Campos de configurações avançadas de tarefa (reutilizável na criação e no painel).
 * Mesma estrutura do accordion "Configurações Avançadas" do NewTaskDialog.
 */
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  CalendarIcon,
  Clock,
  Plus,
  X,
  Upload,
  DollarSign,
  Users,
  Repeat,
  MapPin,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { UnifiedTask, UnifiedChecklistItem } from "@/lib/taskUnified";

/** Item de checklist (compatível com UnifiedChecklistItem). */
export interface TaskAdvancedChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

/** Valor do formulário de configurações avançadas (controlado). */
export interface TaskAdvancedFormValue {
  startDate: Date | null;
  dueDate: Date | null;
  startTime: string;
  endTime: string;
  estimatedEffortHours: number | null;
  estimatedStoryPoints: number | null;
  checklist: TaskAdvancedChecklistItem[];
  watchers: string[];
  visibility: string;
  billable: boolean;
  hourlyRate: number | null;
  budgetCap: number | null;
  hasRecurrence: boolean;
  recurrenceType: string;
  meetingLocation: string;
  meetingLink: string;
  severity: string;
  /** Arquivos selecionados (criação); em edição pode ficar vazio. */
  attachments: File[];
  /** Link externo (Google Drive, Figma, etc.). */
  externalLink: string;
}

export const DEFAULT_TASK_ADVANCED_FORM_VALUE: TaskAdvancedFormValue = {
  startDate: null,
  dueDate: null,
  startTime: "",
  endTime: "",
  estimatedEffortHours: null,
  estimatedStoryPoints: null,
  checklist: [],
  watchers: [],
  visibility: "internal",
  billable: false,
  hourlyRate: null,
  budgetCap: null,
  hasRecurrence: false,
  recurrenceType: "weekly",
  meetingLocation: "",
  meetingLink: "",
  severity: "",
  attachments: [],
  externalLink: "",
};

/** Converte TaskAdvancedFormValue para payload da API (snake_case). */
export function formValueToApiPayload(
  v: TaskAdvancedFormValue
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    start_date: v.startDate ? format(v.startDate, "yyyy-MM-dd") : null,
    due_date: v.dueDate ? format(v.dueDate, "yyyy-MM-dd") : null,
    start_time: v.startTime || null,
    end_time: v.endTime || null,
    estimated_effort_hours: v.estimatedEffortHours,
    estimated_story_points: v.estimatedStoryPoints,
    checklist: v.checklist,
    watchers: v.watchers,
    visibility: v.visibility || "internal",
    billable: v.billable,
    hourly_rate: v.hourlyRate,
    budget_cap: v.budgetCap,
    recurrence_rule: v.hasRecurrence && v.recurrenceType ? { type: v.recurrenceType } : null,
    meeting_location: v.meetingLocation || null,
    meeting_link: v.meetingLink || null,
    severity: v.severity || null,
  };
  return payload;
}

/** Converte UnifiedTask para TaskAdvancedFormValue (preencher painel ao editar). */
export function unifiedTaskToFormValue(task: UnifiedTask): TaskAdvancedFormValue {
  const recurrence = task.recurrenceRule as { type?: string } | null | undefined;
  return {
    startDate: task.startDate ? new Date(task.startDate) : null,
    dueDate: task.dueDate ? new Date(task.dueDate) : null,
    startTime: task.startTime ?? "",
    endTime: task.endTime ?? "",
    estimatedEffortHours: task.estimatedEffortHours,
    estimatedStoryPoints: task.estimatedStoryPoints,
    checklist: (task.checklist ?? []).map((item: UnifiedChecklistItem) => ({
      id: item.id,
      text: item.text,
      completed: item.completed,
    })),
    watchers: [], // UnifiedTask não expõe watchers por enquanto
    visibility: "internal",
    billable: task.billable ?? false,
    hourlyRate: task.hourlyRate,
    budgetCap: task.budgetCap,
    hasRecurrence: !!task.recurrenceRule,
    recurrenceType: recurrence?.type ?? "weekly",
    meetingLocation: task.meetingLocation ?? "",
    meetingLink: task.meetingLink ?? "",
    severity: task.severity ?? "",
    attachments: [],
    externalLink: "",
  };
}

export interface TaskAdvancedFieldsProps {
  value: TaskAdvancedFormValue;
  onChange: (v: TaskAdvancedFormValue) => void;
  /** Membros para o select de Observadores (Watchers). */
  members?: { id: string; name: string }[];
  mode?: "create" | "edit";
  /** Prefixo opcional para ids de campos (evitar duplicata em múltiplas instâncias). */
  idPrefix?: string;
}

export function TaskAdvancedFields({
  value,
  onChange,
  members = [],
  mode = "create",
  idPrefix = "adv",
}: TaskAdvancedFieldsProps) {
  const [newChecklistItem, setNewChecklistItem] = useState("");

  const update = (partial: Partial<TaskAdvancedFormValue>) => {
    onChange({ ...value, ...partial });
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    const item: TaskAdvancedChecklistItem = {
      id: Math.random().toString(36).slice(2, 11),
      text: newChecklistItem.trim(),
      completed: false,
    };
    update({ checklist: [...value.checklist, item] });
    setNewChecklistItem("");
  };

  const removeChecklistItem = (id: string) => {
    update({ checklist: value.checklist.filter((i) => i.id !== id) });
  };

  const toggleChecklistItem = (id: string) => {
    update({
      checklist: value.checklist.map((i) =>
        i.id === id ? { ...i, completed: !i.completed } : i
      ),
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      update({ attachments: [...value.attachments, ...Array.from(e.target.files)] });
    }
  };

  const removeAttachment = (index: number) => {
    update({ attachments: value.attachments.filter((_, i) => i !== index) });
  };

  const p = (name: string) => (idPrefix ? `${idPrefix}-${name}` : name);

  return (
    <div className="space-y-4 pt-4">
      {/* Datas e tempo */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Datas e Tempo
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Data de Início</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {value.startDate ? format(value.startDate, "dd/MM/yyyy") : <span>Selecionar</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={value.startDate ?? undefined}
                  onSelect={(date) => update({ startDate: date ?? null })}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label>Data de Entrega</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {value.dueDate ? format(value.dueDate, "dd/MM/yyyy") : <span>Selecionar</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={value.dueDate ?? undefined}
                  onSelect={(date) => update({ dueDate: date ?? null })}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={p("startTime")}>Hora de Início</Label>
            <Input
              id={p("startTime")}
              type="time"
              placeholder="09:00"
              value={value.startTime}
              onChange={(e) => update({ startTime: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={p("endTime")}>Hora de Término</Label>
            <Input
              id={p("endTime")}
              type="time"
              placeholder="18:00"
              value={value.endTime}
              onChange={(e) => update({ endTime: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Label htmlFor={p("estimatedHours")} className="flex items-center gap-1">
                    Estimativa (horas)
                    <AlertCircle className="h-3 w-3 text-muted-foreground" />
                  </Label>
                </TooltipTrigger>
                <TooltipContent>Tempo estimado em horas para concluir esta tarefa</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Input
              id={p("estimatedHours")}
              type="number"
              step="0.5"
              placeholder="8"
              value={value.estimatedEffortHours ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                update({ estimatedEffortHours: v === "" ? null : Number(v) });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={p("storyPoints")}>Story Points</Label>
            <Input
              id={p("storyPoints")}
              type="number"
              placeholder="5"
              value={value.estimatedStoryPoints ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                update({ estimatedStoryPoints: v === "" ? null : Number(v) });
              }}
            />
          </div>
        </div>
      </div>

      {/* Checklist / Subtarefas */}
      <div className="space-y-2">
        <Label>Checklist / Subtarefas</Label>
        <div className="space-y-2">
          {value.checklist.map((item) => (
            <div key={item.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
              <Checkbox
                checked={item.completed}
                onCheckedChange={() => toggleChecklistItem(item.id)}
              />
              <span className={cn("flex-1 text-sm", item.completed && "line-through text-muted-foreground")}>
                {item.text}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => removeChecklistItem(item.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Nova subtarefa..."
            value={newChecklistItem}
            onChange={(e) => setNewChecklistItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addChecklistItem();
              }
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={addChecklistItem}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Anexos: UI para seleção de arquivos e link externo. Persistência via API (multipart ou endpoint dedicado) em passo futuro; createProjectTask/updateProjectTask atuais recebem JSON. */}
      <div className="space-y-2">
        <Label>Anexos</Label>
        <div className="space-y-2">
          {value.attachments.map((file, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
              <span className="text-sm truncate flex-1">{file.name}</span>
              <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => removeAttachment(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            id={p("file-upload")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => document.getElementById(p("file-upload"))?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload de Arquivo
          </Button>
        </div>
        <Input
          placeholder="Ou cole um link (Google Drive, Figma...)"
          value={value.externalLink}
          onChange={(e) => update({ externalLink: e.target.value })}
        />
      </div>

      {/* Observadores (Watchers) */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Observadores (Watchers)
        </Label>
        <Select
          value=""
          onValueChange={(id) => {
            if (id && !value.watchers.includes(id)) {
              update({ watchers: [...value.watchers, id] });
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Adicionar observador" />
          </SelectTrigger>
          <SelectContent>
            {members.filter((m) => !value.watchers.includes(m.id)).map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2">
          {value.watchers.map((watcherId) => {
            const member = members.find((m) => m.id === watcherId);
            return member ? (
              <Badge key={watcherId} variant="secondary">
                {member.name}
                <button
                  type="button"
                  className="ml-1 hover:opacity-80"
                  onClick={() => update({ watchers: value.watchers.filter((w) => w !== watcherId) })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : (
              <Badge key={watcherId} variant="secondary">{watcherId}</Badge>
            );
          })}
        </div>
      </div>

      {/* Visibilidade */}
      <div className="space-y-2">
        <Label htmlFor={p("visibility")}>Visibilidade</Label>
        <Select
          value={value.visibility || "internal"}
          onValueChange={(v) => update({ visibility: v })}
        >
          <SelectTrigger id={p("visibility")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="internal">Interna</SelectItem>
            <SelectItem value="shared_with_client">Compartilhada com Cliente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cobrável */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor={p("billable")} className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Cobrável (Billable)
          </Label>
          <Switch
            id={p("billable")}
            checked={value.billable}
            onCheckedChange={(checked) => update({ billable: checked })}
          />
        </div>
        {value.billable && (
          <div className="grid grid-cols-2 gap-4 pl-6">
            <div className="space-y-2">
              <Label htmlFor={p("hourlyRate")}>Taxa por Hora (R$)</Label>
              <Input
                id={p("hourlyRate")}
                type="number"
                step="0.01"
                placeholder="150.00"
                value={value.hourlyRate ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  update({ hourlyRate: v === "" ? null : Number(v) });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={p("budgetCap")}>Orçamento Máximo (R$)</Label>
              <Input
                id={p("budgetCap")}
                type="number"
                step="0.01"
                placeholder="5000.00"
                value={value.budgetCap ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  update({ budgetCap: v === "" ? null : Number(v) });
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Recorrência */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            Recorrência
          </Label>
          <Switch
            checked={value.hasRecurrence}
            onCheckedChange={(checked) => update({ hasRecurrence: checked })}
          />
        </div>
        {value.hasRecurrence && (
          <div className="pl-6">
            <Select
              value={value.recurrenceType || "weekly"}
              onValueChange={(v) => update({ recurrenceType: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diária</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="custom">Personalizada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Local/Link de Reunião */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Local/Link de Reunião
        </Label>
        <Input
          placeholder="Endereço ou sala"
          value={value.meetingLocation}
          onChange={(e) => update({ meetingLocation: e.target.value })}
        />
        <Input
          placeholder="Link do Meet/Zoom"
          type="url"
          value={value.meetingLink}
          onChange={(e) => update({ meetingLink: e.target.value })}
        />
      </div>

      {/* Severidade (para bugs) */}
      <div className="space-y-2">
        <Label htmlFor={p("severity")}>Severidade (para bugs)</Label>
        <Select
          value={value.severity || ""}
          onValueChange={(v) => update({ severity: v })}
        >
          <SelectTrigger id={p("severity")}>
            <SelectValue placeholder="Selecionar severidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="critical">Crítica</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
