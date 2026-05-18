import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus, X, FolderKanban, Building2, UserCircle2, MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SystemRichEditor } from '@/components/editor';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/sonner';

import type { TaskFormContext, TaskFormSuccessResult, TaskFormValues } from '@/lib/taskFormTypes';
import { normalizeCreatedClientTask, normalizeCreatedLeadTask } from '@/lib/normalizeCreatedTask';
import { tasksService, type ChecklistItem, type Task } from '@/services/tasks';
import { clientsService } from '@/services/clients';
import { projectsService } from '@/services/projects';
import { apiClient } from '@/integrations/api/client';
import { getMyTenantUsers, type TenantUser } from '@/services/tenantLimits';
import { teamsService } from '@/services/teams';
import {
  TaskAdvancedFields,
  DEFAULT_TASK_ADVANCED_FORM_VALUE,
  formValueToApiPayload,
  type TaskAdvancedFormValue,
} from '@/components/tasks/TaskAdvancedFields';
import { TaskChecklistEditor } from '@/components/tasks/TaskChecklistEditor';

export interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: TaskFormContext;
  initialValues?: Partial<TaskFormValues>;
  onSuccess?: (result: TaskFormSuccessResult) => void;
  /** Quando false, o submit não é enviado (ex.: sem tasks.create). */
  canSubmit?: boolean;
}

function defaultValues(
  ctx: TaskFormContext,
  init?: Partial<TaskFormValues>
): TaskFormValues {
  const base: TaskFormValues = {
    title: '',
    description: '',
    assignee_id: null,
    assignee_name: null,
    priority: 'medium',
    status: 'pending',
    due_date: null,
    due_time: null,
    checklist: [],
    deal: null,
    client_id: null,
    client_name: null,
  };
  if (ctx.origin === 'lead') {
    base.status = 'Pendente';
  }
  if (ctx.origin === 'client') {
    base.status = 'Pendente';
  }
  if (ctx.origin === 'chat') {
    base.client_id = ctx.clientId ?? null;
    base.client_name = ctx.clientName ?? null;
  }
  return { ...base, ...init };
}

function originBadge(context: TaskFormContext) {
  switch (context.origin) {
    case 'standalone':
      return { label: 'Avulsa', icon: null as React.ReactNode };
    case 'project':
      return { label: 'Projeto', icon: <FolderKanban className="h-3.5 w-3.5" /> };
    case 'client':
      return { label: 'Cliente', icon: <Building2 className="h-3.5 w-3.5" /> };
    case 'lead':
      return { label: 'Lead', icon: <UserCircle2 className="h-3.5 w-3.5" /> };
    case 'chat':
      return { label: 'Chat', icon: <MessageCircle className="h-3.5 w-3.5" /> };
    default:
      return { label: 'Tarefa', icon: null };
  }
}

