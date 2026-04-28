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
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, MapPin, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { fetchNeBootstrap } from '@/services/notificationsEngineTenant';
import {
  type Appointment,
  type AppointmentOutcome,
  type AppointmentAttendee,
  listAppointments,
  getAppointmentConflicts,
  getAppointment,
  createAppointment,
  completeAppointment,
  updateAppointment,
  cancelAppointment,
  cancelAppointmentThisAndFollowing,
  cancelRecurrenceSeries,
  patchAppointmentThisAndFollowing,
  patchRecurrenceSeries,
  rescheduleAppointment,
  setAppointmentAttendance,
  requestAppointmentConfirmation,
} from '@/services/appointments';
import { getGoogleCalendarStatus } from '@/services/googleCalendarIntegration';
import { ClientSearchCombobox } from '@/components/clients/ClientSearchCombobox';
import { LeadSearchCombobox } from '@/components/leads/LeadSearchCombobox';
import { useIsMobile } from '@/hooks/use-mobile';
import { AgendaListView } from './components/AgendaListView';
import { AgendaWeekView } from './components/AgendaWeekView';
import { AgendaMonthView } from './components/AgendaMonthView';
import { AgendaReportsView } from './components/AgendaReportsView';
import {
  QK_APPOINTMENTS,
  QK_GCAL_STATUS,
  TYPE_OPTIONS,
  appointmentAttendanceBadgeClass,
  appointmentAttendanceLabel,
  type DateRangePreset,
  type AgendaLayoutMode,
  canEditAgendaItem,
} from './agendaConstants';

const QK_G = QK_GCAL_STATUS;

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

type AttForm = { name: string; email: string; phone: string };
type CompleteForm = {
  completionNotes: string;
  outcome: AppointmentOutcome;
  createFollowUp: boolean;
  followUpDay: Date;
  followUpStart: string;
  followUpEnd: string;
  sendClientMessage: boolean;
};

const OUTCOME_OPTIONS: { value: AppointmentOutcome; label: string }[] = [
  { value: 'success', label: 'Sucesso' },
  { value: 'no_show', label: 'Não compareceu' },
  { value: 'rescheduled', label: 'Remarcado' },
  { value: 'needs_follow_up', label: 'Precisa follow-up' },
  { value: 'lost', label: 'Perdido' },
  { value: 'other', label: 'Outro' },
];

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
  rem10: true,
  rem30: false,
  rem60: true,
  rem1440: false,
  recurrenceFrequency: 'none' as 'none' | 'weekly' | 'monthly' | 'weekdays',
  recurrenceInterval: 1,
  recurrenceWeekdays: [] as number[],
  recurrenceUntil: '',
  recurrenceMaxOccurrences: '',
  sendReminderToClient: false,
  requestConfirmationOnCreate: false,
  attendees: [] as AttForm[],
});

const buildCompleteForm = (baseStartIso?: string): CompleteForm => {
  const d = baseStartIso ? parseISO(baseStartIso) : new Date();
  const day = Number.isNaN(d.getTime()) ? new Date() : d;
  return {
    completionNotes: '',
    outcome: 'success',
    createFollowUp: false,
    followUpDay: day,
    followUpStart: '09:00',
    followUpEnd: '09:30',
    sendClientMessage: false,
  };
};

