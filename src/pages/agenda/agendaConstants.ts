import type { Appointment } from '@/services/appointments';

export const QK_APPOINTMENTS = ['appointments'] as const;
export const QK_GCAL_STATUS = ['google-calendar-status'] as const;
export const QK_APPOINTMENT_TYPE_SETTINGS = ['appointments', 'type-settings'] as const;

/** Labels e durações padrão quando a API ainda não carregou ou o tenant não personalizou. */
export const FALLBACK_TYPE_DURATION_MINUTES: Record<string, number> = {
  meeting: 60,
  call: 30,
  demo: 45,
  onboarding: 60,
  support: 30,
  billing: 30,
  follow_up: 30,
  other: 60,
  visit: 60,
};

export const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'meeting', label: 'Reunião' },
  { value: 'call', label: 'Ligação' },
  { value: 'demo', label: 'Demonstração' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'support', label: 'Suporte' },
  { value: 'billing', label: 'Cobrança' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'visit', label: 'Visita' },
  { value: 'other', label: 'Outro' },
];

export const TYPE_ACCENT: Record<string, string> = {
  meeting: 'border-l-violet-400/80 dark:border-l-violet-500/70',
  call: 'border-l-sky-400/80 dark:border-l-sky-500/70',
  demo: 'border-l-amber-400/80 dark:border-l-amber-500/70',
  onboarding: 'border-l-indigo-400/80 dark:border-l-indigo-500/70',
  support: 'border-l-cyan-400/80 dark:border-l-cyan-500/70',
  billing: 'border-l-orange-400/80 dark:border-l-orange-500/70',
  follow_up: 'border-l-teal-400/80 dark:border-l-teal-500/70',
  visit: 'border-l-emerald-400/80 dark:border-l-emerald-500/70',
  other: 'border-l-stone-400/70 dark:border-l-stone-500/60',
};

/** Barra lateral compacta (lista / mês) — cor sólida por tipo. */
export const TYPE_BAR: Record<string, string> = {
  meeting: 'bg-violet-500/85 dark:bg-violet-400/80',
  call: 'bg-sky-500/85 dark:bg-sky-400/80',
  demo: 'bg-amber-500/85 dark:bg-amber-400/80',
  onboarding: 'bg-indigo-500/85 dark:bg-indigo-400/80',
  support: 'bg-cyan-500/85 dark:bg-cyan-400/80',
  billing: 'bg-orange-500/85 dark:bg-orange-400/80',
  follow_up: 'bg-teal-500/85 dark:bg-teal-400/80',
  visit: 'bg-emerald-500/85 dark:bg-emerald-400/80',
  other: 'bg-stone-400/85 dark:bg-stone-500/70',
};

/** Semana: fallback quando ainda não há expediente (7:00–22:59 na grelha). */
export const WEEK_VIEW_FALLBACK_HOUR_START = 7;
export const WEEK_VIEW_FALLBACK_HOUR_END = 22;

/** @deprecated use WEEK_VIEW_FALLBACK_HOUR_START — mantido por compat. */
export const WEEK_VIEW_HOUR_START = WEEK_VIEW_FALLBACK_HOUR_START;
/** @deprecated use WEEK_VIEW_FALLBACK_HOUR_END — mantido por compat. */
export const WEEK_VIEW_HOUR_END = WEEK_VIEW_FALLBACK_HOUR_END;

export type DateRangePreset = 'today' | 'week' | 'month' | 'custom';
export type AgendaLayoutMode = 'list' | 'week' | 'month';

/** Soma minutos a um horário `HH:mm` local. */
export function addMinutesToTimeHHmm(timeHHmm: string, addMinutes: number): string {
  const [h, m] = timeHHmm.split(':').map((x) => parseInt(x, 10) || 0);
  const d = new Date(2000, 0, 1, h, m, 0, 0);
  d.setMinutes(d.getMinutes() + addMinutes);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function appointmentStatusLabel(status: string): string {
  if (status === 'done') return 'Concluído';
  if (status === 'cancelled') return 'Cancelado';
  return 'Agendado';
}

export function appointmentAttendanceLabel(att: string | null | undefined): string {
  if (att === 'confirmed') return 'Confirmado';
  if (att === 'not_confirmed') return 'Não confirmado';
  if (att === 'no_show') return 'Não compareceu';
  return 'Aguardando confirmação';
}

export function appointmentAttendanceBadgeClass(att: string | null | undefined): string {
  if (att === 'confirmed') return 'border-emerald-300/70 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200';
  if (att === 'not_confirmed') return 'border-amber-300/70 bg-amber-50/70 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200';
  if (att === 'no_show') return 'border-rose-300/70 bg-rose-50/70 text-rose-900 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-200';
  return 'border-border/80 bg-card text-muted-foreground';
}

export function appointmentPublicConfirmationLabel(
  response: 'confirmed' | 'needs_reschedule' | 'declined' | null | undefined,
): string | null {
  if (response === 'needs_reschedule') return 'Precisa remarcar';
  if (response === 'declined') return 'Cliente recusou';
  return null;
}

export function appointmentPublicConfirmationBadgeClass(
  response: 'confirmed' | 'needs_reschedule' | 'declined' | null | undefined,
): string {
  if (response === 'needs_reschedule') {
    return 'border-amber-300/70 bg-amber-50/70 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200';
  }
  if (response === 'declined') {
    return 'border-slate-300/70 bg-slate-50/70 text-slate-900 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200';
  }
  return 'border-border/80 bg-card text-muted-foreground';
}

export function syncPill(
  ap: Appointment,
): { key: 'google' | 'error' | 'crm'; label: string; className: string } {
  if (ap.create_google_event && ap.sync_status === 'synced') {
    return {
      key: 'google',
      label: 'Google',
      className:
        'border-sky-200/80 bg-sky-50/80 text-sky-900 dark:border-sky-800/50 dark:bg-sky-950/30 dark:text-sky-200',
    };
  }
  if (ap.create_google_event && ap.sync_status === 'error') {
    return {
      key: 'error',
      label: 'Erro',
      className:
        'border-amber-200/80 bg-amber-50/70 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200',
    };
  }
  if (ap.create_google_event) {
    return { key: 'google', label: 'Pendente', className: 'border-border bg-muted/50 text-muted-foreground' };
  }
  return { key: 'crm', label: 'CRM', className: 'border-border/80 bg-card text-muted-foreground' };
}

export function canEditAgendaItem(
  userId: string | undefined,
  ap: Pick<Appointment, 'created_by' | 'responsible_user_id'>,
  isEditOwnOnly: boolean,
): boolean {
  if (!userId) return false;
  if (!isEditOwnOnly) return true;
  return ap.created_by === userId || ap.responsible_user_id === userId;
}
