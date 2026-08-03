/**
 * Calcula dispatch_not_before para notificações transacionais de fatura,
 * com base nas preferências de faturamento do tenant (Fase 4 / Sprint 2).
 *
 * - same_as_generation: envio alinhado a `recurring_generate_time_local` (defesa se a fatura
 *   nascer antes de H — ex. renovação manual); se já passou H no dia local do evento → imediato.
 * - notify separado: adia até `invoice_notify_time_local` no timezone efetivo do tenant.
 */
import {
  getTenantBillingPreferences,
  resolveTenantBillingPreferences,
} from '../tenantBillingPreferencesService.js';

/** Nesta fase, apenas eventos transacionais diretos de fatura cliente. Digest permanece imediato. */
export const TENANT_SCHEDULED_INVOICE_NOTIFICATION_EVENT_KEYS = new Set<string>([
  'invoice.created',
  'invoice.paid',
]);

export type InvoiceDispatchScheduleSource =
  | 'not_applicable'
  | 'immediate_same_as_generation'
  | 'deferred_same_as_generation'
  | 'deferred_notify_time'
  | 'immediate_notify_time_past'
  | 'immediate_missing_notify_time';

export type InvoiceDispatchScheduleResult = {
  dispatchNotBefore: Date | null;
  scheduleSource: InvoiceDispatchScheduleSource;
  timezone_effective: string;
  generate_time_local_effective: string;
  notify_time_local_effective: string | null;
  invoice_notify_same_as_generation: boolean;
  local_ymd: string;
  local_hhmm: string;
};

function localYmdAndHhmmInZone(date: Date, timeZone: string): { ymd: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const ymd = `${m.year}-${m.month}-${m.day}`;
  const hhmm = `${m.hour}:${m.minute}`;
  return { ymd, hhmm };
}

/** Converte um relógio de parede (data local + HH:mm) no IANA tz para instante UTC. */
export function utcInstantForLocalWallClock(ymd: string, hhmm: string, timeZone: string): Date {
  const [y, mo, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const [hh, mm] = hhmm.split(':').map((x) => parseInt(x, 10));
  const wantHh = String(hh).padStart(2, '0');
  const wantMm = String(mm).padStart(2, '0');
  const want = `${wantHh}:${wantMm}`;

  let lo = Date.UTC(y, mo - 1, d, 0, 0, 0, 0) - 48 * 3600 * 1000;
  let hi = Date.UTC(y, mo - 1, d, 0, 0, 0, 0) + 72 * 3600 * 1000;

  const cmp = (t: number): number => {
    const got = localYmdAndHhmmInZone(new Date(t), timeZone);
    const a = `${got.ymd}T${got.hhmm}`;
    const b = `${ymd}T${want}`;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  };

  for (let i = 0; i < 56 && lo <= hi; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const c = cmp(mid);
    if (c === 0) return new Date(mid);
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }

  const sweepLo = Date.UTC(y, mo - 1, d, 0, 0, 0, 0) - 36 * 3600 * 1000;
  const sweepHi = Date.UTC(y, mo - 1, d, 0, 0, 0, 0) + 60 * 3600 * 1000;
  for (let t = sweepLo; t <= sweepHi; t += 60 * 1000) {
    if (cmp(t) === 0) return new Date(t);
  }

  return new Date(Date.UTC(y, mo - 1, d, hh, mm, 0, 0));
}

function emptyScheduleResult(
  partial: Partial<InvoiceDispatchScheduleResult> &
    Pick<InvoiceDispatchScheduleResult, 'scheduleSource'>,
): InvoiceDispatchScheduleResult {
  return {
    dispatchNotBefore: null,
    timezone_effective: partial.timezone_effective ?? 'America/Sao_Paulo',
    generate_time_local_effective: partial.generate_time_local_effective ?? '09:00',
    notify_time_local_effective: partial.notify_time_local_effective ?? null,
    invoice_notify_same_as_generation: partial.invoice_notify_same_as_generation ?? true,
    local_ymd: partial.local_ymd ?? '',
    local_hhmm: partial.local_hhmm ?? '',
    scheduleSource: partial.scheduleSource,
  };
}

/**
 * Resolve se o envio WhatsApp de fatura deve ser imediato ou adiado ao horário local do tenant.
 */
export async function resolveInvoiceTransactionalDispatchSchedule(params: {
  tenantId: string;
  eventKey: string;
  eventOccurredAt: Date | null;
  now?: Date;
}): Promise<InvoiceDispatchScheduleResult> {
  if (!TENANT_SCHEDULED_INVOICE_NOTIFICATION_EVENT_KEYS.has(params.eventKey)) {
    return emptyScheduleResult({ scheduleSource: 'not_applicable' });
  }

  const at = params.eventOccurredAt ?? params.now ?? new Date();
  const nowMs = (params.now ?? new Date()).getTime();
  const row = await getTenantBillingPreferences(params.tenantId);
  const resolved = resolveTenantBillingPreferences(row);
  const local = localYmdAndHhmmInZone(at, resolved.timezone_effective);

  const same = resolved.invoice_notify_same_as_generation_effective;
  const notifyHhmm = same
    ? resolved.recurring_generate_time_local_effective
    : resolved.invoice_notify_time_local_effective;

  const base = {
    timezone_effective: resolved.timezone_effective,
    generate_time_local_effective: resolved.recurring_generate_time_local_effective,
    notify_time_local_effective: resolved.invoice_notify_time_local_effective,
    invoice_notify_same_as_generation: same,
    local_ymd: local.ymd,
    local_hhmm: local.hhmm,
  };

  if (!notifyHhmm) {
    return emptyScheduleResult({ ...base, scheduleSource: 'immediate_missing_notify_time' });
  }

  const targetUtc = utcInstantForLocalWallClock(
    local.ymd,
    notifyHhmm,
    resolved.timezone_effective,
  );

  if (targetUtc.getTime() <= nowMs) {
    return {
      ...base,
      dispatchNotBefore: null,
      scheduleSource: same ? 'immediate_same_as_generation' : 'immediate_notify_time_past',
    };
  }

  return {
    ...base,
    dispatchNotBefore: targetUtc,
    scheduleSource: same ? 'deferred_same_as_generation' : 'deferred_notify_time',
  };
}

/** Compat: só o instante (ou null = imediato). */
export async function resolveInvoiceTransactionalDispatchNotBefore(params: {
  tenantId: string;
  eventKey: string;
  eventOccurredAt: Date | null;
  now?: Date;
}): Promise<Date | null> {
  const r = await resolveInvoiceTransactionalDispatchSchedule(params);
  return r.dispatchNotBefore;
}