export default function Agenda() {
  const { user } = useAuth();
  const { canCreate, canEdit, isEditOwnOnly } = useModulePermissions();
  const hasAgenda = useFeatureFlag('agenda');
  const canCreateA = canCreate('agenda');
  const canEditA = canEdit('agenda');
  const ownOnly = isEditOwnOnly('agenda');
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const clientIdFromQuery = useMemo(() => {
    const c = searchParams.get('client_id');
    if (c && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c)) {
      return c;
    }
    return undefined;
  }, [searchParams]);

  const clearClientFilter = useCallback(() => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete('client_id');
        return n;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const [datePreset, setDatePreset] = useState<DateRangePreset>('week');
  const [dateFrom, setDateFrom] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dateTo, setDateTo] = useState(() => endOfWeek(new Date(), { weekStartsOn: 1 }));
  const [responsibleFilter, setResponsibleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [confirmationFilter, setConfirmationFilter] = useState<
    '' | 'pending' | 'confirmed' | 'not_confirmed' | 'needs_reschedule' | 'declined' | 'no_show'
  >(() => {
    const v = searchParams.get('confirmation_status');
    if (
      v === 'pending' ||
      v === 'confirmed' ||
      v === 'not_confirmed' ||
      v === 'needs_reschedule' ||
      v === 'declined' ||
      v === 'no_show'
    ) {
      return v;
    }
    return '';
  });
  const [pendingRescheduleFromQuery, setPendingRescheduleFromQuery] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  /** Modo criação: null. Edição/visualização: id do compromisso. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<Appointment | null>(null);
  const [form, setForm] = useState(() => buildEmptyForm(user?.id));
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelScope, setCancelScope] = useState<'single' | 'following' | 'series'>('single');
  const [editScopeOpen, setEditScopeOpen] = useState(false);
  const [pendingSaveScope, setPendingSaveScope] = useState<'single' | 'following' | 'series'>('single');
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleMode, setRescheduleMode] = useState<'tomorrow' | 'next_week' | 'custom'>('tomorrow');
  const [rescheduleDay, setRescheduleDay] = useState<Date>(new Date());
  const [rescheduleStart, setRescheduleStart] = useState('09:00');
  const [rescheduleEnd, setRescheduleEnd] = useState('10:00');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [attendanceNote, setAttendanceNote] = useState('');
  const [rescheduleConflict, setRescheduleConflict] = useState<{
    loading: boolean;
    hasConflict: boolean;
    items: Array<{ id: string; title: string; starts_at: string; ends_at: string }>;
  }>({ loading: false, hasConflict: false, items: [] });
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeForm, setCompleteForm] = useState<CompleteForm>(() => buildCompleteForm());
  const [conflictState, setConflictState] = useState<{
    loading: boolean;
    hasConflict: boolean;
    items: Array<{ id: string; title: string; starts_at: string; ends_at: string }>;
  }>({ loading: false, hasConflict: false, items: [] });
  const [saving, setSaving] = useState(false);
  const [layoutMode, setLayoutMode] = useState<AgendaLayoutMode>('list');
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const isMobile = useIsMobile();
  const agendaTab = searchParams.get('tab') === 'reports' ? 'reports' : 'calendar';

  const { data: gStatus } = useQuery({
    queryKey: QK_G,
    queryFn: getGoogleCalendarStatus,
    staleTime: 60_000,
  });
  const { data: notificationsBootstrap } = useQuery({
    queryKey: ['notifications-engine', 'bootstrap'],
    queryFn: async () => {
      const r = await fetchNeBootstrap();
      return r.data ?? null;
    },
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

  const rangeIso = useMemo(() => {
    if (layoutMode === 'list') {
      return { from: startOfDay(dateFrom).toISOString(), to: endOfDay(dateTo).toISOString() };
    }
    if (layoutMode === 'week') {
      const ws = startOfWeek(calendarWeekStart, { weekStartsOn: 1 });
      const we = endOfWeek(calendarWeekStart, { weekStartsOn: 1 });
      return { from: startOfDay(ws).toISOString(), to: endOfDay(we).toISOString() };
    }
    const ms = startOfMonth(calendarMonth);
    const me = endOfMonth(calendarMonth);
    const gridStart = startOfWeek(ms, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(me, { weekStartsOn: 1 });
    return { from: startOfDay(gridStart).toISOString(), to: endOfDay(gridEnd).toISOString() };
  }, [layoutMode, dateFrom, dateTo, calendarWeekStart, calendarMonth]);

  const listParams = useMemo(
    () => ({
      date_from: rangeIso.from,
      date_to: rangeIso.to,
      responsible_user_id: responsibleFilter || undefined,
      client_id: clientIdFromQuery,
      status: statusFilter || undefined,
      type: typeFilter || undefined,
      confirmation_status: confirmationFilter || undefined,
      limit: 400,
      offset: 0,
    }),
    [rangeIso, responsibleFilter, clientIdFromQuery, statusFilter, typeFilter, confirmationFilter],
  );

  const { data: listData, isPending: listLoading } = useQuery({
    queryKey: [...QK_APPOINTMENTS, 'list', listParams],
    queryFn: () => listAppointments(listParams),
    enabled: hasAgenda,
  });
  const items = listData?.items ?? [];

  const calendarTitle = useMemo(() => {
    if (layoutMode === 'week') {
      const a = startOfWeek(calendarWeekStart, { weekStartsOn: 1 });
      const b = endOfWeek(calendarWeekStart, { weekStartsOn: 1 });
      if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
        return `Semana de ${format(a, 'd')} a ${format(b, "d 'de' MMMM yyyy", { locale: ptBR })}`;
      }
      return `Semana de ${format(a, "d 'de' MMM", { locale: ptBR })} a ${format(b, "d 'de' MMMM yyyy", { locale: ptBR })}`;
    }
    if (layoutMode === 'month') {
      return format(startOfMonth(calendarMonth), "MMMM 'de' yyyy", { locale: ptBR });
    }
    return '';
  }, [layoutMode, calendarWeekStart, calendarMonth]);

  const onCalendarToday = useCallback(() => {
    const n = new Date();
    if (layoutMode === 'week') {
      setCalendarWeekStart(startOfWeek(n, { weekStartsOn: 1 }));
    } else {
      setCalendarMonth(startOfMonth(n));
    }
  }, [layoutMode]);

  const onCalendarPrev = useCallback(() => {
    if (layoutMode === 'week') {
      setCalendarWeekStart((prev) => addWeeks(startOfDay(prev), -1));
    } else {
      setCalendarMonth((prev) => addMonths(startOfDay(prev), -1));
    }
  }, [layoutMode]);

  const onCalendarNext = useCallback(() => {
    if (layoutMode === 'week') {
      setCalendarWeekStart((prev) => addWeeks(startOfDay(prev), 1));
    } else {
      setCalendarMonth((prev) => addMonths(startOfDay(prev), 1));
    }
  }, [layoutMode]);

  const isCancelled = editingRow?.status === 'cancelled';
  const canMutate = useMemo(() => {
    if (isCancelled) return false;
    if (!editingId) return canCreateA;
    if (!editingRow) return false;
    return canEditA && canEditAgendaItem(user?.id, editingRow, ownOnly);
  }, [isCancelled, editingId, editingRow, canCreateA, canEditA, ownOnly, user?.id]);

  const formDisabled = !canMutate;
  const canConcludeCurrent =
    Boolean(editingId) &&
    Boolean(editingRow) &&
    editingRow?.status === 'scheduled' &&
    canMutate;
  const cancelTarget = useMemo(
    () => (cancelId ? items.find((x) => x.id === cancelId) ?? (editingRow?.id === cancelId ? editingRow : null) : null),
    [cancelId, items, editingRow],
  );
  const rescheduleProposed = useMemo(() => {
    if (!editingRow) return null;
    const s = parseISO(editingRow.starts_at);
    const e = parseISO(editingRow.ends_at);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    if (rescheduleMode === 'tomorrow') {
      const ns = new Date(s);
      const ne = new Date(e);
      ns.setDate(ns.getDate() + 1);
      ne.setDate(ne.getDate() + 1);
      return { startsAt: ns.toISOString(), endsAt: ne.toISOString() };
    }
    if (rescheduleMode === 'next_week') {
      const ns = new Date(s);
      const ne = new Date(e);
      ns.setDate(ns.getDate() + 7);
      ne.setDate(ne.getDate() + 7);
      return { startsAt: ns.toISOString(), endsAt: ne.toISOString() };
    }
    return {
      startsAt: localToIso(rescheduleDay, rescheduleStart),
      endsAt: localToIso(rescheduleDay, rescheduleEnd),
    };
  }, [editingRow, rescheduleMode, rescheduleDay, rescheduleStart, rescheduleEnd]);

  const openRescheduleModal = useCallback(
    (reasonPreset?: string) => {
      if (!editingRow) return;
      const s = parseISO(editingRow.starts_at);
      const e = parseISO(editingRow.ends_at);
      setRescheduleMode('tomorrow');
      setRescheduleReason(reasonPreset ?? '');
      setRescheduleDay(Number.isNaN(s.getTime()) ? new Date() : s);
      setRescheduleStart(Number.isNaN(s.getTime()) ? '09:00' : format(s, 'HH:mm'));
      setRescheduleEnd(Number.isNaN(e.getTime()) ? '10:00' : format(e, 'HH:mm'));
      setRescheduleOpen(true);
    },
    [editingRow],
  );

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
    setAttendanceNote('');
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
          rem10: mins.has(10) || mins.has(15),
          rem30: mins.has(30),
          rem60: mins.has(60),
          rem1440: mins.has(1440),
          recurrenceFrequency: 'none',
          recurrenceInterval: 1,
          recurrenceWeekdays: [],
          recurrenceUntil: '',
          recurrenceMaxOccurrences: '',
          sendReminderToClient: row.send_reminder_to_client === true,
          requestConfirmationOnCreate: false,
          attendees: (row.attendees ?? []).map((x: AppointmentAttendee) => ({
            name: x.name ?? '',
            email: x.email ?? '',
            phone: x.phone ?? '',
          })),
        });
        setAttendanceNote(row.attendance_note ?? '');
        setSheetOpen(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao carregar');
      }
    },
    [],
  );

  useEffect(() => {
    const raw = searchParams.get('appointment_id');
    const action = searchParams.get('action');
    if (!raw || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
      return;
    }
    if (!hasAgenda) return;
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete('appointment_id');
        n.delete('action');
        return n;
      },
      { replace: true },
    );
    if (action === 'reschedule') {
      setPendingRescheduleFromQuery(true);
    }
    void openDetail(raw);
  }, [searchParams, hasAgenda, setSearchParams, openDetail]);

  useEffect(() => {
    if (!pendingRescheduleFromQuery || !editingRow || !sheetOpen) return;
    openRescheduleModal('Cliente solicitou remarcação pelo link de confirmação.');
    setPendingRescheduleFromQuery(false);
  }, [pendingRescheduleFromQuery, editingRow, sheetOpen, openRescheduleModal]);

  const closeSheet = useCallback((o: boolean) => {
    setSheetOpen(o);
    if (!o) {
      setEditingId(null);
      setEditingRow(null);
      setAttendanceNote('');
    }
  }, []);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QK_APPOINTMENTS });
  }, [queryClient]);

  const onLayoutModeChange = useCallback(
    (mode: AgendaLayoutMode) => {
      setLayoutMode(mode);
      if (mode === 'week') {
        setCalendarWeekStart(startOfWeek(dateFrom, { weekStartsOn: 1 }));
      } else if (mode === 'month') {
        setCalendarMonth(startOfMonth(dateFrom));
      }
    },
    [dateFrom],
  );

  const openNewWithDateTime = useCallback(
    (day: Date, timeStart: string, timeEnd: string) => {
      if (!canCreateA) return;
      setEditingId(null);
      setEditingRow(null);
      setForm({ ...buildEmptyForm(user?.id), day: startOfDay(day), timeStart, timeEnd });
      setSheetOpen(true);
    },
    [canCreateA, user?.id],
  );

  const onShowDayList = useCallback((d: Date) => {
    setLayoutMode('list');
    setDateFrom(startOfDay(d));
    setDateTo(endOfDay(d));
    setDatePreset('custom');
  }, []);

  const onOpenNewDayDefault = useCallback(
    (d: Date) => {
      openNewWithDateTime(d, '09:00', '10:00');
    },
    [openNewWithDateTime],
  );

  function showConfirmationDispatchToast(
    dispatch:
      | {
          ok: boolean;
          status: 'sent' | 'skipped' | 'failed';
          reason?: string;
          delivery_id?: string | null;
        }
      | undefined,
  ) {
    if (dispatch?.status === 'sent') {
      toast.success('Solicitação de confirmação enviada via WhatsApp.');
      return;
    }
    if (dispatch?.status === 'skipped') {
      toast.warning('Essa notificação está desativada nas configurações.');
      return;
    }
    const reason = dispatch?.reason;
    const map: Record<string, string> = {
      missing_client_phone: 'Cliente/lead sem telefone válido.',
      invalid_phone: 'Telefone inválido para WhatsApp.',
      missing_whatsapp_sender: 'Nenhuma instância WhatsApp conectada para envio.',
      notifications_engine_disabled: 'Motor de notificações desativado.',
      business_events_disabled: 'Eventos automáticos desativados.',
      event_key_not_allowed: 'Evento não permitido pela configuração.',
      tenant_not_allowed: 'Tenant não habilitado para este envio.',
      whatsapp_dispatch_failed: 'Falha no envio WhatsApp.',
    };
    toast.warning(map[reason ?? ''] ?? 'Não foi possível enviar a solicitação de confirmação.');
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const start = localToIso(form.day, form.timeStart);
      const end = localToIso(form.day, form.timeEnd);
      if (new Date(end) <= new Date(start)) throw new Error('A hora de fim deve ser depois do início');
      const rems: { method: 'popup'; minutes: number }[] = [];
      if (form.rem10) rems.push({ method: 'popup', minutes: 10 });
      if (form.rem30) rems.push({ method: 'popup', minutes: 30 });
      if (form.rem60) rems.push({ method: 'popup', minutes: 60 });
      if (form.rem1440) rems.push({ method: 'popup', minutes: 1440 });
      const recurrence =
        form.recurrenceFrequency === 'none'
          ? null
          : {
              frequency: form.recurrenceFrequency,
              interval: form.recurrenceFrequency === 'monthly' || form.recurrenceFrequency === 'weekdays' ? 1 : Math.max(1, form.recurrenceInterval || 1),
              weekdays:
                form.recurrenceFrequency === 'weekly'
                  ? form.recurrenceWeekdays.length > 0
                    ? form.recurrenceWeekdays
                    : [((form.day.getDay() || 7) as number)]
                  : undefined,
              until: form.recurrenceUntil || undefined,
              max_occurrences: form.recurrenceMaxOccurrences ? Number(form.recurrenceMaxOccurrences) : undefined,
            };
      const created = await createAppointment({
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
        reminders: rems,
        send_reminder_to_client: form.sendReminderToClient,
        recurrence,
      });
      const hasRecipient = (form.link === 'client' && Boolean(form.clientId)) || (form.link === 'lead' && Boolean(form.leadId));
      return {
        row: created,
        requestConfirmationAfterCreate: form.requestConfirmationOnCreate === true && hasRecipient,
      };
    },
    onSuccess: async ({
      row,
      requestConfirmationAfterCreate,
    }: {
      row: Appointment & { recurrence_created_count?: number; recurrence_warnings?: string[] };
      requestConfirmationAfterCreate: boolean;
    }) => {
      if ((row.recurrence_created_count ?? 1) > 1) {
        toast.success(`Série criada com ${row.recurrence_created_count} ocorrências.`);
      } else {
      toast.success('Compromisso criado');
      }
      if (row.recurrence_warnings?.length) {
        toast.warning(`${row.recurrence_warnings.length} aviso(s) de conflito/sincronização na série.`);
      }
      closeSheet(false);
      invalidate();
      if (requestConfirmationAfterCreate) {
        try {
          const confirmationRow = await requestAppointmentConfirmation(row.id, { note: null });
          showConfirmationDispatchToast(confirmationRow.confirmation_dispatch);
          await queryClient.invalidateQueries({ queryKey: ['clients'] });
        } catch (e) {
          toast.warning(e instanceof Error ? e.message : 'Não foi possível solicitar confirmação via WhatsApp.');
        }
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  const updateMut = useMutation({
    mutationFn: async (scope: 'single' | 'following' | 'series') => {
      if (!editingId) throw new Error();
      const start = localToIso(form.day, form.timeStart);
      const end = localToIso(form.day, form.timeEnd);
      if (new Date(end) <= new Date(start)) throw new Error('A hora de fim deve ser depois do início');
      const rems: { method: 'popup'; minutes: number }[] = [];
      if (form.rem10) rems.push({ method: 'popup', minutes: 10 });
      if (form.rem30) rems.push({ method: 'popup', minutes: 30 });
      if (form.rem60) rems.push({ method: 'popup', minutes: 60 });
      if (form.rem1440) rems.push({ method: 'popup', minutes: 1440 });
      const sharedPatch = {
        title: form.title.trim(),
        description: form.description || null,
        type: form.type,
        responsible_user_id: form.responsibleId || null,
        location: form.location || null,
        reminders: rems,
        send_reminder_to_client: form.sendReminderToClient,
      };
      if (scope === 'series' && editingRow?.recurrence_series_id) {
        return patchRecurrenceSeries(editingRow.recurrence_series_id, sharedPatch);
      }
      if (scope === 'following') {
        return patchAppointmentThisAndFollowing(editingId, sharedPatch);
      }
      return updateAppointment(editingId, {
        ...sharedPatch,
        client_id: form.link === 'client' ? form.clientId : null,
        lead_id: form.link === 'lead' ? form.leadId : null,
        starts_at: start,
        ends_at: end,
        create_meet: form.createMeet,
        attendees: form.attendees
          .filter((a) => a.name?.trim() || a.email?.trim() || a.phone?.trim())
          .map((a) => ({ name: a.name, email: a.email || null, phone: a.phone || null, attendee_type: 'external' })),
      });
    },
    onSuccess: (res, scope) => {
      if (scope === 'single') {
      toast.success('Compromisso atualizado');
      } else {
        const count = typeof (res as { updated_count?: number })?.updated_count === 'number'
          ? (res as { updated_count?: number }).updated_count
          : 0;
        toast.success(`Recorrência atualizada (${count} ocorrência(s)).`);
      }
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
  const cancelFollowingMut = useMutation({
    mutationFn: (id: string) => cancelAppointmentThisAndFollowing(id),
    onSuccess: (r) => {
      toast.success(`Cancelados ${r.cancelled_count} compromisso(s) desta e próximas ocorrências.`);
      setCancelId(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });
  const cancelSeriesMut = useMutation({
    mutationFn: (seriesId: string) => cancelRecurrenceSeries(seriesId),
    onSuccess: (r) => {
      toast.success(`Cancelados ${r.cancelled_count} compromisso(s) da série.`);
      setCancelId(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  const completeMut = useMutation({
    mutationFn: async () => {
      if (!editingId || !editingRow) throw new Error('Compromisso inválido');
      const followStart = completeForm.createFollowUp
        ? localToIso(completeForm.followUpDay, completeForm.followUpStart)
        : null;
      const followEnd = completeForm.createFollowUp
        ? localToIso(completeForm.followUpDay, completeForm.followUpEnd)
        : null;
      if (completeForm.createFollowUp && followStart && followEnd && new Date(followEnd) <= new Date(followStart)) {
        throw new Error('A hora de fim do follow-up deve ser depois do início');
      }
      return completeAppointment(editingId, {
        completion_notes: completeForm.completionNotes || null,
        outcome: completeForm.outcome,
        create_follow_up: completeForm.createFollowUp,
        follow_up_starts_at: followStart,
        follow_up_ends_at: followEnd,
        send_client_message: completeForm.sendClientMessage,
      });
    },
    onSuccess: (row) => {
      toast.success(row.follow_up ? 'Compromisso concluído e follow-up criado.' : 'Compromisso concluído.');
      setCompleteOpen(false);
      setEditingRow(row);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao concluir compromisso'),
  });
  const rescheduleMut = useMutation({
    mutationFn: async () => {
      if (!editingId || !rescheduleProposed) throw new Error('Compromisso inválido');
      if (new Date(rescheduleProposed.endsAt) <= new Date(rescheduleProposed.startsAt)) {
        throw new Error('A hora de fim deve ser depois do início');
      }
      return rescheduleAppointment(editingId, {
        starts_at: rescheduleProposed.startsAt,
        ends_at: rescheduleProposed.endsAt,
        reason: rescheduleReason.trim() || null,
      });
    },
    onSuccess: async (row) => {
      toast.success('Compromisso reagendado');
      setRescheduleOpen(false);
      setEditingRow(row);
      const s = extractLocalDateTime(row.starts_at);
      const e = extractLocalDateTime(row.ends_at);
      setForm((f) => ({ ...f, day: s.date, timeStart: s.time, timeEnd: e.time }));
      invalidate();
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao reagendar'),
  });
  const attendanceMut = useMutation({
    mutationFn: async (status: 'pending' | 'confirmed' | 'not_confirmed' | 'no_show') => {
      if (!editingId) throw new Error('Compromisso inválido');
      return setAppointmentAttendance(editingId, {
        attendance_status: status,
        attendance_note: attendanceNote.trim() || null,
      });
    },
    onSuccess: async (row) => {
      toast.success('Confirmação de presença atualizada');
      setEditingRow(row);
      setAttendanceNote(row.attendance_note ?? '');
      invalidate();
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao atualizar confirmação'),
  });
  const requestConfirmationMut = useMutation({
    mutationFn: async () => {
      if (!editingId) throw new Error('Compromisso inválido');
      return requestAppointmentConfirmation(editingId, { note: attendanceNote.trim() || null });
    },
    onSuccess: async (row) => {
      setEditingRow(row);
      showConfirmationDispatchToast(row.confirmation_dispatch);
      invalidate();
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao solicitar confirmação'),
  });

  const onSave = () => {
    if (!form.title.trim()) {
      toast.error('Indique o título');
      return;
    }
    if (!canMutate) return;
    if (editingId && editingRow?.recurrence_series_id) {
      setPendingSaveScope('single');
      setEditScopeOpen(true);
      return;
    }
    setSaving(true);
    (editingId ? updateMut.mutateAsync('single') : createMut.mutateAsync()).finally(() => setSaving(false));
  };

  const recurrenceWeekdayOptions = useMemo(
    () => [
      { value: 1, label: 'Seg' },
      { value: 2, label: 'Ter' },
      { value: 3, label: 'Qua' },
      { value: 4, label: 'Qui' },
      { value: 5, label: 'Sex' },
      { value: 6, label: 'Sáb' },
      { value: 7, label: 'Dom' },
    ],
    [],
  );

  useEffect(() => {
    if (!sheetOpen || !canMutate) {
      setConflictState({ loading: false, hasConflict: false, items: [] });
      return;
    }
    if (!form.responsibleId || !form.timeStart || !form.timeEnd) {
      setConflictState({ loading: false, hasConflict: false, items: [] });
      return;
    }
    const startsAt = localToIso(form.day, form.timeStart);
    const endsAt = localToIso(form.day, form.timeEnd);
    if (new Date(endsAt) <= new Date(startsAt)) {
      setConflictState({ loading: false, hasConflict: false, items: [] });
      return;
    }

    let active = true;
    setConflictState((prev) => ({ ...prev, loading: true }));
    const timer = setTimeout(() => {
      void getAppointmentConflicts({
        starts_at: startsAt,
        ends_at: endsAt,
        responsible_user_id: form.responsibleId,
        exclude_appointment_id: editingId ?? undefined,
      })
        .then((res) => {
          if (!active) return;
          setConflictState({
            loading: false,
            hasConflict: res.has_conflict === true,
            items: res.conflicts ?? [],
          });
        })
        .catch(() => {
          if (!active) return;
          setConflictState({ loading: false, hasConflict: false, items: [] });
        });
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [sheetOpen, canMutate, form.day, form.timeStart, form.timeEnd, form.responsibleId, editingId]);

  useEffect(() => {
    if (!rescheduleOpen || !editingId || !rescheduleProposed) {
      setRescheduleConflict({ loading: false, hasConflict: false, items: [] });
      return;
    }
    if (!editingRow?.responsible_user_id) {
      setRescheduleConflict({ loading: false, hasConflict: false, items: [] });
      return;
    }
    if (new Date(rescheduleProposed.endsAt) <= new Date(rescheduleProposed.startsAt)) {
      setRescheduleConflict({ loading: false, hasConflict: false, items: [] });
      return;
    }
    let active = true;
    setRescheduleConflict((prev) => ({ ...prev, loading: true }));
    const timer = setTimeout(() => {
      void getAppointmentConflicts({
        starts_at: rescheduleProposed.startsAt,
        ends_at: rescheduleProposed.endsAt,
        responsible_user_id: editingRow.responsible_user_id!,
        exclude_appointment_id: editingId,
      })
        .then((res) => {
          if (!active) return;
          setRescheduleConflict({
            loading: false,
            hasConflict: res.has_conflict === true,
            items: res.conflicts ?? [],
          });
        })
        .catch(() => {
          if (!active) return;
          setRescheduleConflict({ loading: false, hasConflict: false, items: [] });
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [rescheduleOpen, editingId, editingRow?.responsible_user_id, rescheduleProposed]);

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
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Área</span>
          <Button
            type="button"
            size="sm"
            variant={agendaTab === 'calendar' ? 'default' : 'outline'}
            className="h-8"
            onClick={() =>
              setSearchParams((prev) => {
                const n = new URLSearchParams(prev);
                n.delete('tab');
                return n;
              })
            }
          >
            Calendário
          </Button>
          <Button
            type="button"
            size="sm"
            variant={agendaTab === 'reports' ? 'default' : 'outline'}
            className="h-8"
            onClick={() =>
              setSearchParams((prev) => {
                const n = new URLSearchParams(prev);
                n.set('tab', 'reports');
                return n;
              })
            }
          >
            Relatórios
          </Button>
        </div>

        {agendaTab === 'calendar' ? (
          <>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Vista</span>
          <Button
            type="button"
            size="sm"
            variant={layoutMode === 'list' ? 'default' : 'outline'}
            className="h-8"
            onClick={() => onLayoutModeChange('list')}
          >
            Lista
          </Button>
          <Button
            type="button"
            size="sm"
            variant={layoutMode === 'week' ? 'default' : 'outline'}
            className="h-8"
            onClick={() => onLayoutModeChange('week')}
          >
            Semana
          </Button>
          <Button
            type="button"
            size="sm"
            variant={layoutMode === 'month' ? 'default' : 'outline'}
            className="h-8"
            onClick={() => onLayoutModeChange('month')}
          >
            Mês
          </Button>
        </div>

        {layoutMode === 'list' ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">Período</span>
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => goWeek(-1)}
                    aria-label="Semana anterior"
                  >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-0.5 text-xs text-muted-foreground">navegar semana</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => goWeek(1)}
                    aria-label="Próxima semana"
                  >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}
            {datePreset === 'month' ? (
              <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => goMonth(-1)}
                    aria-label="Mês anterior"
                  >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-0.5 text-xs text-muted-foreground">navegar mês</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => goMonth(1)}
                    aria-label="Próximo mês"
                  >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </div>
        </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1">
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={onCalendarToday}>
                Hoje
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onCalendarPrev} aria-label="Anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onCalendarNext} aria-label="Próximo">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-center text-sm font-medium sm:text-right">{calendarTitle}</p>
          </div>
        )}

        <div
          className={cn(
            'grid gap-3',
            layoutMode === 'list' ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5' : 'sm:grid-cols-1 md:grid-cols-3',
          )}
        >
          {layoutMode === 'list' ? (
            <>
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
            </>
          ) : null}
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
          <div className="space-y-1.5">
            <Label>Confirmação</Label>
            <Select
              value={confirmationFilter || '__all__'}
              onValueChange={(v) =>
                setConfirmationFilter(
                  v === '__all__'
                    ? ''
                    : (v as
                        | 'pending'
                        | 'confirmed'
                        | 'not_confirmed'
                        | 'needs_reschedule'
                        | 'declined'
                        | 'no_show'),
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="pending">Aguardando confirmação</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="not_confirmed">Não confirmado</SelectItem>
                <SelectItem value="needs_reschedule">Precisa remarcar</SelectItem>
                <SelectItem value="declined">Recusado</SelectItem>
                <SelectItem value="no_show">Não compareceu</SelectItem>
              </SelectContent>
            </Select>
                          </div>
                            </div>
        {clientIdFromQuery ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border/60 bg-muted/15 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Compromissos filtrados por este cliente</span>
            <Button type="button" variant="secondary" size="sm" className="h-7" onClick={clearClientFilter}>
              Limpar filtro
            </Button>
                            </div>
                            ) : null}
          </>
                              ) : null}
                            </div>

      {agendaTab === 'reports' ? <AgendaReportsView members={members as Array<{ id: string; name: string }>} /> : null}

      {agendaTab === 'calendar' && layoutMode === 'list' ? (
        <AgendaListView
          items={items}
          isLoading={listLoading}
          canCreate={canCreateA}
          onOpenNew={openNew}
          onOpenDetail={(id) => void openDetail(id)}
          onCancel={(id) => {
            setCancelScope('single');
            setCancelId(id);
          }}
          onAfterRetry={invalidate}
          canRowEdit={(ap) => canEditA && canEditAgendaItem(user?.id, ap, ownOnly)}
        />
                            ) : null}
      {agendaTab === 'calendar' && layoutMode === 'week' ? (
        <AgendaWeekView
          weekStart={calendarWeekStart}
          items={items}
          isLoading={listLoading}
          isMobile={!!isMobile}
          onEventClick={(id) => void openDetail(id)}
          onEmptyClick={openNewWithDateTime}
        />
                                ) : null}
      {agendaTab === 'calendar' && layoutMode === 'month' ? (
        <AgendaMonthView
          month={calendarMonth}
          items={items}
          isLoading={listLoading}
          isMobile={!!isMobile}
          onEventClick={(id) => void openDetail(id)}
          onDayEmptyClick={onOpenNewDayDefault}
          onShowDayList={onShowDayList}
          canCreate={canCreateA}
        />
                                ) : null}

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
            {conflictState.hasConflict ? (
              <Alert className="border-amber-300/80 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                <AlertTitle>⚠️ Você já possui outro compromisso neste horário.</AlertTitle>
                <AlertDescription className="space-y-1">
                  {conflictState.items.slice(0, 3).map((c) => {
                    const s = parseISO(c.starts_at);
                    const e = parseISO(c.ends_at);
                    const range =
                      Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())
                        ? 'Horário indisponível'
                        : `${format(s, 'HH:mm')} às ${format(e, 'HH:mm')}`;
                    return (
                      <p key={c.id} className="text-xs">
                        {c.title} — {range}
                      </p>
                    );
                  })}
                </AlertDescription>
              </Alert>
            ) : null}
            {conflictState.loading && !conflictState.hasConflict ? (
              <p className="text-xs text-muted-foreground">A verificar conflito de horário...</p>
            ) : null}

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
                      requestConfirmationOnCreate:
                        v === 'none' ? false : f.requestConfirmationOnCreate,
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

            {!editingId ? (
              <div className="space-y-3 rounded-lg border p-3">
                <div>
                  <Label className="text-sm font-medium">Recorrência</Label>
                  <p className="text-xs text-muted-foreground">Gera ocorrências futuras sem bloquear conflitos.</p>
                </div>
                <div className="space-y-2">
                  <Label>Repetir?</Label>
                  <Select
                    value={form.recurrenceFrequency}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        recurrenceFrequency: v as 'none' | 'weekly' | 'monthly' | 'weekdays',
                        recurrenceWeekdays:
                          v === 'weekly'
                            ? f.recurrenceWeekdays.length > 0
                              ? f.recurrenceWeekdays
                              : [((f.day.getDay() || 7) as number)]
                            : [],
                        recurrenceInterval: v === 'weekly' ? f.recurrenceInterval || 1 : 1,
                      }))
                    }
                    disabled={formDisabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não repetir</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="weekdays">Dias úteis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.recurrenceFrequency === 'weekly' ? (
                  <>
                    <div className="space-y-2">
                      <Label>Intervalo</Label>
                      <Select
                        value={String(form.recurrenceInterval || 1)}
                        onValueChange={(v) => setForm((f) => ({ ...f, recurrenceInterval: Number(v) || 1 }))}
                        disabled={formDisabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Toda semana</SelectItem>
                          <SelectItem value="2">A cada 2 semanas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Dias da semana</Label>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                        {recurrenceWeekdayOptions.map((d) => (
                          <label key={d.value} className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={form.recurrenceWeekdays.includes(d.value)}
                              onCheckedChange={(checked) =>
                                setForm((f) => {
                                  const set = new Set(f.recurrenceWeekdays);
                                  if (checked === true) set.add(d.value);
                                  else set.delete(d.value);
                                  return { ...f, recurrenceWeekdays: [...set].sort((a, b) => a - b) };
                                })
                              }
                              disabled={formDisabled}
                            />
                            <span>{d.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                {form.recurrenceFrequency === 'monthly' ? (
                  <p className="text-xs text-muted-foreground">
                    Repetir no dia {format(form.day, 'd')} de cada mês.
                  </p>
                ) : null}

                {form.recurrenceFrequency !== 'none' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Até data</Label>
                      <Input
                        type="date"
                        value={form.recurrenceUntil}
                        onChange={(e) => setForm((f) => ({ ...f, recurrenceUntil: e.target.value }))}
                        disabled={formDisabled}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nº ocorrências</Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        placeholder="12"
                        value={form.recurrenceMaxOccurrences}
                        onChange={(e) => setForm((f) => ({ ...f, recurrenceMaxOccurrences: e.target.value }))}
                        disabled={formDisabled}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

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
              </>
            ) : null}

            {canMutate && !isCancelled ? (
              <div className="space-y-3 rounded-lg border p-3">
                <div>
                  <Label className="text-sm font-medium">Lembretes</Label>
                  <p className="text-xs text-muted-foreground">Notificações internas no Painel (e Google Agenda, se ativo)</p>
                </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                      id="r10"
                      checked={form.rem10}
                      onCheckedChange={(c) => setForm((f) => ({ ...f, rem10: c === true }))}
                      disabled={formDisabled}
                    />
                    <label htmlFor="r10" className="text-sm">
                      10 minutos antes
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                      id="r60m"
                        checked={form.rem30}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, rem30: c === true }))}
                      disabled={formDisabled}
                      />
                    <label htmlFor="r60m" className="text-sm">
                        30 minutos antes
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                      id="r1h"
                        checked={form.rem60}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, rem60: c === true }))}
                      disabled={formDisabled}
                      />
                    <label htmlFor="r1h" className="text-sm">
                      1 hora antes
                      </label>
                    </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="r1d"
                      checked={form.rem1440}
                      onCheckedChange={(c) => setForm((f) => ({ ...f, rem1440: c === true }))}
                      disabled={formDisabled}
                    />
                    <label htmlFor="r1d" className="text-sm">
                      1 dia antes
                    </label>
                  </div>
                </div>
                <div className="flex items-start space-x-2 border-t pt-3">
                  <Checkbox
                    id="rem-client"
                    checked={form.sendReminderToClient}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, sendReminderToClient: c === true }))}
                    disabled={formDisabled}
                  />
                  <div className="space-y-1">
                    <label htmlFor="rem-client" className="text-sm leading-snug font-medium">
                      Enviar convite e lembretes ao cliente pelo WhatsApp
                    </label>
                    <p className="text-xs text-muted-foreground">
                      O cliente receberá uma mensagem automática quando o compromisso for criado e também nos lembretes selecionados.
                    </p>
                    {notificationsBootstrap && (!notificationsBootstrap.engine_enabled || !notificationsBootstrap.business_events_enabled) ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Para enviar mensagens ao cliente, conecte uma instância WhatsApp e mantenha o motor de notificações ativo.
                      </p>
                    ) : null}
                  </div>
                </div>
                {!editingId ? (
                  <div className="flex items-start space-x-2 border-t pt-3">
                    <Checkbox
                      id="request-confirmation-on-create"
                      checked={form.requestConfirmationOnCreate}
                      onCheckedChange={(c) =>
                        setForm((f) => ({ ...f, requestConfirmationOnCreate: c === true }))
                      }
                      disabled={formDisabled || form.link === 'none'}
                    />
                    <div className="space-y-1">
                      <label htmlFor="request-confirmation-on-create" className="text-sm leading-snug font-medium">
                        Solicitar confirmação de presença pelo WhatsApp após criar
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Envia uma mensagem com link para o cliente confirmar, remarcar ou recusar a presença.
                      </p>
                      {form.link === 'none' ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Selecione um cliente ou lead para habilitar esta opção.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {editingId && editingRow?.status === 'scheduled' ? (
              <div className="space-y-3 rounded-lg border p-3">
                {editingRow.needs_reschedule_task_created_at || editingRow.declined_task_created_at ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-6 items-center rounded-md border border-border/70 bg-muted/20 px-2 text-xs font-medium">
                      Tarefa criada
                    </span>
                    {editingRow.needs_reschedule_task_href || editingRow.declined_task_href ? (
                      <Button type="button" variant="ghost" size="sm" asChild>
                        <Link to={editingRow.needs_reschedule_task_href ?? editingRow.declined_task_href ?? '/tasks'}>
                          Ver tarefa
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {editingRow.public_confirmation_response === 'needs_reschedule' ? (
                  <Alert>
                    <AlertTitle>O cliente informou que precisa remarcar este compromisso.</AlertTitle>
                    <AlertDescription className="space-y-2">
                      {editingRow.attendance_note ? (
                        <p className="text-sm">
                          Mensagem do cliente:
                          <span className="block whitespace-pre-wrap rounded-md border border-border/70 bg-muted/20 p-2 mt-1">
                            "{editingRow.attendance_note}"
                          </span>
                        </p>
                      ) : null}
                      <Button
                        type="button"
                        onClick={() =>
                          openRescheduleModal(
                            'Cliente solicitou remarcação pelo link de confirmação.',
                          )
                        }
                      >
                        Reagendar agora
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Confirmação de presença</Label>
                  <span
                    className={cn(
                      'inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium',
                      appointmentAttendanceBadgeClass(editingRow.attendance_status),
                    )}
                  >
                    {appointmentAttendanceLabel(editingRow.attendance_status)}
                  </span>
                </div>
                {editingRow.recurrence_series_id ? (
                  <p className="text-xs text-muted-foreground">
                    Esta confirmação será aplicada apenas a esta ocorrência.
                  </p>
                ) : null}
                <div className="space-y-2">
                  <Label>Observação</Label>
                  <Textarea
                    rows={2}
                    value={attendanceNote}
                    onChange={(e) => setAttendanceNote(e.target.value)}
                    disabled={attendanceMut.isPending}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => attendanceMut.mutate('confirmed')}
                    disabled={attendanceMut.isPending}
                  >
                    Marcar como confirmado
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => attendanceMut.mutate('not_confirmed')}
                    disabled={attendanceMut.isPending}
                  >
                    Cliente não confirmou
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => attendanceMut.mutate('no_show')}
                    disabled={attendanceMut.isPending}
                  >
                    Não compareceu
                  </Button>
                </div>
                {editingRow.status === 'scheduled' &&
                (editingRow.attendance_status === 'pending' || editingRow.attendance_status === 'not_confirmed') ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const ok = window.confirm('Enviar solicitação de confirmação via WhatsApp para este compromisso?');
                      if (ok) requestConfirmationMut.mutate();
                    }}
                    disabled={requestConfirmationMut.isPending}
                  >
                    {requestConfirmationMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Solicitar confirmação via WhatsApp'
                    )}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {isCancelled ? (
              <p className="text-sm text-muted-foreground">Este compromisso está cancelado e não pode ser editado.</p>
            ) : null}
            {editingRow?.recurrence_series_id ? (
              <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                <p className="font-medium">Parte de uma série recorrente.</p>
                {editingRow.recurrence_occurrence_index ? (
                  <p className="text-xs text-muted-foreground">
                    Ocorrência {editingRow.recurrence_occurrence_index}
                  </p>
                ) : null}
              </div>
            ) : null}
            {editingRow?.status === 'done' ? (
              <div className="space-y-1 rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Resultado:</span>{' '}
                  {OUTCOME_OPTIONS.find((x) => x.value === editingRow.outcome)?.label ?? editingRow.outcome ?? '—'}
                </p>
                {editingRow.completed_at ? (
                  <p>
                    <span className="text-muted-foreground">Concluído em:</span>{' '}
                    {format(parseISO(editingRow.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                ) : null}
                {editingRow.completion_notes ? (
                  <p className="whitespace-pre-wrap">
                    <span className="text-muted-foreground">Resumo:</span> {editingRow.completion_notes}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {canMutate && !isCancelled ? (
            <SheetFooter className="mt-auto gap-2 border-t p-4 sm:flex-col">
              {canConcludeCurrent ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setCompleteForm(buildCompleteForm(editingRow?.starts_at));
                    setCompleteOpen(true);
                  }}
                  disabled={completeMut.isPending}
                >
                  Concluir compromisso
                </Button>
              ) : null}
              {editingId && editingRow?.status === 'scheduled' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    openRescheduleModal();
                  }}
                >
                  Reagendar
                </Button>
              ) : null}
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

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reagendar compromisso</DialogTitle>
            <DialogDescription>Escolha uma opção rápida ou defina data e horário personalizados.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editingRow?.recurrence_series_id ? (
              <Alert>
                <AlertTitle>Série recorrente</AlertTitle>
                <AlertDescription>
                  Este compromisso faz parte de uma série recorrente. O reagendamento será aplicado apenas a esta ocorrência.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label>Opção</Label>
              <Select
                value={rescheduleMode}
                onValueChange={(v) => setRescheduleMode(v as 'tomorrow' | 'next_week' | 'custom')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tomorrow">Amanhã no mesmo horário</SelectItem>
                  <SelectItem value="next_week">Próxima semana no mesmo horário</SelectItem>
                  <SelectItem value="custom">Escolher nova data e horário</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {rescheduleMode === 'custom' ? (
              <>
                <div className="space-y-2">
                  <Label>Nova data</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left">
                        {format(rescheduleDay, 'P', { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={rescheduleDay}
                        onSelect={(d) => d && setRescheduleDay(d)}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nova hora inicial</Label>
                    <Input type="time" value={rescheduleStart} onChange={(e) => setRescheduleStart(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Nova hora final</Label>
                    <Input type="time" value={rescheduleEnd} onChange={(e) => setRescheduleEnd(e.target.value)} />
                  </div>
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Textarea
                rows={3}
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="Ex.: Cliente pediu outro horário"
              />
            </div>

            {rescheduleConflict.hasConflict ? (
              <Alert className="border-amber-300/80 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                <AlertTitle>⚠️ Você já possui outro compromisso neste horário.</AlertTitle>
                <AlertDescription className="space-y-1">
                  {rescheduleConflict.items.slice(0, 3).map((c) => {
                    const s = parseISO(c.starts_at);
                    const e = parseISO(c.ends_at);
                    const range =
                      Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())
                        ? 'Horário indisponível'
                        : `${format(s, 'HH:mm')} às ${format(e, 'HH:mm')}`;
                    return (
                      <p key={c.id} className="text-xs">
                        {c.title} — {range}
                      </p>
                    );
                  })}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRescheduleOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => rescheduleMut.mutate()} disabled={rescheduleMut.isPending}>
              {rescheduleMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar reagendamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Concluir compromisso</DialogTitle>
            <DialogDescription>
              Registe o resumo da reunião e, se necessário, crie o próximo follow-up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="complete-notes">Resumo da reunião</Label>
              <Textarea
                id="complete-notes"
                rows={4}
                value={completeForm.completionNotes}
                onChange={(e) => setCompleteForm((f) => ({ ...f, completionNotes: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Resultado</Label>
              <Select
                value={completeForm.outcome}
                onValueChange={(v) => setCompleteForm((f) => ({ ...f, outcome: v as AppointmentOutcome }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="complete-follow-up"
                checked={completeForm.createFollowUp}
                onCheckedChange={(v) => setCompleteForm((f) => ({ ...f, createFollowUp: v === true }))}
              />
              <label htmlFor="complete-follow-up" className="text-sm">
                Criar próximo follow-up
              </label>
            </div>
            {completeForm.createFollowUp ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 space-y-2">
                  <Label>Dia do follow-up</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        {format(completeForm.followUpDay, 'P', { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={completeForm.followUpDay}
                        onSelect={(d) => d && setCompleteForm((f) => ({ ...f, followUpDay: d }))}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Início</Label>
                  <Input
                    type="time"
                    value={completeForm.followUpStart}
                    onChange={(e) => setCompleteForm((f) => ({ ...f, followUpStart: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fim</Label>
                  <Input
                    type="time"
                    value={completeForm.followUpEnd}
                    onChange={(e) => setCompleteForm((f) => ({ ...f, followUpEnd: e.target.value }))}
                  />
                </div>
              </div>
            ) : null}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="complete-send-client-message"
                checked={completeForm.sendClientMessage}
                onCheckedChange={(v) => setCompleteForm((f) => ({ ...f, sendClientMessage: v === true }))}
              />
              <label htmlFor="complete-send-client-message" className="text-sm">
                Enviar mensagem ao cliente via motor de notificações
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCompleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => completeMut.mutate()}
              disabled={completeMut.isPending}
            >
              {completeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Concluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editScopeOpen} onOpenChange={setEditScopeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar recorrência</DialogTitle>
            <DialogDescription>Este compromisso faz parte de uma série recorrente. O que deseja alterar?</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              type="button"
              variant={pendingSaveScope === 'single' ? 'default' : 'outline'}
              className="w-full justify-start"
              onClick={() => setPendingSaveScope('single')}
            >
              Apenas este compromisso
            </Button>
            <Button
              type="button"
              variant={pendingSaveScope === 'following' ? 'default' : 'outline'}
              className="w-full justify-start"
              onClick={() => setPendingSaveScope('following')}
            >
              Este e próximos compromissos
            </Button>
            <Button
              type="button"
              variant={pendingSaveScope === 'series' ? 'default' : 'outline'}
              className="w-full justify-start"
              onClick={() => setPendingSaveScope('series')}
            >
              Toda a série
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditScopeOpen(false)}>
              Voltar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setEditScopeOpen(false);
                setSaving(true);
                updateMut.mutateAsync(pendingSaveScope).finally(() => setSaving(false));
              }}
              disabled={updateMut.isPending}
            >
              {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(cancelId)}
        onOpenChange={() => {
          setCancelId(null);
          setCancelScope('single');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar compromisso</AlertDialogTitle>
            <AlertDialogDescription>
              O registo mantém-se no CRM como cancelado. Se existir evento no Google, deixará de estar ativo lá também.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelTarget?.recurrence_series_id ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Este compromisso faz parte de uma série recorrente.</p>
              <Button
                type="button"
                variant={cancelScope === 'single' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={() => setCancelScope('single')}
              >
                Apenas este compromisso
              </Button>
              <Button
                type="button"
                variant={cancelScope === 'following' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={() => setCancelScope('following')}
              >
                Este e próximos compromissos
              </Button>
              <Button
                type="button"
                variant={cancelScope === 'series' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={() => setCancelScope('series')}
              >
                Toda a série
              </Button>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!cancelId) return;
                if (cancelScope === 'single' || !cancelTarget?.recurrence_series_id) {
                  cancelMut.mutate(cancelId);
                  return;
                }
                if (cancelScope === 'following') {
                  cancelFollowingMut.mutate(cancelId);
                  return;
                }
                cancelSeriesMut.mutate(cancelTarget.recurrence_series_id);
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
