import type { Appointment } from '@/services/appointments';

export const QK_APPOINTMENTS = ['appointments'] as const;
export const QK_GCAL_STATUS = ['google-calendar-status'] as const;

export const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'meeting', label: 'Reunião' },
  { value: 'call', label: 'Chamada' },
  { value: 'visit', label: 'Visita' },
  { value: 'other', label: 'Outro' },
];

export const TYPE_ACCENT: Record<string, string> = {
  meeting: 'border-l-violet-400/80 dark:border-l-violet-500/70',
  call: 'border-l-sky-400/80 dark:border-l-sky-500/70',
  visit: 'border-l-emerald-400/80 dark:border-l-emerald-500/70',
  other: 'border-l-stone-400/70 dark:border-l-stone-500/60',
};

/** Semana: primeiro slot (h) e último (exclusivo) — ex.: 7–23 = 7:00–22:59. */
export const WEEK_VIEW_HOUR_START = 7;
export const WEEK_VIEW_HOUR_END = 22;

export type DateRangePreset = 'today' | 'week' | 'month' | 'custom';
export type AgendaLayoutMode = 'list' | 'week' | 'month';

export function appointmentStatusLabel(status: string): string {
  if (status === 'done') return 'Concluído';
  if (status === 'cancelled') return 'Cancelado';
  return 'Agendado';
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
