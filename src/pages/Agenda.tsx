import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  addWeeks,
  addMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  User,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { membersService, type Member } from '@/services/members';
import {
  type Appointment,
  type AppointmentAttendee,
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  retryAppointmentSync,
} from '@/services/appointments';
import { getGoogleCalendarStatus } from '@/services/googleCalendarIntegration';
import { ClientSearchCombobox } from '@/components/clients/ClientSearchCombobox';
import { LeadSearchCombobox } from '@/components/leads/LeadSearchCombobox';

const QK = ['appointments', 'list'] as const;
const QK_G = ['google-calendar-status'] as const;

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'meeting', label: 'Reunião' },
  { value: 'call', label: 'Chamada' },
  { value: 'visit', label: 'Visita' },
  { value: 'other', label: 'Outro' },
];

const TYPE_ACCENT: Record<string, string> = {
  meeting: 'border-l-violet-400/80 dark:border-l-violet-500/70',
  call: 'border-l-sky-400/80 dark:border-l-sky-500/70',
  visit: 'border-l-emerald-400/80 dark:border-l-emerald-500/70',
  other: 'border-l-stone-400/70 dark:border-l-stone-500/60',
};

type DateRangePreset = 'today' | 'week' | 'month' | 'custom';

function appointmentStatusLabel(status: string): string {
  if (status === 'done') return 'Concluído';
  if (status === 'cancelled') return 'Cancelado';
  return 'Agendado';
}

/** Rótulo e “tom” leve para sync, sem vermelho agressivo. */
function syncPill(
  ap: Appointment,
): { key: 'google' | 'error' | 'crm'; label: string; className: string } {
  if (ap.create_google_event && ap.sync_status === 'synced') {
    return { key: 'google', label: 'Google', className: 'border-sky-200/80 bg-sky-50/80 text-sky-900 dark:border-sky-800/50 dark:bg-sky-950/30 dark:text-sky-200' };
  }
  if (ap.create_google_event && ap.sync_status === 'error') {
    return { key: 'error', label: 'Erro', className: 'border-amber-200/80 bg-amber-50/70 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200' };
  }
  if (ap.create_google_event) {
    return { key: 'google', label: 'Pendente', className: 'border-border bg-muted/50 text-muted-foreground' };
  }
  return { key: 'crm', label: 'CRM', className: 'border-border/80 bg-card text-muted-foreground' };
}

function localToIso(d: Date, timeHHmm: string): string {
  const [hh, mm] = timeHHmm.split(':').map((x) => parseInt(x, 10) || 0);
  const x = new Date(d);
  x.setHours(hh, mm, 0, 0);
  return x.toISOString();
}

function extractLocalDateTime(iso: string): { date: Date; time: string } {
  const t = parseISO(iso);
  if (Number.isNaN(t.getTime())) {
    return { date: new Date(), time: '09:00' };
  }
  return {
    date: t,
    time: format(t, 'HH:mm'),
  };
}

function canEditAgendaItem(
  userId: string | undefined,
  ap: Pick<Appointment, 'created_by' | 'responsible_user_id'>,
  isEditOwnOnly: boolean,
): boolean {
  if (!userId) return false;
  if (!isEditOwnOnly) return true;
  return ap.created_by === userId || ap.responsible_user_id === userId;
}

type AttForm = { name: string; email: string; phone: string };

const buildEmptyForm = (userId: string | undefined) => ({
  title: '',
  description: '',
  type: 'meeting',
  link: 'none' as 'none' | 'client' | 'lead',
  clientId: null as string | null,
  leadId: null as string | null,
  responsibleId: userId ?? '',
  day: new Date(),
  timeStart: '09:00',
  timeEnd: '10:00',
  location: '',
  createGoogle: false,
  createMeet: false,
  rem15: true,
  rem30: false,
  rem60: false,
  attendees: [] as AttForm[],
});

