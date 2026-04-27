import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarClock,
  CalendarDays,
  ExternalLink,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  User,
  Video,
} from 'lucide-react';
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

function syncBadge(ap: Appointment) {
  if (ap.status === 'cancelled') {
    return { label: 'Cancelado', variant: 'secondary' as const };
  }
  if (ap.create_google_event && ap.sync_status === 'synced') {
    return { label: 'Google', variant: 'default' as const };
  }
  if (ap.create_google_event && ap.sync_status === 'error') {
    return { label: 'Erro no Google', variant: 'destructive' as const };
  }
  if (ap.create_google_event) {
    return { label: 'Pendente / local', variant: 'outline' as const };
  }
  return { label: 'Apenas CRM', variant: 'secondary' as const };
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

  const dateFromIso = useMemo(() => format(dateFrom, "yyyy-MM-dd") + 'T00:00:00.000Z', [dateFrom]);
  const dateToIso = useMemo(() => format(dateTo, "yyyy-MM-dd") + 'T23:59:59.999Z', [dateTo]);

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
    if (searchParams.get('new') === '1' && canCreateA) {
      setEditingId(null);
      setEditingRow(null);
      setForm(buildEmptyForm(user?.id));
      setSheetOpen(true);
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete('new');
          return n;
        },
        { replace: true },
      );
    }
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
        <Alert className="border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/20">
          <CalendarClock className="h-4 w-4" />
          <AlertTitle>Google Calendar</AlertTitle>
          <AlertDescription className="text-sm">
            Conecte a sua conta em{' '}
            <Link to="/settings?section=googleCalendar" className="font-medium underline underline-offset-2">
              Configurações
            </Link>{' '}
            para sincronizar compromissos e criar reuniões com Meet.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 rounded-lg border border-border/80 bg-card/30 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="space-y-1.5">
          <Label>De</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                {format(dateFrom, 'P', { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} locale={ptBR} />
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
              <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} locale={ptBR} />
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

      {listLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar…
        </div>
      ) : grouped.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Não há compromissos neste período.</p>
            {canCreateA ? <Button onClick={openNew}>Criar o primeiro compromisso</Button> : null}
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
                  const sb = syncBadge(ap);
                  const canRowEdit = canEditA && canEditAgendaItem(user?.id, ap, ownOnly);
                  return (
                    <li key={ap.id}>
                      <Card className="overflow-hidden transition-colors hover:bg-muted/30">
                        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm text-muted-foreground">
                                {format(parseISO(ap.starts_at), 'HH:mm')} – {format(parseISO(ap.ends_at), 'HH:mm')}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {TYPE_OPTIONS.find((t) => t.value === ap.type)?.label ?? ap.type}
                              </Badge>
                              <Badge variant={sb.variant} className="text-xs">
                                {sb.label}
                              </Badge>
                            </div>
                            <p className="font-medium leading-tight">{ap.title}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              {ap.client_name ? (
                                <span className="inline-flex items-center gap-1">
                                  <User className="h-3 w-3" /> {ap.client_name}
                                </span>
                              ) : null}
                              {ap.lead_name && !ap.client_name ? (
                                <span className="inline-flex items-center gap-1">
                                  <User className="h-3 w-3" /> Lead: {ap.lead_name}
                                </span>
                              ) : null}
                              {ap.responsible_name ? <span>Resp.: {ap.responsible_name}</span> : null}
                            </div>
                            {ap.sync_error && ap.sync_status === 'error' ? (
                              <p className="text-xs text-destructive/90">Erro: {ap.sync_error}</p>
                            ) : null}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {ap.google_meet_link ? (
                                <a
                                  href={ap.google_meet_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"
                                >
                                  <Video className="h-3.5 w-3.5" />
                                  Abrir Meet
                                </a>
                              ) : null}
                              {ap.google_html_link ? (
                                <a
                                  href={ap.google_html_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Google Calendar
                                </a>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                            {ap.sync_status === 'error' && ap.create_google_event && canRowEdit ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 gap-1"
                                onClick={() => retryMut.mutate(ap.id)}
                                disabled={retryMut.isPending}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Retentar sincronização
                              </Button>
                            ) : null}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
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