export function TaskFormDialog({
  open,
  onOpenChange,
  context,
  initialValues,
  onSuccess,
  canSubmit = true,
}: TaskFormDialogProps) {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [status, setStatus] = useState('pending');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [dueTime, setDueTime] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [deal, setDeal] = useState('');

  const [tagsInput, setTagsInput] = useState<string[]>([]);
  const [newTagText, setNewTagText] = useState('');
  const [taskType, setTaskType] = useState('task');
  const [includeInReleaseNotes, setIncludeInReleaseNotes] = useState(true);
  const [releaseNoteType, setReleaseNoteType] = useState<'feature' | 'fix' | 'improvement' | 'internal'>('feature');
  const [assigneeTeamFilter, setAssigneeTeamFilter] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [advancedFormValue, setAdvancedFormValue] = useState<TaskAdvancedFormValue>(
    DEFAULT_TASK_ADVANCED_FORM_VALUE
  );

  const isProject = context.origin === 'project';
  const isClient = context.origin === 'client';
  const isLead = context.origin === 'lead';
  const isChat = context.origin === 'chat';
  const isStandalone = context.origin === 'standalone';

  const badge = useMemo(() => originBadge(context), [context]);

  useEffect(() => {
    if (!open || !isProject || !context.teams?.length) {
      setTeamMembers([]);
      return;
    }
    if (!assigneeTeamFilter) {
      setTeamMembers([]);
      return;
    }
    teamsService
      .getTeamMembers(assigneeTeamFilter)
      .then((list) =>
        setTeamMembers(list.map((m) => ({ id: m.user_id, name: m.name || m.email || m.user_id })))
      )
      .catch(() => setTeamMembers([]));
  }, [open, isProject, context, assigneeTeamFilter]);

  useEffect(() => {
    if (!open) return;
    getMyTenantUsers()
      .then(setTenantUsers)
      .catch(() => setTenantUsers([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const d = defaultValues(context, initialValues);
    setTitle(d.title);
    setDescription(d.description);
    setAssigneeId(d.assignee_id);
    setPriority(d.priority);
    setStatus(d.status);
    setDueDate(d.due_date ? new Date(`${d.due_date}T12:00:00`) : undefined);
    setDueTime(d.due_time || '');
    setChecklist(d.checklist ?? []);
    setDeal(d.deal || '');
    setTagsInput([]);
    setNewTagText('');
    setTaskType('task');
    setIncludeInReleaseNotes(true);
    setReleaseNoteType('feature');
    setAssigneeTeamFilter(null);
    setAdvancedFormValue(DEFAULT_TASK_ADVANCED_FORM_VALUE);
  }, [open, context, initialValues]);

  const assigneeOptions = useMemo(() => {
    if (isProject && assigneeTeamFilter && teamMembers.length > 0) return teamMembers;
    return tenantUsers.map((u) => ({
      id: u.id,
      name: u.full_name?.trim() || u.email || u.id,
    }));
  }, [isProject, assigneeTeamFilter, teamMembers, tenantUsers]);

  const onAssigneeChange = (v: string) => {
    if (!v || v === '__none') {
      setAssigneeId(null);
      return;
    }
    const u = assigneeOptions.find((x) => x.id === v);
    setAssigneeId(v);
  };

  const addTag = () => {
    const t = newTagText.trim();
    if (!t) return;
    setTagsInput((prev) => [...prev, t]);
    setNewTagText('');
  };

  const memberOptionsForAdvanced = useMemo(
    () => tenantUsers.map((u) => ({ id: u.id, name: u.full_name?.trim() || u.email || u.id })),
    [tenantUsers]
  );

  const submit = async () => {
    if (!canSubmit) {
      toast.error('Sem permissão para criar tarefas.');
      return;
    }
    const t = title.trim();
    if (!t) {
      toast.error('Título é obrigatório');
      return;
    }

    const assigneeName =
      assigneeId != null ? assigneeOptions.find((x) => x.id === assigneeId)?.name ?? null : null;

    const dueYmd = dueDate ? format(dueDate, 'yyyy-MM-dd') : null;

    setLoading(true);
    try {
      if (context.origin === 'standalone' || context.origin === 'chat') {
        const clientId = context.origin === 'chat' ? context.clientId ?? undefined : undefined;
        const clientName = context.origin === 'chat' ? context.clientName ?? undefined : undefined;
        const row = await tasksService.createTask({
          title: t,
          description: description || undefined,
          date: dueYmd,
          time: dueTime || undefined,
          status: status === 'completed' ? 'completed' : 'pending',
          priority,
          clientId,
          client: clientName,
          deal: deal || undefined,
          assignee: assigneeName ?? undefined,
          assignee_id: assigneeId,
          checklist,
        });
        const task: Task = { ...row, date: row.date || '' };
        toast.success('Tarefa criada');
        onOpenChange(false);
        onSuccess?.({ origin: context.origin === 'chat' ? 'chat' : 'standalone', task });
        return;
      }

      if (context.origin === 'client') {
        const dueIso = dueYmd ? new Date(`${dueYmd}T12:00:00.000Z`).toISOString() : undefined;
        const row = await clientsService.createClientTask({
          client_id: context.clientId,
          title: t,
          description: description || undefined,
          status: status || 'Pendente',
          due_date: dueIso,
        });
        const task = normalizeCreatedClientTask(row, context.clientName || '');
        toast.success('Tarefa criada');
        onOpenChange(false);
        onSuccess?.({ origin: 'client', task });
        return;
      }

      if (context.origin === 'lead') {
        const dueIso = dueYmd ? new Date(`${dueYmd}T12:00:00.000Z`).toISOString() : undefined;
        const res = await apiClient.post<{
          id: string;
          lead_id: string;
          title: string;
          description?: string | null;
          status?: string | null;
          due_date?: string | null;
        }>('/api/lead-tasks', {
          lead_id: context.leadId,
          title: t,
          description: description || '',
          status,
          due_date: dueIso,
        });
        if (res.error) throw new Error(res.error);
        if (!res.data) throw new Error('Resposta inválida');
        const task = normalizeCreatedLeadTask(res.data, context.leadName || '');
        toast.success('Tarefa criada');
        onOpenChange(false);
        onSuccess?.({ origin: 'lead', task });
        return;
      }

      if (context.origin === 'project') {
        const adv = formValueToApiPayload(advancedFormValue);
        const apiTask = await projectsService.createProjectTask(context.listId, {
          title: t,
          description: description || null,
          status: 'todo',
          priority,
          due_date: dueYmd || null,
          assignee_id: assigneeId,
          tags: tagsInput,
          task_type: taskType,
          area_id: context.areaId ?? null,
          ...(context.versionId ? { version_id: context.versionId } : {}),
          checklist,
          start_date: (adv.start_date as string | null) ?? null,
          start_time: (adv.start_time as string | null) ?? null,
          end_time: (adv.end_time as string | null) ?? null,
          estimated_effort_hours: adv.estimated_effort_hours as number | null,
          estimated_story_points: adv.estimated_story_points as number | null,
          watchers: (adv.watchers as string[]) || [],
          visibility: (adv.visibility as string) || 'internal',
          billable: Boolean(adv.billable),
          hourly_rate: adv.hourly_rate as number | null,
          budget_cap: adv.budget_cap as number | null,
          recurrence_rule: adv.recurrence_rule,
          meeting_location: adv.meeting_location as string | null,
          meeting_link: adv.meeting_link as string | null,
          severity: adv.severity as string | null,
          include_in_release_notes: includeInReleaseNotes,
          release_note_type: releaseNoteType,
        });
        toast.success('Tarefa criada');
        onOpenChange(false);
        onSuccess?.({ origin: 'project', apiTask, listId: context.listId });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar a tarefa');
    } finally {
      setLoading(false);
    }
  };

  const formBody = (
    <div className="space-y-4 px-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1 font-normal">
          {badge.icon}
          {badge.label}
        </Badge>
        {context.origin === 'project' && context.projectName ? (
          <span className="text-sm text-muted-foreground truncate max-w-[220px]">
            {context.projectName}
          </span>
        ) : null}
        {context.origin === 'client' && context.clientName ? (
          <span className="text-sm text-muted-foreground truncate max-w-[220px]">
            {context.clientName}
          </span>
        ) : null}
        {context.origin === 'lead' && context.leadName ? (
          <span className="text-sm text-muted-foreground truncate max-w-[220px]">
            {context.leadName}
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tf-title">Título *</Label>
        <Input id="tf-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da tarefa" />
      </div>

      <div className="space-y-2">
        <Label>Descrição</Label>
        <SystemRichEditor
          value={description}
          onChange={setDescription}
          placeholder="Detalhes…"
          className="min-h-[100px] rounded-md border"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Prioridade</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Baixa</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(isStandalone || isChat) && (
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="completed">Concluída</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {(isClient || isLead) && (
          <div className="space-y-2 sm:col-span-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Em andamento">Em andamento</SelectItem>
                <SelectItem value="Concluído">Concluído</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Data</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-start font-normal">
                {dueDate ? format(dueDate, 'dd/MM/yyyy') : 'Sem data'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tf-time">Horário</Label>
          <Input id="tf-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </div>
      </div>

      {!isClient && !isLead && (
        <div className="space-y-2">
          <Label>Responsável</Label>
          {isProject && context.teams && context.teams.length > 0 ? (
            <div className="space-y-2">
              <Select
                value={assigneeTeamFilter ?? '__all'}
                onValueChange={(v) => setAssigneeTeamFilter(v === '__all' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por equipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos os usuários</SelectItem>
                  {context.teams.map((tm) => (
                    <SelectItem key={tm.id} value={tm.id}>
                      {tm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Select
            value={assigneeId ?? '__none'}
            onValueChange={onAssigneeChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Ninguém" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sem responsável</SelectItem>
              {assigneeOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(isClient || isLead) && (
        <p className="text-xs text-muted-foreground">
          Responsável por tarefas de cliente/lead será suportado quando a API permitir assignee nesta origem.
        </p>
      )}

      {(isStandalone || isChat) && (
        <>
          <div className="space-y-2">
            <Label htmlFor="tf-deal">Negócio (opcional)</Label>
            <Input id="tf-deal" value={deal} onChange={(e) => setDeal(e.target.value)} />
          </div>
          <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/20">
            <p className="text-xs font-medium text-muted-foreground">
              Vínculos opcionais (projeto / cliente / lead) — em breve neste formulário.
            </p>
          </div>
        </>
      )}

      {(isStandalone || isChat || isProject) && (
        <TaskChecklistEditor items={checklist} onChange={setChecklist} />
      )}

      {isProject && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Tarefa</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Changelog</Label>
              <Select value={releaseNoteType} onValueChange={(value) => setReleaseNoteType(value as typeof releaseNoteType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="fix">Correção</SelectItem>
                  <SelectItem value="improvement">Melhoria</SelectItem>
                  <SelectItem value="internal">Interno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border p-3">
            <Checkbox
              id="include-release-notes"
              checked={includeInReleaseNotes}
              onCheckedChange={(checked) => setIncludeInReleaseNotes(Boolean(checked))}
            />
            <Label htmlFor="include-release-notes">Incluir no changelog</Label>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2 mb-1">
              {tagsInput.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                  <button
                    type="button"
                    className="ml-1 hover:text-destructive"
                    onClick={() => setTagsInput((prev) => prev.filter((x) => x !== tag))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova tag"
                value={newTagText}
                onChange={(e) => setNewTagText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={addTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Accordion type="single" collapsible className="w-full border rounded-md px-2">
            <AccordionItem value="adv" className="border-0">
              <AccordionTrigger className="text-sm font-semibold py-3">
                Configurações avançadas (projeto)
              </AccordionTrigger>
              <AccordionContent>
                <TaskAdvancedFields
                  value={advancedFormValue}
                  onChange={setAdvancedFormValue}
                  members={memberOptionsForAdvanced}
                  mode="create"
                  idPrefix="tfdialog"
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
    </div>
  );

  const footer = (
    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end w-full">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
        Cancelar
      </Button>
      <Button type="button" onClick={() => void submit()} disabled={loading}>
        {loading ? 'A criar…' : 'Criar tarefa'}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[92dvh] max-h-[92dvh] flex flex-col p-0 gap-0 rounded-t-xl">
          <SheetHeader className="px-4 pt-4 pb-2 text-left border-b shrink-0">
            <SheetTitle>Nova tarefa</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3">{formBody}</div>
          <SheetFooter className="px-4 py-3 border-t shrink-0">{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[90vh] overflow-y-auto flex flex-col gap-0 p-0',
          isProject ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        )}
      >
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>
            Preencha os dados. O destino depende do contexto (lista unificada em /tasks quando aplicável).
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2 flex-1 overflow-y-auto">{formBody}</div>
        <DialogFooter className="px-6 py-4 border-t shrink-0">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