export default function Agenda() {
  const { user } = useAuth();
  const { canCreate, canEdit, isEditOwnOnly } = useModulePermissions();
  const hasAgenda = useFeatureFlag('agenda');
  const canCreateA = canCreate('agenda');
  const canEditA = canEdit('agenda');
  const ownOnly = isEditOwnOnly('agenda');
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [datePreset, setDatePreset] = useState<DateRangePreset>('week');
  const [dateFrom, setDateFrom] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dateTo, setDateTo] = useState(() => endOfWeek(new Date(), { weekStartsOn: 1 }));
  const [responsibleFilter, setResponsibleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const [sheetOpen, setSheetOpen] = useState(false);
  /** Modo criação: null. Edição/visualização: id do compromisso. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<Appointment | null>(null);
  const [form, setForm] = useState(() => buildEmptyForm(user?.id));
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: gStatus } = useQuery({
    queryKey: QK_G,
    queryFn: getGoogleCalendarStatus,
    staleTime: 60_000,
  });
  const googleConnected = gStatus?.connected === true;

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: () => membersService.getMembers(),
  });

  const applyToday = useCallback(() => {
    const n = new Date();
    setDateFrom(startOfDay(n));
    setDateTo(endOfDay(n));
    setDatePreset('today');
  }, []);

  const applyWeek = useCallback(() => {
    const n = new Date();
    setDateFrom(startOfWeek(n, { weekStartsOn: 1 }));
    setDateTo(endOfWeek(n, { weekStartsOn: 1 }));
    setDatePreset('week');
  }, []);

  const applyMonth = useCallback(() => {
    const n = new Date();
    setDateFrom(startOfMonth(n));
    setDateTo(endOfMonth(n));
    setDatePreset('month');
  }, []);

  const goWeek = useCallback(
    (dir: -1 | 1) => {
      const w = addWeeks(startOfDay(dateFrom), dir);
      setDateFrom(startOfWeek(w, { weekStartsOn: 1 }));
      setDateTo(endOfWeek(w, { weekStartsOn: 1 }));
      setDatePreset('week');
    },
    [dateFrom],
  );

  const goMonth = useCallback(
    (dir: -1 | 1) => {
      const m = addMonths(startOfDay(dateFrom), dir);
      setDateFrom(startOfMonth(m));
      setDateTo(endOfMonth(m));
      setDatePreset('month');
    },
    [dateFrom],
  );

  const onPickDateFrom = useCallback((d: Date | undefined) => {
    if (!d) return;
    const from = startOfDay(d);
    setDateFrom(from);
    setDatePreset('custom');
    setDateTo((prev) => (from > endOfDay(prev) ? endOfDay(from) : prev));
  }, []);

  const onPickDateTo = useCallback((d: Date | undefined) => {
    if (!d) return;
    const to = endOfDay(d);
    setDateTo(to);
    setDatePreset('custom');
    setDateFrom((prev) => (startOfDay(prev) > to ? startOfDay(d) : prev));
  }, []);

  const dateFromIso = useMemo(() => startOfDay(dateFrom).toISOString(), [dateFrom]);
  const dateToIso = useMemo(() => endOfDay(dateTo).toISOString(), [dateTo]);

  const listParams = useMemo(
    () => ({
      date_from: dateFromIso,
      date_to: dateToIso,
      responsible_user_id: responsibleFilter || undefined,
      status: statusFilter || undefined,
      type: typeFilter || undefined,
      limit: 200,
      offset: 0,
    }),
    [dateFromIso, dateToIso, responsibleFilter, statusFilter, typeFilter],
  );

  const { data: listData, isPending: listLoading } = useQuery({
    queryKey: [...QK, listParams],
    queryFn: () => listAppointments(listParams),
    enabled: hasAgenda,
  });
  const items = listData?.items ?? [];

  const grouped = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of items) {
      const k = format(parseISO(a.starts_at), 'yyyy-MM-dd');
      const g = m.get(k) ?? [];
      g.push(a);
      m.set(k, g);
    }
    for (const g of m.values()) {
      g.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  }, [items]);

  const isCancelled = editingRow?.status === 'cancelled';
  const canMutate = useMemo(() => {
    if (isCancelled) return false;
    if (!editingId) return canCreateA;
    if (!editingRow) return false;
    return canEditA && canEditAgendaItem(user?.id, editingRow, ownOnly);
  }, [isCancelled, editingId, editingRow, canCreateA, canEditA, ownOnly, user?.id]);

  const formDisabled = !canMutate;

  useEffect(() => {
    if (searchParams.get('new') !== '1' || !canCreateA) return;
    const clientIdRaw = searchParams.get('client_id');
    const clientIdOk =
      clientIdRaw && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientIdRaw)
        ? clientIdRaw
        : null;
    setEditingId(null);
    setEditingRow(null);
    const base = buildEmptyForm(user?.id);
    if (clientIdOk) {
      setForm({ ...base, link: 'client' as const, clientId: clientIdOk });
    } else {
      setForm(base);
    }
    setSheetOpen(true);
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete('new');
        n.delete('client_id');
        return n;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams, canCreateA, user?.id]);

  const openNew = useCallback(() => {
    if (!canCreateA) return;
    setEditingId(null);
    setEditingRow(null);
    setForm(buildEmptyForm(user?.id));
    setSheetOpen(true);
  }, [canCreateA, user?.id]);

  const openDetail = useCallback(
    async (id: string) => {
      try {
        const row = await getAppointment(id);
        setEditingId(row.id);
        setEditingRow(row);
        const s = extractLocalDateTime(row.starts_at);
        const e = extractLocalDateTime(row.ends_at);
        const rj = row.reminders_json as { method: string; minutes: number }[] | null;
        const mins = new Set((rj ?? []).map((x) => x.minutes));
        setForm({
          title: row.title,
          description: row.description ?? '',
          type: row.type || 'meeting',
          link: row.client_id ? 'client' : row.lead_id ? 'lead' : 'none',
          clientId: row.client_id,
          leadId: row.lead_id,
          responsibleId: row.responsible_user_id ?? '',
          day: s.date,
          timeStart: s.time,
          timeEnd: e.time,
          location: row.location ?? '',
          createGoogle: row.create_google_event,
          createMeet: Boolean(row.google_meet_link),
          rem15: mins.has(15),
          rem30: mins.has(30),
          rem60: mins.has(60),
          attendees: (row.attendees ?? []).map((x: AppointmentAttendee) => ({
            name: x.name ?? '',
            email: x.email ?? '',
            phone: x.phone ?? '',
          })),
        });
        setSheetOpen(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao carregar');
      }
    },
    [],
  );

  const closeSheet = useCallback((o: boolean) => {
    setSheetOpen(o);
    if (!o) {
      setEditingId(null);
      setEditingRow(null);
    }
  }, []);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [...QK] });
  }, [queryClient]);

  const createMut = useMutation({
    mutationFn: async () => {
      const start = localToIso(form.day, form.timeStart);
      const end = localToIso(form.day, form.timeEnd);
      if (new Date(end) <= new Date(start)) throw new Error('A hora de fim deve ser depois do início');
      const rems: { method: 'popup'; minutes: number }[] = [];
      if (form.rem15) rems.push({ method: 'popup', minutes: 15 });
      if (form.rem30) rems.push({ method: 'popup', minutes: 30 });
      if (form.rem60) rems.push({ method: 'popup', minutes: 60 });
      return createAppointment({
        title: form.title.trim(),
        description: form.description || null,
        type: form.type,
        client_id: form.link === 'client' ? form.clientId : null,
        lead_id: form.link === 'lead' ? form.leadId : null,
        responsible_user_id: form.responsibleId || null,
        starts_at: start,
        ends_at: end,
        location: form.location || null,
        create_google_event: form.createGoogle,
        create_meet: form.createMeet,
        attendees: form.attendees
          .filter((a) => a.name?.trim() || a.email?.trim() || a.phone?.trim())
          .map((a) => ({ name: a.name, email: a.email || null, phone: a.phone || null, attendee_type: 'external' })),
        reminders: rems.length ? rems : null,
      });
    },
    onSuccess: () => {
      toast.success('Compromisso criado');
      closeSheet(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editingId) throw new Error();
      const start = localToIso(form.day, form.timeStart);
      const end = localToIso(form.day, form.timeEnd);
      if (new Date(end) <= new Date(start)) throw new Error('A hora de fim deve ser depois do início');
      const rems: { method: 'popup'; minutes: number }[] = [];
      if (form.rem15) rems.push({ method: 'popup', minutes: 15 });
      if (form.rem30) rems.push({ method: 'popup', minutes: 30 });
      if (form.rem60) rems.push({ method: 'popup', minutes: 60 });
      return updateAppointment(editingId, {
        title: form.title.trim(),
        description: form.description || null,
        type: form.type,
        client_id: form.link === 'client' ? form.clientId : null,
        lead_id: form.link === 'lead' ? form.leadId : null,
        responsible_user_id: form.responsibleId || null,
        starts_at: start,
        ends_at: end,
        location: form.location || null,
        create_meet: form.createMeet,
        attendees: form.attendees
          .filter((a) => a.name?.trim() || a.email?.trim() || a.phone?.trim())
          .map((a) => ({ name: a.name, email: a.email || null, phone: a.phone || null, attendee_type: 'external' })),
        reminders: rems.length ? rems : null,
      });
    },
    onSuccess: () => {
      toast.success('Compromisso atualizado');
      closeSheet(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelAppointment(id),
    onSuccess: () => {
      toast.success('Compromisso cancelado');
      setCancelId(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => retryAppointmentSync(id, false),
    onSuccess: () => {
      toast.success('Sincronização tentada');
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  const onSave = () => {
    if (!form.title.trim()) {
      toast.error('Indique o título');
      return;
    }
    if (!canMutate) return;
    setSaving(true);
    (editingId ? updateMut.mutateAsync() : createMut.mutateAsync()).finally(() => setSaving(false));
  };

  if (!hasAgenda) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4">
        <p className="text-muted-foreground">A agenda não está disponível no seu plano.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-8">
      <div className="md:hidden">
        <MobilePageHeader
          title="Agenda"
          primaryAction={
            canCreateA
              ? { label: 'Novo', icon: <Plus className="h-4 w-4" />, onClick: openNew, ariaLabel: 'Novo compromisso' }
              : undefined
          }
        />
      </div>

      <div className="hidden items-center justify-between gap-2 md:flex">
        <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
        {canCreateA ? (
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo compromisso
          </Button>
        ) : null}
      </div>

      {googleConnected === false ? (
        <Alert className="border-muted bg-muted/30">
          <CalendarClock className="h-4 w-4" />
          <AlertTitle>Google Agenda</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span>
              Conecte o Google Agenda para criar eventos, convites e reuniões com Meet automaticamente.
            </span>
            <Button variant="secondary" size="sm" className="shrink-0" asChild>
              <Link to="/settings?section=googleCalendar">Conectar Google Agenda</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-3 rounded-lg border border-border/80 bg-card/40 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-muted-foreground">Ver</span>
            <Button
              type="button"
              size="sm"
              variant={datePreset === 'today' ? 'default' : 'outline'}
              className="h-8"
              onClick={applyToday}
            >
              Hoje
            </Button>
            <Button
              type="button"
              size="sm"
              variant={datePreset === 'week' ? 'default' : 'outline'}
              className="h-8"
              onClick={applyWeek}
            >
              Semana
            </Button>
            <Button
              type="button"
              size="sm"
              variant={datePreset === 'month' ? 'default' : 'outline'}
              className="h-8"
              onClick={applyMonth}
            >
              Mês
            </Button>
            {datePreset === 'custom' ? (
              <span className="ml-1 text-xs text-muted-foreground">(personalizado)</span>
            ) : null}
          </div>
          <div className="flex items-center gap-0.5">
            {datePreset === 'week' ? (
              <>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => goWeek(-1)} aria-label="Semana anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-0.5 text-xs text-muted-foreground">navegar semana</span>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => goWeek(1)} aria-label="Próxima semana">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}
            {datePreset === 'month' ? (
              <>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => goMonth(-1)} aria-label="Mês anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-0.5 text-xs text-muted-foreground">navegar mês</span>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => goMonth(1)} aria-label="Próximo mês">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="space-y-1.5">
          <Label>De</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                {format(dateFrom, 'P', { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={onPickDateFrom} locale={ptBR} />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label>Até</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                {format(dateTo, 'P', { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={onPickDateTo} locale={ptBR} />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label>Responsável</Label>
          <Select
            value={responsibleFilter || '__all__'}
            onValueChange={(v) => setResponsibleFilter(v === '__all__' ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {members.map((m: Member) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="scheduled">Agendado</SelectItem>
              <SelectItem value="done">Concluído</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={typeFilter || '__all__'} onValueChange={(v) => setTypeFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        </div>
      </div>

      {listLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar…
        </div>
      ) : grouped.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Você ainda não possui compromissos nesse período.</p>
            {canCreateA ? <Button onClick={openNew}>Criar compromisso</Button> : null}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(([day, rows]) => (
            <section key={day} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {format(parseISO(`${day}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
              </h2>
              <ul className="space-y-2">
                {rows.map((ap) => {
                  const canRowEdit = canEditA && canEditAgendaItem(user?.id, ap, ownOnly);
                  const syncP = syncPill(ap);
                  const accent = TYPE_ACCENT[ap.type] ?? TYPE_ACCENT.other;
                  return (
                    <li key={ap.id}>
                      <Card
                        className={cn(
                          'group overflow-hidden border border-border/70 shadow-sm transition-colors',
                          'hover:border-border hover:bg-muted/20',
                          'border-l-4',
                          accent,
                        )}
                      >
                        <CardContent className="flex min-h-[4.5rem] gap-0 p-0 sm:min-h-0">
                          <div className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center border-r border-border/60 bg-muted/20 px-2 py-2.5 sm:py-3">
                            <span className="text-center text-sm font-semibold leading-none tabular-nums text-foreground">
                              {format(parseISO(ap.starts_at), 'HH:mm')}
                            </span>
                            <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">até</span>
                            <span className="text-center text-xs font-medium tabular-nums text-muted-foreground">
                              {format(parseISO(ap.ends_at), 'HH:mm')}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 px-2.5 py-2.5 sm:px-3 sm:py-2.5">
                            <p className="line-clamp-2 font-medium leading-snug text-foreground sm:line-clamp-1">
                              {ap.title}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary" className="h-5 max-w-[9rem] truncate px-1.5 text-[10px] font-normal sm:max-w-none">
                                {TYPE_OPTIONS.find((t) => t.value === ap.type)?.label ?? ap.type}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground"
                              >
                                {appointmentStatusLabel(ap.status)}
                              </Badge>
                              <span
                                className={cn(
                                  'inline-flex h-5 max-w-full items-center rounded-md border px-1.5 text-[10px] font-medium',
                                  syncP.className,
                                )}
                              >
                                {syncP.label}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                              {ap.client_name ? (
                                <span className="inline-flex max-w-full items-center gap-1 truncate">
                                  <User className="h-3 w-3 shrink-0" />
                                  {ap.client_name}
                                </span>
                              ) : null}
                              {ap.lead_name && !ap.client_name ? (
                                <span className="inline-flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  Lead: {ap.lead_name}
                                </span>
                              ) : null}
                              {ap.responsible_name ? <span>Resp. {ap.responsible_name}</span> : null}
                            </div>
                            {ap.sync_status === 'error' && ap.create_google_event ? (
                              <p className="mt-1.5 text-[11px] text-muted-foreground">
                                Não foi possível sincronizar com o Google Agenda.
                              </p>
                            ) : null}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              {ap.google_meet_link ? (
                                <a
                                  href={ap.google_meet_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                                >
                                  <Video className="h-3.5 w-3.5 shrink-0" />
                                  Meet
                                </a>
                              ) : null}
                              {ap.google_html_link ? (
                                <a
                                  href={ap.google_html_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                                >
                                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                  Google
                                </a>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end justify-center gap-1 border-l border-border/50 bg-muted/5 px-1.5 py-1.5 sm:px-2">
                            {ap.sync_status === 'error' && ap.create_google_event && canRowEdit ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 px-2 text-[10px] sm:text-xs"
                                onClick={() => retryMut.mutate(ap.id)}
                                disabled={retryMut.isPending}
                              >
                                <RefreshCw className="h-3 w-3 shrink-0" />
                                <span className="hidden min-[400px]:inline">Retentar</span>
                              </Button>
                            ) : null}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {ap.sync_status === 'error' && ap.create_google_event && canRowEdit ? (
                                  <DropdownMenuItem
                                    onClick={() => retryMut.mutate(ap.id)}
                                    disabled={retryMut.isPending}
                                  >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Retentar sincronização
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem onClick={() => void openDetail(ap.id)}>
                                  {canRowEdit && ap.status !== 'cancelled' ? 'Editar' : 'Ver'}
                                </DropdownMenuItem>
                                {canRowEdit && ap.status !== 'cancelled' ? (
                                  <DropdownMenuItem className="text-destructive" onClick={() => setCancelId(ap.id)}>
                                    Cancelar
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={closeSheet}>
        <SheetContent
          className="flex w-full max-w-lg flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
          side="right"
        >
          <SheetHeader className="space-y-1 border-b p-4 text-left">
            <SheetTitle>
              {editingId ? (isCancelled ? 'Compromisso' : 'Editar compromisso') : 'Novo compromisso'}
            </SheetTitle>
            <SheetDescription>
              {editingId && !canMutate
                ? 'Apenas visualização.'
                : 'Defina horário, participantes e, se quiser, sincronização com o Google.'}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <Label htmlFor="apt-title">Título</Label>
              <Input
                id="apt-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                disabled={formDisabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apt-desc">Descrição</Label>
              <Textarea
                id="apt-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                disabled={formDisabled}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                  disabled={formDisabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select
                  value={form.responsibleId || '_none_'}
                  onValueChange={(v) => setForm((f) => ({ ...f, responsibleId: v === '_none_' ? '' : v }))}
                  disabled={formDisabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">—</SelectItem>
                    {members.map((m: Member) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cliente ou lead</Label>
              <RadioGroup
                className="flex flex-wrap gap-3"
                value={form.link}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    link: v as 'none' | 'client' | 'lead',
                    clientId: v === 'client' ? f.clientId : null,
                    leadId: v === 'lead' ? f.leadId : null,
                  }))
                }
                disabled={formDisabled}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="l-none" />
                  <label htmlFor="l-none" className="text-sm">
                    Nenhum
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="client" id="l-cl" />
                  <label htmlFor="l-cl" className="text-sm">
                    Cliente
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="lead" id="l-ld" />
                  <label htmlFor="l-ld" className="text-sm">
                    Lead
                  </label>
                </div>
              </RadioGroup>
              {form.link === 'client' ? (
                <ClientSearchCombobox
                  value={form.clientId}
                  onChange={(id) => setForm((f) => ({ ...f, clientId: id }))}
                  remoteSearch
                  disabled={formDisabled}
                />
              ) : null}
              {form.link === 'lead' ? (
                <LeadSearchCombobox
                  value={form.leadId}
                  onChange={(id) => setForm((f) => ({ ...f, leadId: id }))}
                  disabled={formDisabled}
                />
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Dia</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start" disabled={formDisabled}>
                    {format(form.day, 'P', { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={form.day}
                    onSelect={(d) => d && setForm((f) => ({ ...f, day: d }))}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Início</Label>
                <Input
                  type="time"
                  value={form.timeStart}
                  onChange={(e) => setForm((f) => ({ ...f, timeStart: e.target.value }))}
                  disabled={formDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input
                  type="time"
                  value={form.timeEnd}
                  onChange={(e) => setForm((f) => ({ ...f, timeEnd: e.target.value }))}
                  disabled={formDisabled}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Local</Label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  disabled={formDisabled}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Convidados (nome, e-mail, telefone)</Label>
              {form.attendees.map((a, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-3">
                  <Input
                    placeholder="Nome"
                    value={a.name}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = [...f.attendees];
                        next[i] = { ...next[i]!, name: e.target.value };
                        return { ...f, attendees: next };
                      })
                    }
                    disabled={formDisabled}
                  />
                  <Input
                    placeholder="E-mail"
                    value={a.email}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = [...f.attendees];
                        next[i] = { ...next[i]!, email: e.target.value };
                        return { ...f, attendees: next };
                      })
                    }
                    disabled={formDisabled}
                  />
                  <Input
                    placeholder="Telefone"
                    value={a.phone}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = [...f.attendees];
                        next[i] = { ...next[i]!, phone: e.target.value };
                        return { ...f, attendees: next };
                      })
                    }
                    disabled={formDisabled}
                  />
                </div>
              ))}
              {canMutate && !isCancelled ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, attendees: [...f.attendees, { name: '', email: '', phone: '' }] }))}
                >
                  Adicionar convidado
                </Button>
              ) : null}
            </div>

            {!editingId ? (
              <>
                <div className="flex flex-col gap-3 rounded-lg border p-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="g-cal"
                      checked={form.createGoogle}
                      onCheckedChange={(c) => setForm((f) => ({ ...f, createGoogle: c === true }))}
                    />
                    <label htmlFor="g-cal" className="text-sm font-medium">
                      Criar no Google Agenda
                    </label>
                  </div>
                  {form.createGoogle ? (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="g-meet"
                        checked={form.createMeet}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, createMeet: c === true }))}
                      />
                      <label htmlFor="g-meet" className="text-sm">
                        Criar Google Meet
                      </label>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>Lembretes (notificação)</Label>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="r15"
                        checked={form.rem15}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, rem15: c === true }))}
                      />
                      <label htmlFor="r15" className="text-sm">
                        15 minutos antes
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="r30"
                        checked={form.rem30}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, rem30: c === true }))}
                      />
                      <label htmlFor="r30" className="text-sm">
                        30 minutos antes
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="r60"
                        checked={form.rem60}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, rem60: c === true }))}
                      />
                      <label htmlFor="r60" className="text-sm">
                        60 minutos antes
                      </label>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {isCancelled ? (
              <p className="text-sm text-muted-foreground">Este compromisso está cancelado e não pode ser editado.</p>
            ) : null}
          </div>

          {canMutate && !isCancelled ? (
            <SheetFooter className="mt-auto gap-2 border-t p-4 sm:flex-col">
              <Button
                className="w-full"
                onClick={onSave}
                disabled={saving || createMut.isPending || updateMut.isPending}
              >
                {saving || createMut.isPending || updateMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingId ? (
                  'Atualizar'
                ) : (
                  'Guardar'
                )}
              </Button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(cancelId)} onOpenChange={() => setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar compromisso?</AlertDialogTitle>
            <AlertDialogDescription>
              O registo mantém-se no CRM como cancelado. Se existir evento no Google, deixará de estar ativo lá também.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelId) cancelMut.mutate(cancelId);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
